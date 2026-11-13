/**
 * Circuit breaker shared by every generation provider.
 *
 * Edge Functions are stateless, so a rate limit hit in one invocation is
 * recorded in ai_model_health for the next one to see. Rows are keyed by model
 * name, which is unique across providers.
 */

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

/** A provider call that failed in a way the generation chain must react to. */
export class ProviderError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 when the call succeeded but the output was unusable. */
    readonly status: number,
    readonly retryDelaySeconds: number | null = null,
  ) {
    super(message);
  }
}

/** Service-role client, used *only* for ai_model_health (no user data). */
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/** Escalating cooldown so repeated quota hits back off further each time. */
function cooldownMs(failures: number, status: number): number {
  if (status === 503) return 30_000; // transient overload, clears fast
  return [60_000, 5 * 60_000, 30 * 60_000][Math.min(failures, 2)];
}

export async function coolingModels(db: SupabaseClient): Promise<Set<string>> {
  const { data } = await db
    .from("ai_model_health")
    .select("model, cooling_until")
    .gt("cooling_until", new Date().toISOString());
  return new Set((data ?? []).map((r) => r.model as string));
}

export async function recordFailure(
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

export async function recordSuccess(db: SupabaseClient, model: string) {
  await db.from("ai_model_health").upsert({
    model,
    cooling_until: null,
    consecutive_failures: 0,
    last_status: 200,
    last_error: null,
  });
}
