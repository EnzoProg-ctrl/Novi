import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { embedMany } from "../_shared/ai/gemini.ts";
import { http } from "../_shared/http.ts";
import { LIMITS, logError, takeRateLimit } from "../_shared/security.ts";
import { CACHE_HOURS, MODEL_VERSION, RERANK } from "../_shared/recommend/config.ts";
import { loadContext, semanticRetriever } from "../_shared/recommend/context.ts";
import { runPipeline } from "../_shared/recommend/pipeline.ts";

/**
 * Personalised study recommendations for the signed-in student.
 *
 * Reuses the last batch while nothing it was based on has changed (the
 * signature); otherwise runs the pipeline (_shared/recommend) and saves the
 * new batch to `recommendations`, expiring the previous one. A failure at any
 * step returns the last saved batch rather than an error, so Home keeps
 * working.
 *
 * Auth: verify_jwt is on and every query uses the caller's JWT, so RLS keeps
 * it to their own records. The service role is only used by takeRateLimit.
 * The only AI call is embedding topic names (once per topic, kept on the
 * topic); no answers or scores leave the database.
 */

const COLUMNS = "id, kind, title, rationale, topic_id, study_set_id, priority, rank, action, evidence, signature, created_at";

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

/** What the app needs: no scores, no probabilities. */
function toClient(row: Row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    reason: row.rationale,
    topic: row.topic_id ? { id: row.topic_id, name: row.evidence?.topic ?? null } : null,
    pack: row.study_set_id ? { id: row.study_set_id, title: row.evidence?.pack ?? null } : null,
    action: row.action,
    priority: row.priority,
  };
}

function validTimeZone(tz: unknown): string {
  if (typeof tz !== "string" || tz.length > 64) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

Deno.serve(async (req: Request) => {
  const { allowed, json, preflight } = http(req);
  if (req.method === "OPTIONS") return preflight();
  if (!allowed) return json({ error: "This site isn't allowed to use Novi." }, 403);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Sign in to see recommendations." }, 401);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await db.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "Your session has ended. Sign in again." }, 401);

  let body: Row = {};
  try {
    body = await req.json();
  } catch {
    /* an empty body is fine */
  }
  if (!body || typeof body !== "object") body = {};
  const timeZone = validTimeZone(body.tz);
  const now = new Date();

  // The batch on screen now, if any.
  const { data: pendingRows, error: pendingError } = await db.from("recommendations")
    .select(COLUMNS)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .not("batch_id", "is", null)
    .order("rank", { ascending: true })
    .limit(RERANK.limit);
  if (pendingError) logError("recommend.load_cached", pendingError, { user: user.id });
  const cached = (pendingRows ?? []) as Row[];
  const fallback = (reason: string) => json({ recommendations: cached.map(toClient), cached: true, degraded: reason });

  let loaded;
  try {
    loaded = await loadContext(db, user.id, now, timeZone);
  } catch (err) {
    logError("recommend.load_context", err, { user: user.id });
    return fallback("context");
  }

  const fresh = cached.length > 0 &&
    cached[0].signature === loaded.signature &&
    now.getTime() - new Date(cached[0].created_at).getTime() < CACHE_HOURS * 3_600_000;
  if (fresh && body.refresh !== true) {
    return json({ recommendations: cached.map(toClient), cached: true });
  }

  if (!(await takeRateLimit(user.id, LIMITS.recommend))) return fallback("rate_limited");

  const embeddings = Boolean(Deno.env.get("GEMINI_API_KEY"));
  const retriever = embeddings
    ? semanticRetriever(db, (texts) => embedMany(texts, AbortSignal.timeout(15_000)))
    : null;

  let result;
  try {
    result = await runPipeline(loaded.ctx, {
      retriever,
      timeZone,
      log: (event) => console.log(JSON.stringify({ recommend: event, user: user.id })),
    });
  } catch (err) {
    logError("recommend.pipeline", err, { user: user.id });
    return fallback("pipeline");
  }

  // Save the new batch first, then retire the old one, so there is never a
  // moment with nothing to show.
  const batchId = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + CACHE_HOURS * 3_600_000).toISOString();
  let saved: Row[] = [];
  if (result.recommendations.length > 0) {
    const { data, error } = await db.from("recommendations").insert(
      result.recommendations.map((r) => ({
        user_id: user.id,
        kind: r.kind,
        title: r.title.slice(0, 200),
        rationale: r.reason,
        topic_id: r.topicId,
        study_set_id: r.packId,
        priority: r.priority,
        score: r.score,
        rank: r.rank,
        action: r.action,
        evidence: r.evidence,
        status: "pending",
        batch_id: batchId,
        signature: loaded.signature,
        model_version: MODEL_VERSION,
        expires_at: expiresAt,
      })),
    ).select(COLUMNS);
    if (error) {
      logError("recommend.save", error, { user: user.id });
      return fallback("save");
    }
    saved = (data ?? []).sort((a: Row, b: Row) => a.rank - b.rank);
  }
  if (cached.length > 0) {
    const { error } = await db.from("recommendations")
      .update({ status: "expired" })
      .in("id", cached.map((r) => r.id))
      .eq("status", "pending");
    if (error) logError("recommend.expire", error, { user: user.id });
  }

  console.log(JSON.stringify({ recommend_done: { user: user.id, retrieval: result.retrieval, ...result.stats, chosen: saved.length } }));
  return json({ recommendations: saved.map(toClient), cached: false, retrieval: result.retrieval });
});
