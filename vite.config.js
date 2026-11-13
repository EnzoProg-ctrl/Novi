import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The security headers live in vercel.json (what production serves).
// `npm run preview` serves the same ones, so the Content Security Policy can be
// checked locally before deploying. The dev server leaves them off: Vite's hot
// reload needs inline scripts.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf-8'))
const securityHeaders = Object.fromEntries(
  (vercel.headers.find((h) => h.source === '/(.*)')?.headers ?? [])
    // HTTPS-only rules would get in the way on plain http://localhost.
    .filter((h) => h.key !== 'Strict-Transport-Security')
    .map((h) => [h.key, h.value.replace(/;\s*upgrade-insecure-requests/, '')]),
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: { headers: securityHeaders },
})
