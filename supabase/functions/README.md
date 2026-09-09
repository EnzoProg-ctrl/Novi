# Edge Functions

These are deployed to the Supabase project and run server-side, where the
Gemini API key lives. Nothing here ships to the browser.

## process-material

Turns an uploaded material into a study pack: extract -> chunk -> embed ->
generate -> persist, moving `materials.status` through
`uploaded → extracting → embedding → generating → ready | failed`.

- `verify_jwt` is **on**. Every user-data query goes through a client carrying
  the caller's JWT, so RLS still applies. The service role is used only for
  `ai_model_health`, which holds no user data.
- Text files only. PDF/PPTX extraction belongs in the Python service.

## gemini.ts

The provider adapter. Model IDs, request shapes, the circuit breaker and the
L2 normalisation all live here — swapping provider should mean rewriting this
one file.

Two non-obvious things worth keeping:

- **Embeddings must be normalised in code.** `gemini-embedding-001` does not
  normalise truncated (1536-dim) output; measured magnitude was 0.698. Cosine
  similarity over un-normalised vectors ranks results wrong *without erroring*.
- **`thinking_level` is not supported on `generateContent`.** It belongs to the
  newer `/v1beta/interactions` endpoint and is rejected here as an unknown
  field.

## Deploying

Requires the Supabase CLI, linked to the project:

```bash
npx supabase functions deploy process-material
```

`GEMINI_API_KEY` is set as an Edge Function secret in the dashboard, never in
`.env.local` (that file feeds the Vite bundle and would ship the key to the
browser).
