/**
 * Gemini adapter.
 *
 * Everything provider-specific lives here: model IDs, request shapes, the
 * circuit breaker, and the normalisation Gemini does not do for us. Swapping
 * provider should mean rewriting this file and nothing else.
 */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export const EMBED_MODEL = "gemini-embedding-001";
export const EMBED_DIMS = 1536; // must match material_chunks.embedding

/** Preferred first. Newer flash is both cheaper and better here. */
export const GENERATION_CHAIN = ["gemini-3.8-flash", "gemini-3.5-flash-lite"];

const apiKey = () => {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  return key;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Service-role client, used *only* for ai_model_health (no user data). */
function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

// ── Circuit breaker ──────────────────────────────────────────────

/** Escalating cooldown so repeated quota hits back off further each time. */
function cooldownMs(failures: number, status: number): number {
  if (status === 503) return 30_000; // transient overload, clears fast
  return [60_000, 5 * 60_000, 30 * 60_000][Math.min(failures, 2)];
}

async function coolingModels(db: SupabaseClient): Promise<Set<string>> {
  const { data } = await db
    .from("ai_model_health")
    .select("model, cooling_until")
    .gt("cooling_until", new Date().toISOString());
  return new Set((data ?? []).map((r) => r.model as string));
}

async function recordFailure(
  db: SupabaseClient,
  model: string,
  status: number,
  message: string,
  retryDelaySeconds: number | null,
) {
  const { data: existing } = await db
    .from("ai_model_health")
    .select("consecutive_failures")
    .eq("model", model)
    .maybeSingle();

  const failures = (existing?.consecutive_failures ?? 0) + 1;
  const ms = retryDelaySeconds !== null
    ? retryDelaySeconds * 1000
    : cooldownMs(failures - 1, status);

  await db.from("ai_model_health").upsert({
    model,
    cooling_until: new Date(Date.now() + ms).toISOString(),
    consecutive_failures: failures,
    last_status: status,
    last_error: message.slice(0, 500),
  });
}

async function recordSuccess(db: SupabaseClient, model: string) {
  await db.from("ai_model_health").upsert({
    model,
    cooling_until: null,
    consecutive_failures: 0,
    last_status: 200,
    last_error: null,
  });
}

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

export type GenerateResult<T> = { data: T; model: string };

/**
 * Calls the first non-cooling model in the chain, retrying transient 503s
 * in place before downgrading. Schema errors never cool a model down - those
 * are our bug, not the model's.
 *
 * Note: thinking level is NOT configurable here. `thinking_level` belongs to
 * the newer /v1beta/interactions endpoint; generateContent rejects it as an
 * unknown field. Thinking tokens bill as output, so revisit this if cost or
 * latency becomes a problem.
 */
export async function generateJson<T>(
  prompt: string,
  responseSchema: Record<string, unknown>,
): Promise<GenerateResult<T>> {
  const db = adminClient();
  const cooling = await coolingModels(db);
  const chain = GENERATION_CHAIN.filter((m) => !cooling.has(m));
  // If everything is cooling, still try the last resort rather than give up.
  const models = chain.length > 0 ? chain : [GENERATION_CHAIN.at(-1)!];

  let lastError = "";
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
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
          const parsed = JSON.parse(raw ?? "") as T;
          await recordSuccess(db, model);
          return { data: parsed, model };
        } catch {
          lastError = "Model returned unparseable JSON";
          break; // our problem or a bad roll; do not blame the model's quota
        }
      }

      const body = await res.json().catch(() => ({}));
      lastError = body?.error?.message ?? `HTTP ${res.status}`;

      if (res.status === 429 || res.status === 503) {
        const delay = retryDelayFrom(body);
        // 503 clears quickly, so retry in place first; 429 means step aside.
        if (res.status === 503 && attempt < 2) {
          await sleep((delay ?? 2 ** attempt) * 1000);
          continue;
        }
        await recordFailure(db, model, res.status, lastError, delay);
        break; // downgrade to the next model
      }

      break; // 4xx: our request is wrong, changing model will not help
    }
  }

  throw new Error(`Generation failed: ${lastError}`);
}
