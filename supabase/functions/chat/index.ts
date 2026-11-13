import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { http, isUuidOrEmpty, streamHeaders } from "../_shared/http.ts";
import { LIMITS, logError, takeRateLimit, TOO_MANY } from "../_shared/security.ts";
import { runChat } from "./core.ts";

/**
 * AI Chat: one request per message. The reply comes back in the response, and
 * both messages are saved to chat_messages under a chat_conversations row.
 *
 * Auth: verify_jwt is on, and every database call goes through a client
 * carrying the caller's JWT, so RLS applies. Provider keys stay server-side.
 * Only allowed sites may call it (_shared/http.ts), and each student has a
 * rate limit, since every message costs AI calls.
 */

/** Inside the platform's 150s request limit, with room to report a failure. */
const BUDGET_MS = 100_000;

Deno.serve(async (req: Request) => {
  const { allowed, json, preflight } = http(req);
  if (req.method === "OPTIONS") return preflight();
  if (!allowed) return json({ error: "This site isn't allowed to use Novi." }, 403);
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Sign in to chat with Novi." }, 401);

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: userData } = await db.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "Your session has ended. Sign in again." }, 401);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  if (!body || typeof body !== "object") return json({ error: "Invalid request" }, 400);
  // Malformed ids would only produce database errors further in.
  if (!isUuidOrEmpty(body.conversation_id) || !isUuidOrEmpty(body.study_set_id) || !isUuidOrEmpty(body.material_id)) {
    return json({ error: "Invalid request" }, 400);
  }
  if (body.message !== undefined && typeof body.message !== "string") return json({ error: "Invalid request" }, 400);

  if (!(await takeRateLimit(user.id, LIMITS.chat))) return json({ error: TOO_MANY }, 429);

  const signal = AbortSignal.timeout(BUDGET_MS);

  if (body.stream !== true) {
    const { status, body: result } = await runChat(db, user, body, signal);
    return json(result, status);
  }

  // Streamed: one JSON line as soon as the student's message is saved, so the
  // app can show it as sent while Novi is still answering, then one line with
  // the usual result and its status.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The app went away; keep going so the reply is still saved.
        }
      };
      try {
        const { status, body: result } = await runChat(db, user, body, signal, {
          onSaved: (conversation, userMessage) => send({ type: "saved", conversation, user_message: userMessage }),
        });
        send({ type: "done", status, body: result });
      } catch (err) {
        logError("chat", err, { user: user.id });
        send({ type: "done", status: 500, body: { error: "Novi couldn't answer right now. Try again." } });
      }
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });
  return new Response(stream, { headers: streamHeaders(req) });
});
