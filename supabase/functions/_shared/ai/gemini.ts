/**
 * Gemini adapter.
 *
 * Everything Gemini-specific lives here: model IDs, request shapes, and the
 * normalisation Gemini does not do for us. Embeddings stay on Gemini whatever
 * the generation chain does: vectors from different models are not comparable,
 * so switching embedding model means re-embedding every material.
 */

import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { adminClient, coolingModels, ProviderError, recordFailure, recordSuccess } from "./breaker.ts";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export const EMBED_MODEL = "gemini-embedding-001";
export const EMBED_DIMS = 1536; // must match material_chunks.embedding

const apiKey = () => {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  return key;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Google returns a suggested delay in error.details for some quota errors. */
function retryDelayFrom(body: unknown): number | null {
  const details = (body as { error?: { details?: unknown[] } })?.error?.details;
  if (!Array.isArray(details)) return null;
  for (const d of details) {
    const delay = (d as { retryDelay?: string })?.retryDelay;
    if (typeof delay === "string") {
      const seconds = parseFloat(delay.replace("s", ""));
      if (Number.isFinite(seconds)) return seconds;
    }
  }
  return null;
}

// ── Embeddings ───────────────────────────────────────────────────

/**
 * L2 normalisation. gemini-embedding-001 does NOT normalise truncated output:
 * a 1536-dim vector measured 0.698 in testing. Cosine similarity over
 * un-normalised vectors ranks results wrong without ever erroring, so this is
 * required, not defensive.
 */
function normalise(v: number[]): number[] {
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return mag === 0 ? v : v.map((x) => x / mag);
}

export async function embed(text: string): Promise<number[]> {
  let lastError = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${BASE}/${EMBED_MODEL}:embedContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
      body: JSON.stringify({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: EMBED_DIMS,
      }),
    });

    if (res.ok) {
      const body = await res.json();
      const values = body?.embedding?.values;
      if (!Array.isArray(values) || values.length !== EMBED_DIMS) {
        throw new Error(`Expected ${EMBED_DIMS} dims, got ${values?.length}`);
      }
      return normalise(values);
    }

    const body = await res.json().catch(() => ({}));
    lastError = body?.error?.message ?? `HTTP ${res.status}`;
    if (res.status !== 429 && res.status !== 503) break; // not worth retrying
    await sleep((retryDelayFrom(body) ?? 2 ** attempt) * 1000);
  }
  throw new Error(`Embedding failed: ${lastError}`);
}

/**
 * Embeds many chunks in as few requests as possible (up to 100 per batch), so
 * a long PDF does not spend its time budget on one round trip per chunk.
 */
export async function embedMany(texts: string[], signal?: AbortSignal): Promise<number[][]> {
  const out: number[][] = [];
  for (let start = 0; start < texts.length; start += 100) {
    const batch = texts.slice(start, start + 100);
    let lastError = "";
    let done = false;
    for (let attempt = 0; attempt < 4 && !done; attempt++) {
      const res = await fetch(`${BASE}/${EMBED_MODEL}:batchEmbedContents`, {
        method: "POST",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: `models/${EMBED_MODEL}`,
            content: { parts: [{ text }] },
            outputDimensionality: EMBED_DIMS,
          })),
        }),
      });

      if (res.ok) {
        const body = await res.json();
        const embeddings = body?.embeddings;
        if (!Array.isArray(embeddings) || embeddings.length !== batch.length) {
          throw new Error(`Expected ${batch.length} embeddings, got ${embeddings?.length}`);
        }
        for (const e of embeddings) {
          if (!Array.isArray(e?.values) || e.values.length !== EMBED_DIMS) {
            throw new Error(`Expected ${EMBED_DIMS} dims, got ${e?.values?.length}`);
          }
          out.push(normalise(e.values));
        }
        done = true;
        break;
      }

      const body = await res.json().catch(() => ({}));
      lastError = body?.error?.message ?? `HTTP ${res.status}`;
      if (res.status !== 429 && res.status !== 503) break;
      await sleep((retryDelayFrom(body) ?? 2 ** attempt) * 1000);
    }
    if (!done) throw new Error(`Embedding failed: ${lastError}`);
  }
  return out;
}

// ── Reading PDFs and images ──────────────────────────────────────

/** Cheapest first: reading a page is easy work, and Flash-Lite has more daily quota. */
const READ_MODELS = ["gemini-3.5-flash-lite", "gemini-3.8-flash"];

/**
 * Files up to this size go inline as base64. Gemini caps a whole request at
 * about 20 MB, and base64 adds a third, so bigger files go through the Files
 * API instead (which also keeps the function well inside its memory limit).
 */
const INLINE_MAX_BYTES = 14 * 1024 * 1024;

const UPLOAD_BASE = "https://generativelanguage.googleapis.com/upload/v1beta/files";
const FILES_BASE = "https://generativelanguage.googleapis.com/v1beta";

type FilePart =
  | { inline_data: { mime_type: string; data: string } }
  | { file_data: { mime_type: string; file_uri: string } };

/** Resumable upload in one go: start, then upload and finalise. */
async function uploadFile(file: Blob, mime: string): Promise<{ uri: string; name: string }> {
  const start = await fetch(UPLOAD_BASE, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey(),
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(file.size),
      "X-Goog-Upload-Header-Content-Type": mime,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "novi-material" } }),
  });
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!start.ok || !uploadUrl) {
    const body = await start.json().catch(() => ({}));
    throw new Error(`Could not send the file to Gemini: ${body?.error?.message ?? `HTTP ${start.status}`}`);
  }

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(file.size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: file,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.file?.uri) {
    throw new Error(`Could not send the file to Gemini: ${body?.error?.message ?? `HTTP ${res.status}`}`);
  }

  // PDFs can need a moment of processing before they can be used.
  let state = body.file.state;
  for (let i = 0; state === "PROCESSING" && i < 20; i++) {
    await sleep(1500);
    const check = await fetch(`${FILES_BASE}/${body.file.name}`, { headers: { "x-goog-api-key": apiKey() } });
    state = (await check.json().catch(() => ({})))?.state;
  }
  if (state === "FAILED") throw new Error("Gemini could not process that file.");
  return { uri: body.file.uri, name: body.file.name };
}

/** Uploaded files expire after two days anyway; this removes them straight away. */
async function deleteFile(name: string) {
  await fetch(`${FILES_BASE}/${name}`, { method: "DELETE", headers: { "x-goog-api-key": apiKey() } })
    .catch(() => {});
}

const NO_TEXT = "NO_STUDY_CONTENT";

function readPrompt(kind: "pdf" | "image", notes: boolean): string {
  const what = kind === "pdf" ? "this PDF" : "this photo or image";
  const task = notes
    ? `Write detailed study notes from ${what}, in your own words, covering every ` +
      "point, definition, example, formula and figure in order. Leave nothing out."
    : `Transcribe all the text in ${what} faithfully, in reading order. Keep headings, ` +
      "lists and tables (as markdown). Include handwriting.";
  return task +
    "\n- Describe diagrams, charts and pictures that carry information as " +
    "[Figure: short description].\n" +
    "- Skip page numbers, headers and footers that repeat on every page.\n" +
    "- Output only the content as markdown, with no introduction or comments.\n" +
    `- If there is no readable text or study material at all, reply with exactly ${NO_TEXT}.`;
}

type Candidate = {
  content?: { parts?: { text?: string; thought?: boolean }[] };
  finishReason?: string;
};

/** Joins the answer's text parts, leaving out any thinking the model shows. */
function answerText(body: { candidates?: Candidate[] }): { text: string; finish: string | null } {
  const candidate = body?.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim();
  return { text, finish: candidate?.finishReason ?? null };
}

/**
 * Reads a PDF or an image into markdown text. Tries a faithful transcription
 * first; if Gemini refuses to reproduce the text verbatim (it does this for
 * some published material), asks for detailed notes instead.
 *
 * Returns "" when the file holds nothing readable.
 */
export async function readWithGemini(
  file: Blob,
  mime: string,
  kind: "pdf" | "image",
  maxChars: number,
  { signal, inlineMaxBytes = INLINE_MAX_BYTES }: { signal?: AbortSignal; inlineMaxBytes?: number } = {},
): Promise<{ text: string; model: string }> {
  const health = adminClient();
  const cooling = await coolingModels(health);
  const live = READ_MODELS.filter((m) => !cooling.has(m));
  const models = live.length > 0 ? live : [READ_MODELS.at(-1)!];

  let uploaded: { uri: string; name: string } | null = null;
  let part: FilePart;
  if (file.size <= inlineMaxBytes) {
    part = { inline_data: { mime_type: mime, data: encodeBase64(new Uint8Array(await file.arrayBuffer())) } };
  } else {
    uploaded = await uploadFile(file, mime);
    part = { file_data: { mime_type: mime, file_uri: uploaded.uri } };
  }

  // Enough room for everything the rest of the pipeline will use, and no more.
  const maxOutputTokens = Math.min(16_000, Math.ceil(maxChars / 3.5));

  try {
    let lastError = "";
    for (const model of models) {
      for (const notes of [false, true]) {
        let moveOn = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          // One read may take a while for a long PDF, but not forever.
          const timeout = AbortSignal.timeout(75_000);
          let res: Response;
          try {
            res = await fetch(`${BASE}/${model}:generateContent`, {
              method: "POST",
              signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
              headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
              body: JSON.stringify({
                contents: [{ parts: [part, { text: readPrompt(kind, notes) }] }],
                generationConfig: { temperature: 0, maxOutputTokens },
              }),
            });
          } catch (err) {
            if (signal?.aborted) throw signal.reason;
            lastError = `${model}: ${err instanceof Error ? err.message : String(err)}`;
            moveOn = true; // timed out: try the next model
            break;
          }

          if (res.ok) {
            const { text, finish } = answerText(await res.json());
            if (text.startsWith(NO_TEXT)) {
              await recordSuccess(health, model);
              return { text: "", model };
            }
            // Cut off at the token limit is fine: only maxChars are used anyway.
            if (text && finish !== "RECITATION" && finish !== "SAFETY") {
              await recordSuccess(health, model);
              return { text, model };
            }
            lastError = `${model}: no usable text (${finish ?? "empty answer"})`;
            break; // try the notes prompt, then the next model
          }

          const body = await res.json().catch(() => ({}));
          const message = body?.error?.message ?? `HTTP ${res.status}`;
          lastError = `${model}: ${message}`;
          if (res.status === 503 && attempt < 2) {
            await sleep((retryDelayFrom(body) ?? 2 ** attempt) * 1000);
            continue;
          }
          if (res.status === 429 || res.status === 503) {
            await recordFailure(health, model, res.status, message, retryDelayFrom(body));
          }
          moveOn = true; // quota or a bad request: the notes prompt won't help
          break;
        }
        if (moveOn) break;
      }
    }
    throw new Error(`Reading the file failed: ${lastError}`);
  } finally {
    if (uploaded) await deleteFile(uploaded.name);
  }
}

// ── Generation ───────────────────────────────────────────────────

/**
 * One structured-output call. Retrying and falling back are the chain's job
 * (generate.ts); this only reports what happened.
 *
 * `thinkingLevel` goes in generationConfig.thinkingConfig (tested 2026-10-23
 * on gemini-3.5-flash-lite: accepted, and "low" cut a pack from 23s to 14s).
 */
export async function geminiGenerate<T>(
  model: string,
  prompt: string,
  responseSchema: Record<string, unknown>,
  signal: AbortSignal,
  thinkingLevel?: "low",
): Promise<T> {
  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.4,
        ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
      },
    }),
  });

  if (res.ok) {
    const { text: raw } = answerText(await res.json());
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new ProviderError("Model returned unparseable JSON", 0);
    }
  }

  const body = await res.json().catch(() => ({}));
  throw new ProviderError(
    body?.error?.message ?? `HTTP ${res.status}`,
    res.status,
    retryDelayFrom(body),
  );
}
