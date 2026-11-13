import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { extractText } from "./extract.ts";
import { embedMany } from "../_shared/ai/gemini.ts";
import { generateJson } from "../_shared/ai/generate.ts";
import { clamp, conceptRows, type Pack, QUESTION_RULES, questionRows, schemasFor, topicLookup } from "../_shared/packs.ts";
import { http, isUuidOrEmpty } from "../_shared/http.ts";
import { LIMITS, logError, publicMessage, takeRateLimit, TOO_MANY } from "../_shared/security.ts";

/**
 * Turns an uploaded material into a study pack.
 *
 * Reads text files, slide decks, Word documents, PDFs and photos (see
 * extract.ts). The request only checks the caller and the material, then
 * answers 202; the work runs in the background, so a long PDF is not cut off
 * by the request timeout or by the student closing the tab. Progress and
 * failures are written to the material row, which Home polls.
 *
 * Auth: verify_jwt is on, and every database call goes through a client
 * carrying the caller's JWT, so RLS still applies. The service role is used
 * only for ai_model_health and security_events, which hold no study data.
 * Only allowed sites may call it, each student has a rate limit (every run
 * costs AI calls), and only messages written for students are saved on the
 * material: other errors are logged and replaced with a plain message.
 *
 * Providers: embeddings are Gemini; the pack itself comes from the generation
 * chain in generate.ts (Groq first, Gemini as fallback).
 */

const SUPPORTED_TYPES = new Set(["text", "pdf", "pptx", "docx", "image"]);

/**
 * The platform stops a worker 150s after it starts (free plan), whatever it is
 * doing, and nothing runs after that, not even a "mark it failed" handler.
 * So the run keeps its own budget and finishes in time to record the outcome:
 * a pack, or a clear failure the student can retry, never a material stuck on
 * "processing". A worker can serve several requests, so the budget counts
 * from when the worker started, not from this request.
 */
const WORKER_STARTED = Date.now();
const WORKER_LIMIT_MS = 150_000;
const SAFETY_MS = 15_000; // time left over to save the outcome
const RUN_MAX_MS = 125_000;
const TOO_LONG =
  "This took too long to process. Try again, and if it keeps happening, upload a shorter file or split it into parts.";
const COULD_NOT_FINISH = "Novi couldn't finish building this study pack. Try again in a moment.";

const MAX_CHARS = 60_000; // keep one generation call within sane limits

// Question counts the student can ask for. Mirrored in src/lib/materials.js,
// which greys out the same options in the upload form; this side is the one
// that is actually enforced.
const MIN_QUESTIONS = 5;
const MAX_QUESTIONS = 20;
const DEFAULT_QUESTIONS = 10;
const WORDS_PER_QUESTION = 40;

/**
 * The most questions this much text can honestly support. Past roughly one
 * question per 40 words the model starts repeating itself or padding.
 */
const questionCapFor = (words: number) =>
  Math.max(MIN_QUESTIONS, Math.min(MAX_QUESTIONS, Math.floor(words / WORDS_PER_QUESTION)));

/**
 * Room the generated pack needs: summary, topics and concepts, plus each
 * question with its choices and explanation, plus a little reasoning. Too low
 * and the answer is cut off; too high and Groq refuses the request outright.
 */
const outputTokensFor = (questions: number) => 1_500 + 180 * questions;

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

Deno.serve(async (req: Request) => {
  const { allowed, json, preflight } = http(req);
  if (req.method === "OPTIONS") return preflight();
  if (!allowed) return json({ error: "This site isn't allowed to use Novi." }, 403);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Sign in to upload material." }, 401);

  // RLS applies to everything below: this client acts as the calling student.
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );

  const { data: userData } = await db.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "Your session has ended. Sign in again." }, 401);

  let materialId: string | null = null;
  let requestedQuestions = DEFAULT_QUESTIONS;
  try {
    const body = await req.json();
    materialId = body?.material_id ?? null;
    // 0 means "no questions yet": a file attached in AI Chat, where the student
    // chooses how many practice questions they want after it has been read.
    requestedQuestions = body?.question_count === 0
      ? 0
      : clamp(body?.question_count, MIN_QUESTIONS, MAX_QUESTIONS, DEFAULT_QUESTIONS);
  } catch { /* handled below */ }
  if (!materialId || !isUuidOrEmpty(materialId)) return json({ error: "Invalid request" }, 400);

  const fail = async (message: string, status = 500) => {
    await db.from("materials")
      .update({ status: "failed", error_message: message.slice(0, 500) })
      .eq("id", materialId);
    return json({ error: message }, status);
  };

  // RLS means a material belonging to someone else simply is not found.
  const { data: material, error: matError } = await db
    .from("materials")
    .select("id, title, source_type, storage_path, mime_type, status, subject_id")
    .eq("id", materialId)
    .maybeSingle();

  if (matError) {
    logError("process_material.load", matError, { material: materialId });
    return json({ error: "Novi couldn't open that material. Try again." }, 500);
  }
  if (!material) return json({ error: "Material not found" }, 404);
  if (!(await takeRateLimit(user.id, LIMITS.processMaterial, { material: materialId }))) {
    return json({ error: TOO_MANY }, 429);
  }
  if (!SUPPORTED_TYPES.has(material.source_type)) {
    return await fail(`${material.source_type} files aren't supported yet.`, 422);
  }
  if (!material.storage_path) return await fail("This material has no file attached.", 422);

  const budgetMs = Math.min(RUN_MAX_MS, WORKER_LIMIT_MS - SAFETY_MS - (Date.now() - WORKER_STARTED));
  const budget = AbortSignal.timeout(Math.max(budgetMs, 1_000));

  await db.from("materials").update({ status: "extracting", error_message: null })
    .eq("id", materialId);

  const pipeline = (async () => {
  try {
    // ── 1. Extract (status was set to "extracting" before answering) ──
    const { data: file, error: dlError } = await db.storage
      .from("study-materials")
      .download(material.storage_path!);
    if (dlError || !file) {
      logError("process_material.download", dlError, { material: materialId });
      return await fail("Novi couldn't read the uploaded file. Try uploading it again.");
    }

    const extracted = await extractText(file, {
      sourceType: material.source_type,
      storagePath: material.storage_path,
      mimeType: material.mime_type ?? null,
      maxChars: MAX_CHARS,
      signal: budget,
    });
    const raw = extracted.text.trim();
    if (!raw) return await fail("That file has no readable text.", 422);
    const text = raw.slice(0, MAX_CHARS);

    const wordCount = text.split(/\s+/).length;
    await db.from("materials").update({
      extracted_text: text,
      word_count: wordCount,
      page_count: extracted.pageCount,
    }).eq("id", materialId);

    const questionTarget = requestedQuestions === 0 ? 0 : Math.min(requestedQuestions, questionCapFor(wordCount));

    // ── 2. Chunk + embed ──────────────────────────────────────
    await db.from("materials").update({ status: "embedding" }).eq("id", materialId);

    const chunks = chunkText(text);
    const vectors = await embedMany(chunks, budget);
    const rows = chunks.map((content, i) => ({
      material_id: materialId,
      user_id: user.id,
      chunk_index: i,
      content,
      token_count: Math.round(content.length / 4),
      embedding: vectors[i],
    }));

    await db.from("material_chunks").delete().eq("material_id", materialId);
    const { error: chunkError } = await db.from("material_chunks").insert(rows);
    if (chunkError) {
      logError("process_material.chunks", chunkError, { material: materialId });
      return await fail(COULD_NOT_FINISH);
    }

    // ── 3. Generate ───────────────────────────────────────────
    await db.from("materials").update({ status: "generating" }).eq("id", materialId);
    // Question types the student allows (Settings -> Study Preferences).
    const { data: profile } = await db.from("profiles").select("question_types").eq("id", user.id).maybeSingle();
    const schemas = schemasFor(profile?.question_types as string[] | null | undefined);

    const prompt =
      "You are helping a student study their own course material.\n" +
      "From the material below, write:\n" +
      "- a short title for the study pack\n" +
      "- a clear summary in markdown, a few paragraphs at most\n" +
      "- 3 to 6 topics: the distinct subjects this material teaches. Keep the " +
      "names short and reusable, like 'Normal Forms' or 'Functional Dependencies', " +
      "not phrased as questions.\n" +
      "- 5 to 8 key concepts, each with a plain definition and importance 1-5\n" +
      (questionTarget > 0
        ? `- exactly ${questionTarget} practice questions with difficulty 1-5, spread ` +
          `across the topics, each testing something different. ${QUESTION_RULES}\n` +
          (schemas.rule ? `  ${schemas.rule}\n` : "")
        : "- no practice questions: return an empty questions list\n") +
      "Every key concept and every question must set `topic` to one of the topic " +
      "names above, spelled identically.\n" +
      "Only use what the material actually says.\n\nMATERIAL:\n" + text;

    const { data: pack, model } = await generateJson<Pack>(prompt, schemas.pack, {
      outputTokens: outputTokensFor(questionTarget),
      signal: budget,
    });

    // ── 4. Persist ────────────────────────────────────────────
    const { data: set, error: setError } = await db.from("study_sets").insert({
      user_id: user.id,
      material_id: materialId,
      subject_id: material.subject_id,
      title: pack.title?.trim() || material.title,
      status: "ready",
      generation_model: model,
      generation_params: {
        questions_requested: requestedQuestions,
        // Lower than requested when the material is too short to support more.
        questions_target: questionTarget,
        // Which model read the file, for PDFs and photos.
        extraction_model: extracted.model,
      },
    }).select("id").single();
    if (setError || !set) {
      logError("process_material.study_set", setError, { material: materialId });
      return await fail(COULD_NOT_FINISH);
    }

    await db.from("summaries").insert({
      study_set_id: set.id,
      user_id: user.id,
      kind: "overview",
      content: pack.summary,
    });

    // Topics first: concepts and questions both reference them, and mastery is
    // tracked per topic rather than per pack.
    const { ids: topicIds, topicIdFor } = await topicLookup(db, user.id, material.subject_id ?? null, pack.topics);

    const concepts = conceptRows(pack.key_concepts, { setId: set.id, userId: user.id, topicIdFor });
    if (concepts.length) await db.from("key_concepts").insert(concepts);

    const questions = questionRows(pack.questions, { setId: set.id, userId: user.id, topicIdFor });
    if (questions.length) {
      const { error: qError } = await db.from("questions").insert(questions);
      if (qError) {
        logError("process_material.questions", qError, { material: materialId });
        return await fail(COULD_NOT_FINISH);
      }
    }

    await db.from("materials")
      .update({ status: "ready", processed_at: new Date().toISOString(), error_message: null })
      .eq("id", materialId);

    // The request was answered long ago; this summary is for the function logs.
    console.log(JSON.stringify({
      material_id: materialId,
      source_type: material.source_type,
      extraction_model: extracted.model,
      model,
      words: wordCount,
      chunks: rows.length,
      topics: topicIds.size,
      key_concepts: concepts.length,
      questions: questions.length,
      questions_target: questionTarget,
      dropped_questions: (pack.questions?.length ?? 0) - questions.length,
    }));
  } catch (err) {
    // Extraction errors (ExtractError) are worded for the student; anything
    // else (AI providers, the network) is logged and shown plainly.
    if (!budget.aborted) logError("process_material", err, { material: materialId });
    await fail(budget.aborted ? TOO_LONG : publicMessage(err, COULD_NOT_FINISH));
  }
  })();

  EdgeRuntime.waitUntil(pipeline);
  return json({ ok: true, material_id: materialId, status: "extracting" }, 202);
});
