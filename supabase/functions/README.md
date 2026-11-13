# Edge Functions

These run on Supabase (Deno), server-side, where the AI keys live. Nothing here
ships to the browser.

**Editor setup:** install the Deno extension for VS Code (`denoland.vscode-deno`,
also listed in `.vscode/extensions.json`). Without it, VS Code checks these files
as plain TypeScript and reports errors such as `Cannot find name 'Deno'` or
`Cannot find module 'jsr:...'` that do not exist at runtime.

All functions have `verify_jwt` on. User data goes through a client carrying the
caller's JWT, so RLS still applies. The service role is used only for
`ai_model_health` (circuit-breaker state), `security_events` (audit trail and
rate limits), and in `delete-account`.

## Security

- **Allowed sites (CORS).** Only the local dev servers and the sites listed in
  the `ALLOWED_ORIGINS` secret may call these functions from a browser; any other
  site gets a 403. **Set this secret before deploying the app**, for example
  `ALLOWED_ORIGINS=https://novi.vercel.app,https://www.yourdomain.com`
  (Supabase dashboard -> Edge Functions -> Secrets). See `_shared/http.ts`.
- **Rate limits per student** (`_shared/security.ts`, `LIMITS`): chat 8/min and
  150/day; building a pack 5 per 10 min and 30/day; account deletion attempts
  5 per 15 min. Counted in `security_events` by the `take_rate_limit` function.
- **Errors.** Students only see messages written for them (`UserError`).
  Database, storage and AI provider errors are logged here (`logError`) and
  replaced with a plain message.
- **Audit trail.** `security_events` records rate-limit hits, failed password
  checks for account deletion and deleted accounts. Service role only; rows
  older than 90 days are pruned.

## process-material

Turns an uploaded material into a study pack: extract -> chunk -> embed ->
generate -> save, moving `materials.status` through
`uploaded → extracting → embedding → generating → ready | failed`.

- Reads text, PDF, PPTX, DOCX and images (`extract.ts`). PPTX/DOCX are unzipped
  locally; PDFs and images are read by Gemini.
- Answers 202 straight away and does the work in the background within a time
  budget, so a run always ends as `ready` or a clear `failed`.

## chat

AI Chat. `core.ts` handles one turn; `guard.ts` checks each message first (study
help, quiz, cheating, code, off-topic) and removes code from replies; `quiz.ts`
saves practice questions into a pack.

## delete-account

Deletes the caller's account and files after re-checking their password.

## _shared

- `ai/` - provider adapters (`gemini.ts`, `groq.ts`), the generation chain with
  per-call time limits (`generate.ts`) and the circuit breaker (`breaker.ts`).
- `packs.ts` - the study pack schema and the helpers that validate and save it.
- `http.ts` - CORS, the Origin check, JSON responses and input checks.
- `security.ts` - safe error messages, rate limits and the audit log.

Things worth knowing:

- **Embeddings must be normalised in code.** `gemini-embedding-001` does not
  normalise truncated (1536-dim) output; measured magnitude was 0.698. Cosine
  similarity over un-normalised vectors ranks results wrong *without erroring*.
- **Thinking level** goes in `generationConfig.thinkingConfig.thinkingLevel` on
  `generateContent` (accepted by `gemini-3.5-flash-lite`).
- Deploying with the Supabase MCP or API: shared files are passed with names like
  `../_shared/ai/gemini.ts`.
- Type-check before deploying: `npx deno@2 check chat/index.ts process-material/index.ts delete-account/index.ts`
  (from this folder). `Cannot find name 'EdgeRuntime'` is expected: the
  platform provides it at runtime.
