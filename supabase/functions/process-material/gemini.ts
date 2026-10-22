/**
 * Gemini adapter.
 *
 * Everything Gemini-specific lives here: model IDs, request shapes, and the
 * normalisation Gemini does not do for us. Embeddings stay on Gemini whatever
 * the generation chain does: vectors from different models are not comparable,
 * so switching embedding model means re-embedding every material.
 */

import { ProviderError } from "./breaker.ts";

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

// ── Generation ───────────────────────────────────────────────────

/**
 * One structured-output call. Retrying and falling back are the chain's job
 * (generate.ts); this only reports what happened.
 *
 * Note: thinking level is NOT configurable here. `thinking_level` belongs to
 * the newer /v1beta/interactions endpoint; generateContent rejects it as an
 * unknown field. Thinking tokens bill as output, so revisit this if cost or
 * latency becomes a problem.
 */
export async function geminiGenerate<T>(
  model: string,
  prompt: string,
  responseSchema: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.4,
      },
    }),
  });

  if (res.ok) {
    const body = await res.json();
    const raw = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    try {
      return JSON.parse(raw ?? "") as T;
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
