import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { http } from "../_shared/http.ts";
import { LIMITS, logError, logEvent, takeRateLimit } from "../_shared/security.ts";

/**
 * Permanently deletes the calling student's account.
 *
 * Runs server-side because deleting an auth user needs the service role, which
 * must never reach the browser. The caller is identified from their JWT (never
 * from the request body), must re-enter their password, and must send the
 * typed confirmation.
 *
 * Order matters: uploaded files are removed first, because storage objects are
 * not tied to the user by a foreign key and would otherwise be orphaned. Only
 * then is the auth user deleted; every table in public references auth.users
 * with ON DELETE CASCADE, so that one delete removes all of their data. If the
 * files cannot be removed, nothing is deleted.
 *
 * Attempts are rate limited per student (so the password check can't be used
 * to guess passwords) and recorded in security_events.
 */

const BUCKET = "study-materials";

/** Every object under <user_id>/, which is where the upload flow puts files. */
async function removeUserFiles(admin: SupabaseClient, userId: string): Promise<number> {
  const bucket = admin.storage.from(BUCKET);
  const paths: string[] = [];

  const { data: top, error } = await bucket.list(userId, { limit: 1000 });
  if (error) throw error;
  for (const entry of top ?? []) {
    // Files have an id; folders (one per material) do not.
    if (entry.id) {
      paths.push(`${userId}/${entry.name}`);
      continue;
    }
    const { data: files, error: innerError } = await bucket.list(`${userId}/${entry.name}`, { limit: 1000 });
    if (innerError) throw innerError;
    for (const file of files ?? []) paths.push(`${userId}/${entry.name}/${file.name}`);
  }

  for (let i = 0; i < paths.length; i += 100) {
    const { error: removeError } = await bucket.remove(paths.slice(i, i + 100));
    if (removeError) throw removeError;
  }
  return paths.length;
}

Deno.serve(async (req: Request) => {
  const { allowed, json, preflight } = http(req);
  if (req.method === "OPTIONS") return preflight();
  if (!allowed) return json({ error: "This site isn't allowed to use Novi." }, 403);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Sign in again to delete your account." }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await asUser.auth.getUser();
  const user = userData?.user;
  if (!user?.email) return json({ error: "Your session has ended. Sign in again." }, 401);

  let body: { password?: string; confirm?: string } = {};
  try {
    body = await req.json();
  } catch { /* handled below */ }
  if (body.confirm !== "DELETE") return json({ error: "Type DELETE to confirm." }, 400);
  if (typeof body.password !== "string" || !body.password) return json({ error: "Enter your password to confirm." }, 400);

  if (!(await takeRateLimit(user.id, LIMITS.deleteAccount))) {
    return json({ error: "Too many attempts. Wait 15 minutes, then try again." }, 429);
  }

  // Re-authenticate: a valid session alone is not enough to delete an account.
  const checker = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: passwordError } = await checker.auth.signInWithPassword({
    email: user.email,
    password: body.password,
  });
  if (passwordError) {
    await logEvent(user.id, "account.delete_password_failed");
    return json({ error: "That password is not correct." }, 403);
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let filesRemoved = 0;
  try {
    filesRemoved = await removeUserFiles(admin, user.id);
  } catch (err) {
    logError("delete_account.files", err, { user: user.id });
    return json({ error: "Your files could not be removed, so nothing was deleted. Try again." }, 500);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    logError("delete_account.user", deleteError, { user: user.id });
    return json({
      error: "Your uploaded files were removed, but the account could not be deleted. Try again.",
    }, 500);
  }

  await logEvent(user.id, "account.deleted", { files_removed: filesRemoved });
  return json({ ok: true, files_removed: filesRemoved });
});
