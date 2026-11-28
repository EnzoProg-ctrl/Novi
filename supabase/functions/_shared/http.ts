/**
 * Request basics shared by every Edge Function: which sites may call them
 * (CORS plus an Origin check), JSON responses, and input checks.
 *
 * Allowed sites: whatever is listed in the ALLOWED_ORIGINS secret
 * (comma-separated, e.g. "https://novi.vercel.app"). Set that secret before
 * deploying the app, or the live site will be refused.
 *
 * The local dev servers (localhost) are allowed only while the
 * ALLOW_DEV_ORIGINS secret is "true": turn it on to develop locally against
 * these functions, and off for a release, so production answers only the
 * real site.
 *
 * Requests with no Origin header (curl, server-to-server) are not browsers, so
 * CORS does not apply; they still need a valid signed-in user's token.
 */

const DEV_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:4173",
];

function allowedOrigins(): Set<string> {
  const extra = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  const dev = Deno.env.get("ALLOW_DEV_ORIGINS") === "true" ? DEV_ORIGINS : [];
  return new Set([...dev, ...extra]);
}

export type Http = {
  /** False when a browser on a site that isn't allowed made the request. */
  allowed: boolean;
  json: (body: unknown, status?: number) => Response;
  /** The answer to a CORS preflight. */
  preflight: () => Response;
};

export function http(req: Request, methods = "POST, OPTIONS"): Http {
  const origin = req.headers.get("Origin");
  const allowed = !origin || allowedOrigins().has(origin);
  if (!allowed) console.log(JSON.stringify({ origin_refused: origin, path: new URL(req.url).pathname }));

  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Max-Age": "600",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  };
  if (origin && allowed) headers["Access-Control-Allow-Origin"] = origin;

  return {
    allowed,
    json: (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } }),
    preflight: () => new Response(null, { status: allowed ? 204 : 403, headers }),
  };
}

/** The headers a streamed response needs, matching http(). */
export function streamHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const headers: Record<string, string> = {
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
    "Content-Type": "application/x-ndjson",
  };
  if (origin && allowedOrigins().has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A UUID string, or null/undefined. Anything else is a malformed request. */
export const isUuidOrEmpty = (v: unknown) => v === null || v === undefined || (typeof v === "string" && UUID.test(v));
