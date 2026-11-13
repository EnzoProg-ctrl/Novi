/**
 * Security helpers shared by the Edge Functions:
 *
 * - UserError and publicMessage: only messages written for students are ever
 *   shown to them. Database, storage and AI provider errors are logged here,
 *   server-side, and replaced with a plain message.
 * - takeRateLimit: per-student limits on the endpoints that cost money (AI)
 *   or guard something sensitive (the account-deletion password check).
 * - logEvent: an audit trail in security_events (service role only).
 */

import { adminClient } from "./ai/breaker.ts";

/** An error whose message is written for the student and safe to show. */
export class UserError extends Error {}

/** The message to show the student: theirs if it is a UserError, otherwise `fallback`. */
export function publicMessage(err: unknown, fallback: string): string {
  return err instanceof UserError ? err.message : fallback;
}

/** Logs the real error server-side. Never pass passwords or tokens in `context`. */
export function logError(where: string, err: unknown, context: Record<string, unknown> = {}) {
  const message = err instanceof Error ? err.message : typeof err === "object" ? JSON.stringify(err) : String(err);
  console.log(JSON.stringify({ error_at: where, error: message.slice(0, 500), ...context }));
}

export type Limit = { kind: string; perShort: number; shortSeconds: number; perLong: number; longSeconds: number };

/** Limits per student. Generous for real studying, tight enough to stop abuse. */
export const LIMITS = {
  chat: { kind: "chat.send", perShort: 8, shortSeconds: 60, perLong: 150, longSeconds: 86_400 },
  processMaterial: { kind: "material.process", perShort: 5, shortSeconds: 600, perLong: 30, longSeconds: 86_400 },
  deleteAccount: { kind: "account.delete_attempt", perShort: 5, shortSeconds: 900, perLong: 10, longSeconds: 86_400 },
  // Only recomputing counts; returning a cached batch is free.
  recommend: { kind: "recommend.compute", perShort: 20, shortSeconds: 600, perLong: 200, longSeconds: 86_400 },
} satisfies Record<string, Limit>;

/**
 * Uses up one request against `limit` and says whether it is allowed. If the
 * check itself fails, the request is allowed (and the failure logged): a
 * hiccup in bookkeeping should not lock students out.
 */
export async function takeRateLimit(userId: string, limit: Limit, detail: Record<string, unknown> = {}): Promise<boolean> {
  try {
    const { data, error } = await adminClient().rpc("take_rate_limit", {
      p_user: userId,
      p_kind: limit.kind,
      p_short_limit: limit.perShort,
      p_short_seconds: limit.shortSeconds,
      p_long_limit: limit.perLong,
      p_long_seconds: limit.longSeconds,
      p_detail: detail,
    });
    if (error) throw error;
    return data !== false;
  } catch (err) {
    logError("rate_limit", err, { kind: limit.kind });
    return true;
  }
}

/** Records a security-relevant event. Best effort: never fails the request. */
export async function logEvent(userId: string | null, kind: string, detail: Record<string, unknown> = {}) {
  try {
    const { error } = await adminClient().from("security_events").insert({ user_id: userId, kind, detail });
    if (error) throw error;
  } catch (err) {
    logError("log_event", err, { kind });
  }
}

export const TOO_MANY = "You're going a little fast. Wait a moment, then try again.";
