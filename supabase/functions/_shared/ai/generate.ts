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

type Link = {
  provider: "groq" | "gemini";
  model: string;
  /** How long one attempt may take before the chain gives up on it. */
  timeoutMs: number;
  thinkingLevel?: "low";
};

/**
 * Preferred first. Measured on a 13,000-character PDF (2026-10-23): Groq 5s,
 * Flash-Lite 14s with low thinking, while 3.8 Flash did not answer within
 * 140s. So 3.8 Flash is the last resort, and every attempt has a time limit.
 */
export const GENERATION_CHAIN: Link[] = [
  { provider: "groq", model: "openai/gpt-oss-120b", timeoutMs: 40_000 },
  { provider: "gemini", model: "gemini-3.5-flash-lite", timeoutMs: 60_000, thinkingLevel: "low" },
  { provider: "gemini", model: "gemini-3.8-flash", timeoutMs: 60_000 },
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
 *
 * `skipGroq` is for calls made several at a time: Groq's per-minute token cap
 * is shared, so parallel calls would only trip it and cool Groq down.
 *
 * `signal` is the whole run's time budget. Each attempt also has its own
 * limit, so one slow model cannot use up the time the next one needs.
 */
export async function generateJson<T>(
  prompt: string,
  responseSchema: Record<string, unknown>,
  { outputTokens, signal, skipGroq = false }: { outputTokens: number; signal: AbortSignal; skipGroq?: boolean },
): Promise<GenerateResult<T>> {
  const fitsGroq = !skipGroq && hasGroqKey() &&
    estimateTokens(prompt) + outputTokens <= GROQ_TOKENS_PER_MINUTE;
  const usable = GENERATION_CHAIN.filter((l) => l.provider !== "groq" || fitsGroq);

  const db = adminClient();
  const cooling = await coolingModels(db);
  const live = usable.filter((l) => !cooling.has(l.model));
  // If everything is cooling, still try the last resort rather than give up.
  const links = live.length > 0 ? live : [GENERATION_CHAIN.at(-1)!];

  const call = (link: Link) => {
    const attemptSignal = AbortSignal.any([signal, AbortSignal.timeout(link.timeoutMs)]);
    return link.provider === "groq"
      ? groqGenerate<T>(link.model, prompt, responseSchema, outputTokens, attemptSignal)
      : geminiGenerate<T>(link.model, prompt, responseSchema, attemptSignal, link.thinkingLevel);
  };

  let lastError = "";
  for (const link of links) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (signal.aborted) throw signal.reason;
      const started = Date.now();
      try {
        const data = await call(link);
        await recordSuccess(db, link.model);
        return { data, model: link.model };
      } catch (err) {
        // The run's budget is spent: stop here, the caller reports it.
        if (signal.aborted) throw signal.reason;
        const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        console.log(JSON.stringify({
          generation_attempt_failed: link.model,
          status: err instanceof ProviderError ? err.status : null,
          ms: Date.now() - started,
          error: message.slice(0, 300),
        }));
        if (!(err instanceof ProviderError)) {
          // Timed out, network failure or similar: try the next model.
          lastError = `${link.model}: ${message}`;
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
