/**
 * Practice quizzes made from AI Chat. Questions are saved as real rows, so
 * they appear in Study Packs and on Home and work in the practice screen.
 *
 * Where they go:
 *   1. the pack chosen in the chat, if the request is about it
 *   2. otherwise, the pack whose material best matches the topic, if the
 *      student already uploaded material on it
 *   3. otherwise, a new pack. It gets a small text material behind it, like
 *      every other pack, so it can be deleted from Home like any upload.
 * If the student deleted the pack this chat was last filling, step 2 is
 * skipped: asking again means "make it again", not "put it somewhere else".
 *
 * Up to 50 questions. More than 20 are written in parallel batches, each with
 * its own focus so they don't repeat each other; one call that large would be
 * slow and all-or-nothing.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { embedMany } from "../_shared/ai/gemini.ts";
import { generateJson } from "../_shared/ai/generate.ts";
import {
  clamp,
  conceptRows,
  type GeneratedQuestion,
  type Pack,
  QUESTION_RULES,
  type QuestionSchemas,
  type Quiz,
  questionRows,
  schemasFor,
  topicLookup,
} from "../_shared/packs.ts";
import type { Verdict } from "./guard.ts";

/** Same measurement as core.ts: related passages scored 0.67-0.72, unrelated up to 0.50. */
const EXISTING_MATCH = 0.62;
const MIN_QUESTIONS = 3;
export const MAX_QUESTIONS = 50;
const DEFAULT_QUESTIONS = 5;
/** Most questions one AI call writes. */
const BATCH_SIZE = 20;

/** Gives each batch a different angle, so parallel batches don't overlap. */
const FOCUS = [
  "definitions, key terms and core facts",
  "how and why: causes, processes, relationships and comparisons",
  "applying the ideas to examples, scenarios and problems",
];

type PackRow = { id: string; title: string; material_id: string | null; subject_id: string | null };

export type QuizResult = {
  reply: string;
  followUps: string[];
  quiz: { pack_id: string; pack_title: string; added: number; requested: number; created: boolean; grounded: boolean };
  model: string;
  packId: string;
};

const outputTokensFor = (count: number) => 1_200 + 180 * count;

/** 50 → [17, 17, 16]. */
export function batchSizes(count: number): number[] {
  const n = Math.ceil(count / BATCH_SIZE);
  const base = Math.floor(count / n);
  return Array.from({ length: n }, (_, i) => base + (i < count % n ? 1 : 0));
}

const promptKey = (prompt: string) => prompt.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export async function makeQuiz({ db, userId, verdict, question, chosenPackId, conversationId, history, questionTypes, learner = "", signal }: {
  db: SupabaseClient;
  userId: string;
  verdict: Verdict;
  question: string;
  chosenPackId: string | null;
  conversationId: string;
  history: { role: string; content: string }[];
  /** From Settings -> Study Preferences; null or empty means every type. */
  questionTypes?: string[] | null;
  /** Who the student is (education level, course), from their profile. */
  learner?: string;
  signal: AbortSignal;
}): Promise<QuizResult> {
  const schemas = schemasFor(questionTypes);
  const requested = Number.isFinite(Number(verdict.question_count)) ? Math.round(Number(verdict.question_count)) : 0;
  const count = clamp(verdict.question_count, MIN_QUESTIONS, MAX_QUESTIONS, DEFAULT_QUESTIONS);
  const topic = verdict.quiz_topic?.trim() || question;
  const [[vector], deletedPack] = await Promise.all([
    embedMany([topic], signal),
    lastQuizPackIfDeleted(db, conversationId),
  ]);

  // ── Where the questions go ──────────────────────────────────
  let target: PackRow | null = null;
  if (chosenPackId && verdict.about !== "new_topic") {
    const { data } = await db.from("study_sets").select("id, title, material_id, subject_id").eq("id", chosenPackId).maybeSingle();
    target = data;
  }
  if (!target && !deletedPack) {
    const { data: matches } = await db.rpc("match_material_chunks", {
      query_embedding: JSON.stringify(vector),
      match_count: 1,
      similarity_threshold: EXISTING_MATCH,
    });
    const best = matches?.[0];
    if (best) {
      const { data } = await db.from("study_sets").select("id, title, material_id, subject_id")
        .eq("material_id", best.material_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      target = data;
    }
  }

  const recent = history.slice(-6)
    .map((m) => `${m.role === "user" ? "Student" : "Novi"}: ${m.content.replace(/\s+/g, " ").slice(0, 500)}`)
    .join("\n");

  const result = target
    ? await addToPack({ db, userId, target, topic, count, vector, recent, schemas, learner, signal })
    : await createPack({ db, userId, topic, count, recent, schemas, learner, signal });

  // Say plainly when the quiz isn't the size that was asked for.
  const notes: string[] = [];
  if (requested > MAX_QUESTIONS) notes.push(`I can make up to ${MAX_QUESTIONS} questions at a time, so I made ${MAX_QUESTIONS}.`);
  const short = count - result.quiz.added;
  if (short > 0) {
    notes.push(
      `You asked for ${count}, but part of the quiz couldn't be written this time. Ask for ${short} more and I'll add them to the same pack.`,
    );
  }
  if (deletedPack && result.quiz.created) notes.unshift(`Your earlier pack **${deletedPack}** was deleted, so I started a new one.`);
  if (notes.length) result.reply += `\n\n${notes.join(" ")}`;
  result.quiz.requested = count;
  return result;
}

/**
 * The title of the pack this chat's latest quiz went into, if the student has
 * since deleted it; otherwise null.
 */
async function lastQuizPackIfDeleted(db: SupabaseClient, conversationId: string): Promise<string | null> {
  const { data } = await db.from("chat_messages").select("metadata")
    .eq("conversation_id", conversationId).eq("role", "buddy")
    .order("created_at", { ascending: false }).limit(20);
  const last = (data ?? []).map((m) => m.metadata?.quiz).find((q) => q?.pack_id);
  if (!last) return null;
  const { data: pack } = await db.from("study_sets").select("id").eq("id", last.pack_id).maybeSingle();
  return pack ? null : (last.pack_title ?? "that pack");
}

/**
 * Writes the batches in parallel. Batches that fail are skipped, so one slow
 * model costs some questions, not the whole quiz; throws only if all fail.
 */
async function writeBatches(
  sizes: number[],
  promptFor: (size: number, index: number) => string,
  { signal, alone, schema }: { signal: AbortSignal; alone: boolean; schema: Record<string, unknown> },
): Promise<{ quizzes: Quiz[]; models: string[] }> {
  const settled = await Promise.allSettled(sizes.map((size, i) =>
    generateJson<Quiz>(promptFor(size, i), schema, {
      outputTokens: outputTokensFor(size),
      signal,
      skipGroq: !alone,
    })
  ));
  const quizzes: Quiz[] = [];
  const models: string[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") {
      quizzes.push(s.value.data);
      models.push(s.value.model);
    } else {
      console.log(JSON.stringify({ quiz_batch_failed: s.reason instanceof Error ? s.reason.message : String(s.reason) }));
    }
  }
  if (quizzes.length === 0) {
    const first = settled.find((s) => s.status === "rejected") as PromiseRejectedResult | undefined;
    throw first?.reason ?? new Error("No usable questions came back");
  }
  return { quizzes, models };
}

/** Drops questions that repeat each other or ones already in the pack. */
function unique(questions: GeneratedQuestion[], seen: Set<string>): GeneratedQuestion[] {
  return questions.filter((q) => {
    const key = q?.prompt ? promptKey(q.prompt) : "";
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const focusLine = (index: number, total: number) =>
  total > 1
    ? `This is part ${index + 1} of ${total} of a larger quiz written in parallel. Focus this part on ${FOCUS[index % FOCUS.length]}, so it doesn't overlap the other parts.`
    : "";

async function addToPack({ db, userId, target, topic, count, vector, recent, schemas, learner, signal }: {
  db: SupabaseClient;
  userId: string;
  target: PackRow;
  topic: string;
  count: number;
  vector: number[];
  recent: string;
  schemas: QuestionSchemas;
  learner: string;
  signal: AbortSignal;
}): Promise<QuizResult> {
  const sizes = batchSizes(count);
  const [chunksRes, existingRes, summaryRes] = await Promise.all([
    target.material_id
      ? db.rpc("match_material_chunks", {
        query_embedding: JSON.stringify(vector),
        match_count: Math.min(8 * sizes.length, 24),
        filter_material_id: target.material_id,
        similarity_threshold: 0,
      })
      : Promise.resolve({ data: [] }),
    db.from("questions").select("prompt, position, topics ( name )").eq("study_set_id", target.id)
      .order("position", { ascending: false }).limit(200),
    db.from("summaries").select("content").eq("study_set_id", target.id).limit(1).maybeSingle(),
  ]);

  const chunks = (chunksRes.data ?? []) as { content: string }[];
  // topics is a many-to-one join, so PostgREST returns one object (or null).
  const existing = (existingRes.data ?? []) as unknown as { prompt: string; position: number; topics: { name: string } | null }[];
  const topicNames = [...new Set(existing.map((q) => q.topics?.name).filter(Boolean))];
  const nextPosition = existing.length ? Math.max(...existing.map((q) => q.position ?? 0)) + 1 : 0;
  const summary = summaryRes.data?.content ?? "";
  const grounded = chunks.length > 0 || summary.trim().length > 0;

  // Each batch reads its own share of the passages, which also spreads the
  // questions across the material.
  const materialFor = (index: number) => {
    const share = chunks.filter((_, i) => i % sizes.length === index);
    const picked = share.length ? share : chunks;
    return picked.length ? picked.map((c, i) => `[${i + 1}] ${c.content.trim()}`).join("\n\n") : summary;
  };

  const promptFor = (size: number, index: number) => {
    const material = materialFor(index);
    return [
      `You are writing practice questions for a student's study pack "${target.title}".`,
      `Write exactly ${size} new practice questions about: ${topic}.`,
      focusLine(index, sizes.length),
      "Use difficulty 1-5, mix question types, and test different things. Give each a short explanation.",
      QUESTION_RULES,
      schemas.rule,
      learner,
      material.trim() ? "Only use what the study material below says." : "Base them on the pack's subject.",
      topicNames.length
        ? `Set each question's topic to one of these existing topics when it fits, spelled identically: ${topicNames.map((t) => `"${t}"`).join(", ")}. List any topics you use in topics.`
        : "List 1 to 3 short topic names in topics and set each question's topic to one of them.",
      existing.length ? `\nDo not repeat these existing questions:\n${existing.slice(0, 40).map((q) => `- ${q.prompt.slice(0, 160)}`).join("\n")}` : "",
      recent ? `\nRecent conversation, for context on what they asked:\n${recent}` : "",
      material.trim() ? `\nSTUDY MATERIAL:\n${material.slice(0, 12_000)}` : "",
    ].filter(Boolean).join("\n");
  };

  const { quizzes, models } = await writeBatches(sizes, promptFor, { signal, alone: sizes.length === 1, schema: schemas.quiz });

  const seen = new Set(existing.map((q) => promptKey(q.prompt)));
  const questions = unique(quizzes.flatMap((q) => q.questions ?? []), seen);
  const { topicIdFor } = await topicLookup(db, userId, target.subject_id, quizzes.flatMap((q) => q.topics ?? []));
  const rows = questionRows(questions, { setId: target.id, userId, topicIdFor, startPosition: nextPosition }).slice(0, count);
  if (rows.length === 0) throw new Error("No usable questions came back");
  const { error } = await db.from("questions").insert(rows);
  if (error) throw new Error(`Saving questions failed: ${error.message}`);

  // Moves the pack to the top of "recently updated" lists.
  await db.from("study_sets").update({ updated_at: new Date().toISOString() }).eq("id", target.id);

  return {
    reply: `Done! I added **${rows.length} practice ${rows.length === 1 ? "question" : "questions"}** on ${topic} to your pack **${target.title}**. You'll find them in Study Packs, ready to practise.`,
    followUps: ["Add 5 harder questions", "Explain the first question", "Quiz me on a different topic"],
    quiz: { pack_id: target.id, pack_title: target.title, added: rows.length, requested: count, created: false, grounded },
    model: [...new Set(models)].join(", "),
    packId: target.id,
  };
}

async function createPack({ db, userId, topic, count, recent, schemas, learner, signal }: {
  db: SupabaseClient;
  userId: string;
  topic: string;
  count: number;
  recent: string;
  schemas: QuestionSchemas;
  learner: string;
  signal: AbortSignal;
}): Promise<QuizResult> {
  // The first batch comes with the pack itself (title, summary, topics); any
  // others follow in parallel once those topics are known.
  const [first, ...rest] = batchSizes(count);
  const prompt = [
    "You are creating a small study pack for a student who asked for a practice quiz.",
    `Topic: ${topic}`,
    "Write:",
    `- a short title for the pack, naming the topic (for example "Cell Biology Basics")`,
    "- a clear summary of the topic in markdown, a few short paragraphs",
    `- ${rest.length ? "3 to 5" : "2 to 4"} topics: the distinct sub-topics covered, with short reusable names`,
    "- 4 to 6 key concepts, each with a plain definition and importance 1-5",
    `- exactly ${first} practice questions with difficulty 1-5, spread across the topics, each with a short explanation. ${QUESTION_RULES}`,
    schemas.rule,
    learner,
    rest.length ? `These questions are the first part of a longer quiz: focus them on ${FOCUS[0]}.` : "",
    "Every key concept and every question must set topic to one of the topic names, spelled identically.",
    "Use accurate, widely accepted knowledge suitable for a student.",
    recent ? `\nRecent conversation, for context on what they want:\n${recent}` : "",
  ].filter(Boolean).join("\n");

  const { data: pack, model } = await generateJson<Pack>(prompt, schemas.pack, { outputTokens: outputTokensFor(first) + 600, signal });
  const title = (pack.title?.trim() || `Quiz: ${topic}`).slice(0, 120);
  const summary = pack.summary?.trim() || `Practice questions on ${topic}.`;
  const topicNames = (pack.topics ?? []).map((t) => t?.name?.trim()).filter(Boolean) as string[];

  let extra: Quiz[] = [];
  const models = [model];
  if (rest.length) {
    const firstPrompts = (pack.questions ?? []).map((q) => q?.prompt).filter(Boolean) as string[];
    const promptFor = (size: number, index: number) =>
      [
        `You are adding practice questions to a student's new study pack "${title}" on ${topic}.`,
        `Write exactly ${size} more practice questions.`,
        focusLine(index + 1, rest.length + 1),
        "Use difficulty 1-5, mix question types, and test different things. Give each a short explanation.",
        QUESTION_RULES,
        schemas.rule,
        learner,
        topicNames.length
          ? `Set each question's topic to one of these topics, spelled identically: ${topicNames.map((t) => `"${t}"`).join(", ")}. List the ones you use in topics.`
          : "List 1 to 3 short topic names in topics and set each question's topic to one of them.",
        "Use accurate, widely accepted knowledge suitable for a student.",
        firstPrompts.length ? `\nDo not repeat these questions:\n${firstPrompts.map((p) => `- ${p.slice(0, 160)}`).join("\n")}` : "",
        `\nPACK SUMMARY:\n${summary.slice(0, 6_000)}`,
      ].filter(Boolean).join("\n");
    try {
      const written = await writeBatches(rest, promptFor, { signal, alone: false, schema: schemas.quiz });
      extra = written.quizzes;
      models.push(...written.models);
    } catch (err) {
      // The pack and its first questions are still worth keeping.
      console.log(JSON.stringify({ quiz_extra_failed: err instanceof Error ? err.message : String(err) }));
    }
  }

  // Every pack has a material behind it; this one is the summary itself.
  const { data: material, error: matError } = await db.from("materials").insert({
    user_id: userId,
    title,
    source_type: "text",
    status: "ready",
    extracted_text: summary,
    word_count: summary.split(/\s+/).length,
    processed_at: new Date().toISOString(),
  }).select("id").single();
  if (matError || !material) throw new Error(`Creating the pack failed: ${matError?.message}`);

  const { data: set, error: setError } = await db.from("study_sets").insert({
    user_id: userId,
    material_id: material.id,
    title,
    status: "ready",
    generation_model: model,
    generation_params: { source: "chat", questions_target: count, grounded: false },
  }).select("id").single();
  if (setError || !set) {
    await db.from("materials").delete().eq("id", material.id);
    throw new Error(`Creating the pack failed: ${setError?.message}`);
  }

  await db.from("summaries").insert({ study_set_id: set.id, user_id: userId, kind: "overview", content: summary });
  const { topicIdFor } = await topicLookup(db, userId, null, [...(pack.topics ?? []), ...extra.flatMap((q) => q.topics ?? [])]);
  const concepts = conceptRows(pack.key_concepts, { setId: set.id, userId, topicIdFor });
  if (concepts.length) await db.from("key_concepts").insert(concepts);
  const questions = unique([...(pack.questions ?? []), ...extra.flatMap((q) => q.questions ?? [])], new Set());
  const rows = questionRows(questions, { setId: set.id, userId, topicIdFor }).slice(0, count);
  if (rows.length === 0) {
    await db.from("materials").delete().eq("id", material.id); // cascades to the pack
    throw new Error("No usable questions came back");
  }
  const { error: qError } = await db.from("questions").insert(rows);
  if (qError) {
    await db.from("materials").delete().eq("id", material.id);
    throw new Error(`Saving questions failed: ${qError.message}`);
  }

  return {
    reply:
      `Done! I made a new study pack, **${title}**, with **${rows.length} practice ${rows.length === 1 ? "question" : "questions"}** on ${topic}. ` +
      "It's in Study Packs and on Home now.\n\n" +
      "_These come from general knowledge, not from material you uploaded, so double-check anything important._",
    followUps: ["Add 5 more questions", "Explain the key concepts", "Make the questions harder"],
    quiz: { pack_id: set.id, pack_title: title, added: rows.length, requested: count, created: true, grounded: false },
    model: [...new Set(models)].join(", "),
    packId: set.id,
  };
}
