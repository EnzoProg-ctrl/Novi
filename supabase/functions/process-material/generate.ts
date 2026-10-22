/**
 * The generation chain: which model writes a study pack, and what happens when
 * one runs out.
 *
 * Groq goes first because its free plan allows far more requests per day than
 * Gemini's, so most uploads never spend Gemini's scarce allowance. Groq is
 * skipped when there is no key or when the request would not fit under its
 * per-minute token cap; Gemini handles large material and anything Groq cannot.
 */

import {
  adminClient,
  coolingModels,
  ProviderError,
  recordFailure,
  recordSuccess,
} from "./breaker.ts";
import { geminiGenerate } from "./gemini.ts";
import { GROQ_TOKENS_PER_MINUTE, groqGenerate, hasGroqKey } from "./groq.ts";

type Link = { provider: "groq" | "gemini"; model: string };

/** Preferred first. */
export const GENERATION_CHAIN: Link[] = [
  { provider: "groq", model: "openai/gpt-oss-120b" },
  { provider: "gemini", model: "gemini-3.8-flash" },
  { provider: "gemini", model: "gemini-3.5-flash-lite" },
];

export type GenerateResult<T> = { data: T; model: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Conservative: English runs nearer 4 characters per token. */
const estimateTokens = (text: string) => Math.ceil(text.length / 3.5);

/**
 * Calls the first usable, non-cooling model in the chain. Transient 503s are
 * retried in place; a 429 cools that model down and moves on. Anything else
 * (an oversized request, unparseable output) moves on without blaming the
 * model's quota.
 *
 * `outputTokens` is the room the answer needs. Groq counts it against its
 * per-minute cap up front, so it decides whether Groq is even attempted.
 */
export async function generateJson<T>(
  prompt: string,
  responseSchema: Record<string, unknown>,
  { outputTokens }: { outputTokens: number },
): Promise<GenerateResult<T>> {
  const fitsGroq = hasGroqKey() &&
    estimateTokens(prompt) + outputTokens <= GROQ_TOKENS_PER_MINUTE;
  const usable = GENERATION_CHAIN.filter((l) => l.provider !== "groq" || fitsGroq);

  const db = adminClient();
  const cooling = await coolingModels(db);
  const live = usable.filter((l) => !cooling.has(l.model));
  // If everything is cooling, still try the last resort rather than give up.
  const links = live.length > 0 ? live : [GENERATION_CHAIN.at(-1)!];

  const call = (link: Link) =>
    link.provider === "groq"
      ? groqGenerate<T>(link.model, prompt, responseSchema, outputTokens)
      : geminiGenerate<T>(link.model, prompt, responseSchema);

  let lastError = "";
  for (const link of links) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const data = await call(link);
        await recordSuccess(db, link.model);
        return { data, model: link.model };
      } catch (err) {
        if (!(err instanceof ProviderError)) {
          // Network failure or similar: not the model's fault, try the next one.
          lastError = err instanceof Error ? err.message : String(err);
          break;
        }
        lastError = `${link.model}: ${err.message}`;

        if (err.status === 429 || err.status === 503) {
          // 503 clears quickly, so retry in place first; 429 means step aside.
          if (err.status === 503 && attempt < 2) {
            await sleep((err.retryDelaySeconds ?? 2 ** attempt) * 1000);
            continue;
          }
          await recordFailure(db, link.model, err.status, err.message, err.retryDelaySeconds);
        }
        break; // move to the next model
      }
    }
  }

  throw new Error(`Generation failed: ${lastError}`);
}
