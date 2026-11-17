/* Novi's service worker. Not imported by the app: vite.config.js fills in
   the build's file list and writes it to dist/sw.js.

   What it does:
   - Keeps a copy of the app itself (HTML, scripts, styles, images), so Novi
     opens with no internet. Packs a student kept offline live in IndexedDB
     (src/lib/offlinePacks.js), not here.
   - Pages: network first, falling back to the saved copy when offline, so an
     online student always gets the latest deploy.
   - Built files (hashed names): cache first. They never change under a name.
   - Anything on another origin (Supabase, fonts) goes straight to the
     network and is never stored: no student data ends up in this cache.

   A new version waits until every Novi tab is closed before taking over (no
   skipWaiting), so a tab that is open never loses the files it was built with. */

const VERSION = '__NOVI_VERSION__'
const PRECACHE = __NOVI_PRECACHE__
const CACHE = `novi-app-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('novi-app-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // ignoreVary: servers send headers like "Vary: Origin", and a script tag
  // with crossorigin sends an Origin the precache request didn't, so a strict
  // match would miss files that are right there.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html', { ignoreVary: true })))
    return
  }

  event.respondWith(caches.match(request, { ignoreVary: true }).then((hit) => hit ?? fetch(request)))
})
