/**
 * Loading the student's learning data for the pipeline, and the semantic
 * retriever. Every query goes through the caller's client (their JWT), so RLS
 * limits it to their own rows. Queries run in parallel, each bounded, so the
 * cost doesn't grow with a student's whole history.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { CONTEXT, RETRIEVAL } from "./config.ts";
import { similarityToRelevance } from "./retrieval.ts";
import { localDay } from "./rank.ts";
import { keyOf } from "./candidates.ts";
import type { Context, Link, Pack, Retriever, TopicState } from "./types.ts";

const DAY = 86_400_000;
const date = (v: unknown) => (v ? new Date(String(v)) : null);

function check<T>(result: { data: T | null; error: unknown }, what: string): T {
  if (result.error) {
    const message = (result.error as { message?: string }).message ?? String(result.error);
    throw new Error(`Loading ${what} failed: ${message}`);
  }
  return (result.data ?? []) as T;
}

/**
 * The student's context, and a fingerprint of everything that would change
 * the recommendations (new answers, packs, sessions, plans, dismissals, the
 * day). A cached batch with the same fingerprint is still right.
 */
export async function loadContext(
  db: SupabaseClient,
  userId: string,
  now: Date,
  timeZone: string,
): Promise<{ ctx: Context; signature: string }> {
  const since = new Date(now.getTime() - CONTEXT.attemptDays * DAY).toISOString();
  const horizon = new Date(now.getTime() + CONTEXT.planHorizonDays * DAY).toISOString();
  const historySince = new Date(now.getTime() - CONTEXT.historyDays * DAY).toISOString();

  const [mastery, attempts, completion, sets, questions, sessions, plans, history, materials] = await Promise.all([
    db.from("topic_mastery")
      .select("topic_id, mastery_score, evidence, attempts_total, attempts_correct, last_practiced_at, next_review_at, last_incorrect_at, updated_at, topics(name, description, embedded_at)")
      .eq("user_id", userId)
      .limit(500),
    // The question's topic, not the attempt's: the same source mastery uses.
    db.from("question_attempts")
      .select("question_id, is_correct, created_at, questions(topic_id, study_set_id)")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(CONTEXT.attemptLimit),
    db.rpc("progress_pack_completion"),
    db.from("study_sets")
      .select("id, title, material_id, created_at, updated_at")
      .eq("user_id", userId)
      .eq("status", "ready")
      .limit(500),
    db.from("questions")
      .select("study_set_id, topic_id")
      .eq("user_id", userId)
      .not("topic_id", "is", null)
      .limit(5000),
    db.from("study_sessions")
      .select("id, study_set_id, focus_topic_id, questions_answered, target_count, started_at")
      .eq("user_id", userId)
      .is("ended_at", null)
      .not("study_set_id", "is", null)
      .order("started_at", { ascending: false })
      .limit(5),
    db.from("scheduled_sessions")
      .select("id, title, study_set_id, starts_at, session_type, updated_at")
      .eq("user_id", userId)
      .is("completed_at", null)
      .neq("session_type", "break")
      .gte("ends_at", now.toISOString())
      .lte("starts_at", horizon)
      .order("starts_at", { ascending: true })
      .limit(20),
    db.from("recommendations")
      .select("kind, topic_id, study_set_id, status, created_at, updated_at")
      .eq("user_id", userId)
      .gte("created_at", historySince)
      .limit(300),
    db.from("materials").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  // deno-lint-ignore no-explicit-any
  type Row = Record<string, any>;
  const masteryRows = check<Row[]>(mastery, "mastery");
  const attemptRows = check<Row[]>(attempts, "answers");
  const completionRows = check<Row[]>(completion, "pack progress");
  const setRows = check<Row[]>(sets, "packs");
  const questionRows = check<Row[]>(questions, "questions");
  const sessionRows = check<Row[]>(sessions, "sessions");
  const planRows = check<Row[]>(plans, "planned sessions");
  const historyRows = check<Row[]>(history, "recommendation history");
  if (materials.error) throw new Error(`Loading materials failed: ${materials.error.message}`);

  const topics: TopicState[] = masteryRows
    .filter((m) => m.topics) // topic deleted: nothing to recommend about it
    .map((m) => ({
      id: m.topic_id,
      name: String(m.topics.name),
      description: m.topics.description ?? null,
      mastery: Number(m.mastery_score) || 0,
      evidence: Number(m.evidence) || 0,
      attempts: m.attempts_total ?? 0,
      correct: m.attempts_correct ?? 0,
      lastPracticedAt: date(m.last_practiced_at),
      nextReviewAt: date(m.next_review_at),
      lastIncorrectAt: date(m.last_incorrect_at),
      embedded: Boolean(m.topics.embedded_at),
    }));

  const topicQuestions = new Map<string, Record<string, number>>();
  for (const q of questionRows) {
    const counts = topicQuestions.get(q.study_set_id) ?? {};
    counts[q.topic_id] = (counts[q.topic_id] ?? 0) + 1;
    topicQuestions.set(q.study_set_id, counts);
  }
  const completionById = new Map(completionRows.map((c) => [c.study_set_id, c]));
  const packs: Pack[] = setRows.map((s) => {
    const c = completionById.get(s.id);
    return {
      id: s.id,
      title: String(s.title),
      materialId: s.material_id ?? null,
      createdAt: new Date(s.created_at),
      totalQuestions: c?.total_questions ?? 0,
      correctQuestions: c?.correct_questions ?? 0,
      lastPracticedAt: date(c?.last_practiced_at),
      topicQuestions: topicQuestions.get(s.id) ?? {},
    };
  });

  // Key concepts tagged with a practised topic link it to their pack.
  const conceptLinks: Record<string, string[]> = {};
  if (topics.length > 0) {
    const concepts = check<Row[]>(
      await db.from("key_concepts")
        .select("study_set_id, topic_id")
        .eq("user_id", userId)
        .in("topic_id", topics.map((t) => t.id).slice(0, 200))
        .limit(2000),
      "key concepts",
    );
    for (const c of concepts) {
      const list = conceptLinks[c.topic_id] ?? [];
      if (!list.includes(c.study_set_id)) list.push(c.study_set_id);
      conceptLinks[c.topic_id] = list;
    }
  }

  const ctx: Context = {
    now,
    topics,
    attempts: attemptRows.map((a) => ({
      questionId: a.question_id,
      topicId: a.questions?.topic_id ?? null,
      packId: a.questions?.study_set_id ?? null,
      correct: Boolean(a.is_correct),
      at: new Date(a.created_at),
    })),
    packs,
    openSessions: sessionRows.map((s) => ({
      id: s.id,
      packId: s.study_set_id,
      focusTopicId: s.focus_topic_id ?? null,
      answered: s.questions_answered ?? 0,
      target: s.target_count ?? null,
      startedAt: new Date(s.started_at),
    })),
    plans: planRows.map((p) => ({
      id: p.id,
      title: String(p.title),
      packId: p.study_set_id ?? null,
      startsAt: new Date(p.starts_at),
      type: p.session_type,
    })),
    history: historyRows.map((h) => ({
      key: keyOf(h.kind, h.topic_id ?? null, h.study_set_id ?? null),
      status: h.status,
      createdAt: new Date(h.created_at),
      updatedAt: new Date(h.updated_at),
    })),
    conceptLinks,
    materialCount: materials.count ?? 0,
  };

  const latest = (rows: Row[], field: string) =>
    rows.reduce((max, r) => (r[field] && r[field] > max ? r[field] : max), "");
  const fingerprint = [
    localDay(now, timeZone),
    attemptRows[0]?.created_at ?? "",
    latest(masteryRows, "updated_at"),
    setRows.map((s) => `${s.id}:${s.updated_at}`).sort().join(","),
    completionRows.map((c) => `${c.study_set_id}:${c.last_practiced_at ?? ""}`).sort().join(","),
    sessionRows.map((s) => `${s.id}:${s.questions_answered}`).join(","),
    planRows.map((p) => `${p.id}:${p.starts_at}:${p.updated_at}`).join(","),
    historyRows.filter((h) => h.status === "dismissed").length,
    ctx.materialCount,
  ].join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fingerprint));
  const signature = [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");

  return { ctx, signature };
}

/**
 * Semantic retrieval over the student's material. Each topic is embedded once
 * (name, description and the titles of packs it appears in) and the vector is
 * kept on the topic; matching runs in the database (match_topic_material)
 * against the passages already embedded at upload. Only topic names and pack
 * titles are sent for embedding, never answers or scores.
 *
 * Throws when embedding or matching fails; the pipeline then falls back.
 */
export function semanticRetriever(
  db: SupabaseClient,
  embed: (texts: string[]) => Promise<number[][]>,
): Retriever {
  return {
    async related(topics, ctx) {
      const missing = topics.filter((t) => !t.embedded);
      if (missing.length > 0) {
        const texts = missing.map((t) => {
          const packs = ctx.packs.filter((p) => (p.topicQuestions[t.id] ?? 0) > 0).map((p) => p.title).slice(0, 3);
          return [t.name, t.description ?? "", packs.length ? `Studied in: ${packs.join("; ")}` : ""].filter(Boolean).join(". ");
        });
        const vectors = await embed(texts);
        const results = await Promise.all(missing.map((t, i) =>
          db.from("topics")
            .update({ embedding: JSON.stringify(vectors[i]), embedded_at: ctx.now.toISOString() })
            .eq("id", t.id)
        ));
        const failed = results.find((r) => r.error);
        if (failed?.error) throw new Error(`Saving topic embeddings failed: ${failed.error.message}`);
      }

      const { data, error } = await db.rpc("match_topic_material", {
        p_topic_ids: topics.map((t) => t.id),
        p_per_topic: RETRIEVAL.perTopic,
        p_threshold: RETRIEVAL.minSimilarity,
      });
      if (error) throw new Error(`Matching material failed: ${error.message}`);

      const packsByMaterial = new Map<string, string[]>();
      for (const p of ctx.packs) {
        if (!p.materialId) continue;
        packsByMaterial.set(p.materialId, [...(packsByMaterial.get(p.materialId) ?? []), p.id]);
      }
      const links: Link[] = [];
      for (const row of (data ?? []) as { topic_id: string; material_id: string; similarity: number }[]) {
        for (const packId of packsByMaterial.get(row.material_id) ?? []) {
          links.push({ topicId: row.topic_id, packId, relevance: similarityToRelevance(row.similarity), source: "semantic" });
        }
      }
      return links;
    },
  };
}
