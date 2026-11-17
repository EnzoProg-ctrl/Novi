import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { adminClient } from "../_shared/ai/breaker.ts";
import { http, isUuidOrEmpty } from "../_shared/http.ts";
import { topicLookup } from "../_shared/packs.ts";
import { LIMITS, logError, takeRateLimit, TOO_MANY } from "../_shared/security.ts";

/**
 * Sharing study packs by link (Study Packs -> Share link).
 *
 *   create  { study_set_ids, expires_days }  -> { code, expires_at }
 *   preview { code }  -> who shared what, before the receiver adds it
 *   accept  { code }  -> copies the packs into the receiver's account
 *
 * Receivers get their own copy (Shared with Me), so practice, progress and
 * recommendations work as for their own packs. A receiver never reads the
 * sender's rows: this function does, with the service role, and only for the
 * packs a valid, unexpired link names. Everything written to the receiver's
 * account goes through a client carrying their JWT, so row level security
 * checks every row. The service role is used only to read the shared packs
 * and to record who added a link (pack_share_redemptions has no insert
 * policy, so a student can't forge one).
 *
 * No AI calls: sharing costs nothing beyond the database.
 */

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const MAX_PACKS = 20;
const EXPIRY_DAYS = new Set([1, 7, 30]);

/** 18 random bytes, base64url: 24 characters, unguessable. */
function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const validCode = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(v);

/** How a student is shown to others: their display name, never their email. */
function displayName(user: { user_metadata?: Record<string, unknown> }): string {
  const name = String(user.user_metadata?.display_name ?? "").trim().replace(/\s+/g, " ");
  return name ? name.slice(0, 80) : "A Novi student";
}

/** A link by its code, with the packs it still holds (a deleted pack drops out). */
async function loadShare(admin: SupabaseClient, code: string) {
  const { data: share, error } = await admin.from("pack_shares")
    .select("id, user_id, sender_name, expires_at").eq("code", code).maybeSingle();
  if (error) throw error;
  if (!share) return null;
  const { data: items, error: itemsError } = await admin.from("pack_share_items")
    .select("study_set_id, study_sets ( id, title, status, questions ( count ), key_concepts ( count ) )")
    .eq("share_id", share.id);
  if (itemsError) throw itemsError;
  const countOf = (rel: unknown) => (Array.isArray(rel) ? (rel[0]?.count ?? 0) : 0);
  const packs = (items ?? [])
    .map((i: Row) => i.study_sets)
    .filter((s: Row | null) => s && s.status === "ready")
    .map((s: Row) => ({ id: s.id as string, title: s.title as string, questions: countOf(s.questions), concepts: countOf(s.key_concepts) }));
  return { share, packs, expired: Date.parse(share.expires_at) <= Date.now() };
}

/** Copies one shared pack into the receiver's account; returns the new pack. */
async function copyPack(admin: SupabaseClient, db: SupabaseClient, receiverId: string, sourceId: string, share: Row) {
  const [setRes, sumRes, conRes, qRes] = await Promise.all([
    admin.from("study_sets").select("id, title").eq("id", sourceId).single(),
    admin.from("summaries").select("kind, content, reading_level").eq("study_set_id", sourceId),
    admin.from("key_concepts").select("term, definition, example, importance, position, topics ( name )").eq("study_set_id", sourceId),
    admin.from("questions").select("type, prompt, choices, correct_answer, explanation, difficulty, bloom_level, position, topics ( name )").eq("study_set_id", sourceId),
  ]);
  for (const r of [setRes, sumRes, conRes, qRes]) if (r.error) throw r.error;
  const source = setRes.data as Row;
  const summaries = (sumRes.data ?? []) as Row[];
  const concepts = (conRes.data ?? []) as Row[];
  const questions = (qRes.data ?? []) as Row[];
  const overview = summaries.find((s) => s.kind === "overview")?.content ?? summaries[0]?.content ?? "";

  // Every pack has a material behind it, so it can be deleted from Home like
  // any upload; for a shared pack it's the summary itself.
  const { data: material, error: matError } = await db.from("materials").insert({
    user_id: receiverId,
    title: source.title,
    source_type: "text",
    status: "ready",
    extracted_text: overview || source.title,
    word_count: overview ? overview.split(/\s+/).length : 0,
    processed_at: new Date().toISOString(),
  }).select("id").single();
  if (matError || !material) throw matError ?? new Error("material not created");

  try {
    const { data: set, error: setError } = await db.from("study_sets").insert({
      user_id: receiverId,
      material_id: material.id,
      title: source.title,
      status: "ready",
      generation_model: "shared",
      generation_params: { source: "share" },
      shared_from: share.id,
      shared_by_name: share.sender_name,
      shared_source_id: source.id,
    }).select("id, title").single();
    if (setError || !set) throw setError ?? new Error("pack not created");

    if (summaries.length) {
      const { error } = await db.from("summaries").insert(
        summaries.map((s) => ({ study_set_id: set.id, user_id: receiverId, kind: s.kind, content: s.content, reading_level: s.reading_level })),
      );
      if (error) throw error;
    }

    // Topics are the receiver's own, matched or created by name.
    const names = [...new Set([...concepts, ...questions].map((r) => r.topics?.name).filter(Boolean))] as string[];
    const { topicIdFor } = await topicLookup(db, receiverId, null, names.map((name) => ({ name })));

    if (concepts.length) {
      const { error } = await db.from("key_concepts").insert(concepts.map((c) => ({
        study_set_id: set.id, user_id: receiverId, topic_id: topicIdFor(c.topics?.name),
        term: c.term, definition: c.definition, example: c.example, importance: c.importance, position: c.position,
      })));
      if (error) throw error;
    }
    if (questions.length) {
      const { error } = await db.from("questions").insert(questions.map((q) => ({
        study_set_id: set.id, user_id: receiverId, topic_id: topicIdFor(q.topics?.name),
        type: q.type, prompt: q.prompt, choices: q.choices, correct_answer: q.correct_answer,
        explanation: q.explanation, difficulty: q.difficulty, bloom_level: q.bloom_level, position: q.position,
      })));
      if (error) throw error;
    }
    return set as { id: string; title: string };
  } catch (err) {
    // Half a pack is worse than none: the material's cascade removes the rest.
    await db.from("materials").delete().eq("id", material.id);
    throw err;
  }
}

Deno.serve(async (req: Request) => {
  const { allowed, json, preflight } = http(req);
  if (req.method === "OPTIONS") return preflight();
  if (!allowed) return json({ error: "This site isn't allowed to use Novi." }, 403);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Sign in to share study packs." }, 401);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await db.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "Your session has ended. Sign in again." }, 401);

  let body: Row;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  if (!body || typeof body !== "object") return json({ error: "Invalid request" }, 400);
  const admin = adminClient();

  try {
    // ── Make a link ─────────────────────────────────────────────
    if (body.action === "create") {
      const ids = Array.isArray(body.study_set_ids) ? [...new Set(body.study_set_ids)] : [];
      if (ids.length === 0 || ids.length > MAX_PACKS || !ids.every((id) => typeof id === "string" && isUuidOrEmpty(id))) {
        return json({ error: `Choose between 1 and ${MAX_PACKS} packs to share.` }, 400);
      }
      const days = Number(body.expires_days);
      if (!EXPIRY_DAYS.has(days)) return json({ error: "Choose how long the link should work." }, 400);
      if (!(await takeRateLimit(user.id, LIMITS.shareCreate))) return json({ error: TOO_MANY }, 429);

      // Row level security: only the student's own packs come back.
      const { data: own, error: ownError } = await db.from("study_sets").select("id, status").in("id", ids);
      if (ownError) throw ownError;
      if ((own ?? []).length !== ids.length) return json({ error: "Some of those packs couldn't be found." }, 404);
      if ((own ?? []).some((s: Row) => s.status !== "ready")) return json({ error: "Only finished packs can be shared." }, 409);

      const code = newCode();
      const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
      const { data: share, error: shareError } = await db.from("pack_shares")
        .insert({ code, user_id: user.id, sender_name: displayName(user), expires_at: expiresAt })
        .select("id, code, expires_at").single();
      if (shareError || !share) throw shareError ?? new Error("link not created");
      const { error: itemsError } = await db.from("pack_share_items")
        .insert(ids.map((id) => ({ share_id: share.id, study_set_id: id, user_id: user.id })));
      if (itemsError) {
        await db.from("pack_shares").delete().eq("id", share.id);
        throw itemsError;
      }
      return json({ code: share.code, expires_at: share.expires_at, packs: ids.length });
    }

    // Both remaining actions take a link's code.
    if (!validCode(body.code)) return json({ error: "That share link isn't valid." }, 400);
    const found = await loadShare(admin, body.code);
    if (!found) return json({ error: "That share link doesn't exist." }, 404);
    const { share, packs, expired } = found;
    const own = share.user_id === user.id;
    const { data: already } = await admin.from("pack_share_redemptions")
      .select("id").eq("share_id", share.id).eq("user_id", user.id).maybeSingle();

    // ── Preview, before adding ──────────────────────────────────
    if (body.action === "preview") {
      return json({
        sender_name: share.sender_name,
        expires_at: share.expires_at,
        expired,
        own,
        already_added: Boolean(already),
        packs: packs.map(({ title, questions, concepts }) => ({ title, questions, concepts })),
      });
    }

    // ── Add to my packs ─────────────────────────────────────────
    if (body.action === "accept") {
      if (own) return json({ error: "This is your own link. Your packs are already in My Packs." }, 409);
      if (expired) return json({ error: "This share link has expired. Ask for a new one." }, 410);
      if (packs.length === 0) return json({ error: "The packs in this link are no longer available." }, 410);
      if (already) {
        const { data: mine } = await db.from("study_sets").select("id, title").eq("shared_from", share.id);
        return json({ already_added: true, sender_name: share.sender_name, added: mine ?? [] });
      }
      if (!(await takeRateLimit(user.id, LIMITS.shareAccept, { share: share.id }))) return json({ error: TOO_MANY }, 429);

      // Claim first, so two quick taps can't copy the packs twice.
      const { data: claim, error: claimError } = await admin.from("pack_share_redemptions").insert({
        share_id: share.id, user_id: user.id, owner_id: share.user_id, receiver_name: displayName(user),
      }).select("id").single();
      if (claimError) {
        if (claimError.code === "23505") {
          const { data: mine } = await db.from("study_sets").select("id, title").eq("shared_from", share.id);
          return json({ already_added: true, sender_name: share.sender_name, added: mine ?? [] });
        }
        throw claimError;
      }

      // A pack they already have from an earlier link isn't copied again.
      const { data: have } = await db.from("study_sets").select("id, title, shared_source_id")
        .in("shared_source_id", packs.map((p) => p.id));
      const existing = new Map((have ?? []).map((s: Row) => [s.shared_source_id, { id: s.id, title: s.title }]));

      const added: { id: string; title: string }[] = [];
      const kept: { id: string; title: string }[] = [];
      try {
        for (const pack of packs) {
          const prior = existing.get(pack.id);
          if (prior) kept.push(prior);
          else added.push(await copyPack(admin, db, user.id, pack.id, share));
        }
      } catch (err) {
        // Undo what was copied and release the claim, so trying again works.
        if (added.length) {
          const { data: sets } = await db.from("study_sets").select("material_id").in("id", added.map((a) => a.id));
          const materialIds = (sets ?? []).map((s: Row) => s.material_id).filter(Boolean);
          if (materialIds.length) await db.from("materials").delete().in("id", materialIds);
        }
        await admin.from("pack_share_redemptions").delete().eq("id", claim.id);
        throw err;
      }
      await admin.from("pack_share_redemptions").update({ packs_added: added.length }).eq("id", claim.id);
      return json({ already_added: false, sender_name: share.sender_name, added: [...added, ...kept], new_count: added.length });
    }

    return json({ error: "Invalid request" }, 400);
  } catch (err) {
    logError("share_packs", err, { user: user.id, action: body.action });
    return json({ error: "Sharing didn't work just now. Try again in a moment." }, 500);
  }
});
