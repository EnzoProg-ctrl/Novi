import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { embed, generateJson } from "./gemini.ts";

/**
 * Turns an uploaded material into a study pack.
 *
 * Text files only for now - PDF/PPTX extraction is the messiest part and wants
 * the Python service rather than Deno.
 *
 * Auth: verify_jwt is on, and every database call goes through a client
 * carrying the caller's JWT, so RLS still applies. The service role is used
 * only for ai_model_health, which holds no user data.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const TEXT_TYPES = new Set(["text"]);
const MAX_CHARS = 60_000; // keep one generation call within sane limits

/** Split on blank lines, then pack paragraphs up to a target size with overlap. */
function chunkText(text: string, target = 1400, overlap = 180): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const p of paragraphs) {
    if (current && current.length + p.length + 2 > target) {
      chunks.push(current);
      current = current.slice(-overlap) + "\n\n" + p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current.trim()) chunks.push(current);

  // A file with no blank lines still needs splitting.
  if (chunks.length === 1 && chunks[0].length > target * 1.5) {
    const single = chunks[0];
    const out: string[] = [];
    for (let i = 0; i < single.length; i += target - overlap) {
      out.push(single.slice(i, i + target));
    }
    return out;
  }
  return chunks;
}

const PACK_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    summary: { type: "STRING" },
    // Topics are the unit mastery is tracked against, so questions and concepts
    // both carry a topic name that must match one of these.
    topics: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          description: { type: "STRING" },
        },
        required: ["name"],
      },
    },
    key_concepts: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          term: { type: "STRING" },
          definition: { type: "STRING" },
          importance: { type: "INTEGER" },
          topic: { type: "STRING" },
        },
        required: ["term", "definition"],
      },
    },
    questions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          type: {
            type: "STRING",
            enum: ["multiple_choice", "true_false", "short_answer", "fill_blank", "flashcard"],
          },
          prompt: { type: "STRING" },
          choices: { type: "ARRAY", items: { type: "STRING" } },
          correct_answer: { type: "STRING" },
          explanation: { type: "STRING" },
          difficulty: { type: "INTEGER" },
          topic: { type: "STRING" },
        },
        required: ["type", "prompt", "correct_answer", "difficulty"],
      },
    },
  },
  required: ["title", "summary", "topics", "key_concepts", "questions"],
};

type Pack = {
  title: string;
  summary: string;
  topics: { name: string; description?: string }[];
  key_concepts: { term: string; definition: string; importance?: number; topic?: string }[];
  questions: {
    type: string;
    prompt: string;
    choices?: string[];
    correct_answer: string;
    explanation?: string;
    difficulty: number;
    topic?: string;
  }[];
};

const clamp = (n: unknown, lo: number, hi: number, fallback: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
};

/** Matches the unique index on topics: (user_id, subject_id, lower(btrim(name))). */
const topicKey = (name: string) => name.trim().toLowerCase();

/**
 * Resolves topic names to ids, reusing the student's existing topics.
 *
 * Topics are deliberately shared across packs: two uploads about binary trees
 * should accumulate mastery against one topic, not two. The unique index is on
 * an expression, so it cannot be targeted by an upsert's onConflict - existing
 * rows are read and matched in code instead.
 */
async function resolveTopics(
  db: ReturnType<typeof createClient>,
  userId: string,
  subjectId: string | null,
  names: string[],
): Promise<Map<string, string>> {
  const wanted = [...new Map(
    names
      .map((n) => (n ?? "").trim())
      .filter((n) => n.length > 0 && n.length <= 120)
      .map((n) => [topicKey(n), n]),
  ).values()];

  const map = new Map<string, string>();
  if (wanted.length === 0) return map;

  const base = db.from("topics").select("id, name").eq("user_id", userId);
  const { data: existing } = subjectId
    ? await base.eq("subject_id", subjectId)
    : await base.is("subject_id", null);

  for (const row of existing ?? []) {
    map.set(topicKey(row.name as string), row.id as string);
  }

  const missing = wanted.filter((n) => !map.has(topicKey(n)));
  if (missing.length > 0) {
    const { data: inserted, error } = await db
      .from("topics")
      .insert(missing.map((name) => ({ user_id: userId, subject_id: subjectId, name })))
      .select("id, name");

    if (error) {
      // A concurrent run may have created the same topic; re-read rather than fail
      // the whole pipeline over a naming collision.
      const retry = db.from("topics").select("id, name").eq("user_id", userId);
      const { data: after } = subjectId
        ? await retry.eq("subject_id", subjectId)
        : await retry.is("subject_id", null);
      for (const row of after ?? []) {
        map.set(topicKey(row.name as string), row.id as string);
      }
    } else {
      for (const row of inserted ?? []) {
        map.set(topicKey(row.name as string), row.id as string);
      }
    }
  }

  return map;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  // RLS applies to everything below: this client acts as the calling student.
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );

  const { data: userData } = await db.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "Not authenticated" }, 401);

  let materialId: string | null = null;
  try {
    const body = await req.json();
    materialId = body?.material_id ?? null;
  } catch { /* handled below */ }
  if (!materialId) return json({ error: "material_id is required" }, 400);

  const fail = async (message: string, status = 500) => {
    await db.from("materials")
      .update({ status: "failed", error_message: message.slice(0, 500) })
      .eq("id", materialId);
    return json({ error: message }, status);
  };

  // RLS means a material belonging to someone else simply is not found.
  const { data: material, error: matError } = await db
    .from("materials")
    .select("id, title, source_type, storage_path, status, subject_id")
    .eq("id", materialId)
    .maybeSingle();

  if (matError) return json({ error: matError.message }, 500);
  if (!material) return json({ error: "Material not found" }, 404);
  if (!TEXT_TYPES.has(material.source_type)) {
    return await fail(
      `Only text files are supported so far (got ${material.source_type}).`,
      422,
    );
  }

  try {
    // ── 1. Extract ────────────────────────────────────────────
    await db.from("materials").update({ status: "extracting", error_message: null })
      .eq("id", materialId);

    const { data: file, error: dlError } = await db.storage
      .from("study-materials")
      .download(material.storage_path!);
    if (dlError || !file) return await fail(`Could not read the file: ${dlError?.message}`);

    const raw = (await file.text()).trim();
    if (!raw) return await fail("That file has no readable text.", 422);
    const text = raw.slice(0, MAX_CHARS);

    await db.from("materials").update({
      extracted_text: text,
      word_count: text.split(/\s+/).length,
    }).eq("id", materialId);

    // ── 2. Chunk + embed ──────────────────────────────────────
    await db.from("materials").update({ status: "embedding" }).eq("id", materialId);

    const chunks = chunkText(text);
    // Sequential on purpose: the free tier is rate limited per minute, and a
    // text file yields few chunks. Batch this when PDFs arrive.
    const rows = [];
    for (const [i, content] of chunks.entries()) {
      const embedding = await embed(content);
      rows.push({
        material_id: materialId,
        user_id: user.id,
        chunk_index: i,
        content,
        token_count: Math.round(content.length / 4),
        embedding,
      });
    }

    await db.from("material_chunks").delete().eq("material_id", materialId);
    const { error: chunkError } = await db.from("material_chunks").insert(rows);
    if (chunkError) return await fail(`Saving chunks failed: ${chunkError.message}`);

    // ── 3. Generate ───────────────────────────────────────────
    await db.from("materials").update({ status: "generating" }).eq("id", materialId);

    const prompt =
      "You are helping a student study their own course material.\n" +
      "From the material below, write:\n" +
      "- a short title for the study pack\n" +
      "- a clear summary in markdown, a few paragraphs at most\n" +
      "- 3 to 6 topics: the distinct subjects this material teaches. Keep the " +
      "names short and reusable, like 'Normal Forms' or 'Functional Dependencies', " +
      "not phrased as questions.\n" +
      "- 5 to 8 key concepts, each with a plain definition and importance 1-5\n" +
      "- 5 to 8 practice questions with difficulty 1-5. Every multiple_choice " +
      "question must include exactly 4 choices, and correct_answer must match one " +
      "of them exactly.\n" +
      "Every key concept and every question must set `topic` to one of the topic " +
      "names above, spelled identically.\n" +
      "Only use what the material actually says.\n\nMATERIAL:\n" + text;

    const { data: pack, model } = await generateJson<Pack>(prompt, PACK_SCHEMA);

    // ── 4. Persist ────────────────────────────────────────────
    const { data: set, error: setError } = await db.from("study_sets").insert({
      user_id: user.id,
      material_id: materialId,
      subject_id: material.subject_id,
      title: pack.title?.trim() || material.title,
      status: "ready",
      generation_model: model,
    }).select("id").single();
    if (setError || !set) return await fail(`Saving the study pack failed: ${setError?.message}`);

    await db.from("summaries").insert({
      study_set_id: set.id,
      user_id: user.id,
      kind: "overview",
      content: pack.summary,
    });

    // Topics first: concepts and questions both reference them, and mastery is
    // tracked per topic rather than per pack.
    const topicIds = await resolveTopics(
      db,
      user.id,
      material.subject_id ?? null,
      (pack.topics ?? []).map((t) => t?.name).filter(Boolean) as string[],
    );
    const topicIdFor = (name?: string) =>
      name ? (topicIds.get(topicKey(name)) ?? null) : null;

    const concepts = (pack.key_concepts ?? [])
      .filter((c) => c?.term?.trim() && c?.definition?.trim())
      .map((c, i) => ({
        study_set_id: set.id,
        user_id: user.id,
        topic_id: topicIdFor(c.topic),
        term: c.term.trim(),
        definition: c.definition.trim(),
        importance: clamp(c.importance, 1, 5, 3),
        position: i,
      }));
    if (concepts.length) await db.from("key_concepts").insert(concepts);

    // Validate before insert rather than trusting the schema: a multiple_choice
    // row without choices violates questions_choices_required and would abort
    // the whole batch.
    const questions = (pack.questions ?? [])
      .filter((q) => q?.prompt?.trim() && q?.correct_answer?.trim())
      .filter((q) => q.type !== "multiple_choice" || Array.isArray(q.choices))
      .map((q, i) => ({
        study_set_id: set.id,
        user_id: user.id,
        topic_id: topicIdFor(q.topic),
        type: q.type,
        prompt: q.prompt.trim(),
        choices: q.type === "multiple_choice" ? q.choices : null,
        correct_answer: q.correct_answer.trim(),
        explanation: q.explanation ?? null,
        difficulty: clamp(q.difficulty, 1, 5, 3),
        position: i,
      }));
    if (questions.length) {
      const { error: qError } = await db.from("questions").insert(questions);
      if (qError) return await fail(`Saving questions failed: ${qError.message}`);
    }

    await db.from("materials")
      .update({ status: "ready", processed_at: new Date().toISOString(), error_message: null })
      .eq("id", materialId);

    return json({
      ok: true,
      study_set_id: set.id,
      model,
      chunks: rows.length,
      topics: topicIds.size,
      key_concepts: concepts.length,
      questions: questions.length,
      questions_with_topic: questions.filter((q) => q.topic_id).length,
      dropped_questions: (pack.questions?.length ?? 0) - questions.length,
    });
  } catch (err) {
    return await fail(err instanceof Error ? err.message : String(err));
  }
});
