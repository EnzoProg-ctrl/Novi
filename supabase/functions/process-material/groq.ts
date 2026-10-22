/**
 * Groq adapter.
 *
 * Groq's free plan allows far more requests per day than Gemini's best free
 * model, and does not train on inputs, but it caps tokens per minute. A single
 * request (prompt plus the output budget) has to fit under that cap, so
 * generate.ts only sends material small enough; larger material goes to Gemini.
 */

import { ProviderError } from "./breaker.ts";

const URL = "https://api.groq.com/openai/v1/chat/completions";

/** Per-minute token cap on the free plan. A request over it is rejected outright. */
export const GROQ_TOKENS_PER_MINUTE = 8_000;

export const hasGroqKey = () => Boolean(Deno.env.get("GROQ_API_KEY"));

type Schema = Record<string, unknown>;

/**
 * Converts the Gemini-style schema used by index.ts into the JSON Schema that
 * Groq's strict mode accepts: lowercase types, every property listed as
 * required, no additional properties, and optional fields expressed as a union
 * with null.
 */
export function toStrictSchema(schema: Schema): Schema {
  const type = String(schema.type ?? "").toLowerCase();

  if (type === "object") {
    const props = (schema.properties ?? {}) as Record<string, Schema>;
    const required = new Set((schema.required ?? []) as string[]);
    const properties: Record<string, Schema> = {};
    for (const [key, value] of Object.entries(props)) {
      const converted = toStrictSchema(value);
      properties[key] = required.has(key) ? converted : nullable(converted);
    }
    return {
      type: "object",
      properties,
      required: Object.keys(props),
      additionalProperties: false,
    };
  }

  if (type === "array") {
    return { type: "array", items: toStrictSchema((schema.items ?? {}) as Schema) };
  }

  const out: Schema = { type };
  if (Array.isArray(schema.enum)) out.enum = schema.enum;
  return out;
}

function nullable(schema: Schema): Schema {
  const out: Schema = { ...schema, type: [schema.type, "null"] };
  if (Array.isArray(schema.enum)) out.enum = [...schema.enum, null];
  return out;
}

/**
 * Strict mode returns null for optional fields the model left empty. The rest
 * of the pipeline treats missing as undefined (e.g. clamp falls back on it),
 * so nulls are removed rather than passed through.
 */
function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== null) out[k] = stripNulls(v);
    }
    return out;
  }
  return value;
}

/** One structured-output call. Retrying and falling back are the chain's job. */
export async function groqGenerate<T>(
  model: string,
  prompt: string,
  schema: Schema,
  maxTokens: number,
): Promise<T> {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("GROQ_API_KEY")}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      response_format: {
        type: "json_schema",
        json_schema: { name: "study_pack", strict: true, schema: toStrictSchema(schema) },
      },
      temperature: 0.4,
      // Reasoning tokens count against the same output budget, and against the
      // per-minute cap, so keep the model's thinking short.
      reasoning_effort: "low",
      max_completion_tokens: maxTokens,
    }),
  });

  if (res.ok) {
    const body = await res.json();
    const choice = body?.choices?.[0];
    if (choice?.finish_reason === "length") {
      throw new ProviderError("Ran out of output tokens before finishing", 0);
    }
    try {
      return stripNulls(JSON.parse(choice?.message?.content ?? "")) as T;
    } catch {
      throw new ProviderError("Model returned unparseable JSON", 0);
    }
  }

  const body = await res.json().catch(() => ({}));
  const retryAfter = parseFloat(res.headers.get("retry-after") ?? "");
  throw new ProviderError(
    body?.error?.message ?? `HTTP ${res.status}`,
    res.status,
    Number.isFinite(retryAfter) ? retryAfter : null,
  );
}
