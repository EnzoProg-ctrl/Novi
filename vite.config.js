import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
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

/** Every file in a folder, as paths relative to it. */
function filesIn(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesIn(path).map((f) => join(name, f)) : [name]
  })
}

/**
 * Writes dist/sw.js from src/pwa/service-worker.js, with the list of files to
 * keep for offline use and a version that changes whenever they do.
 */
function serviceWorker() {
  return {
    name: 'novi-service-worker',
    apply: 'build',
    writeBundle(options) {
      const dist = options.dir
      const files = filesIn(dist)
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map') && !f.startsWith('.'))
        .map((f) => '/' + relative('.', f).split('\\').join('/'))
      const version = createHash('sha256')
        .update(files.map((f) => f + readFileSync(join(dist, f.slice(1))).length).join('|'))
        .digest('hex')
        .slice(0, 12)
      const template = readFileSync(new URL('./src/pwa/service-worker.js', import.meta.url), 'utf-8')
      writeFileSync(
        join(dist, 'sw.js'),
        template.replace('__NOVI_VERSION__', version).replace('__NOVI_PRECACHE__', JSON.stringify(files)),
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorker()],
  preview: { headers: securityHeaders },
})
