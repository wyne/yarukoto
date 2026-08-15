// A minimal service worker so the installable web app (see manifest.webmanifest)
// has something besides a blank page when offline. This only serves the
// *shell* — index.html, the JS bundle, fonts, icons — while offline; the task
// data itself is cached separately in localStorage (see
// mobile/src/data/cache.ts). Neither is useful alone: without this, the shell
// can't even load offline to read that data cache; without that, the shell
// would load into an empty app.
//
// Registered with a relative URL from index.html, for the same reason its
// icon hrefs are relative — this app is served from the domain root when
// self-hosted but from /<repo>/ on GitHub Pages, and a relative registration
// resolves correctly under either.

const CACHE_NAME = 'yarukoto-shell-v1';

self.addEventListener('install', () => {
  // Take over as soon as the new worker is ready. A stale worker holding an
  // old bundle hostage until every tab closes helps nobody on a single-user app.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop any cache left from a previous CACHE_NAME (a version bump here) so
      // an old bundle can't linger and get served after a rebuild.
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Sync must never be served stale — this app is poll-driven, and its whole
  // correctness rests on the client seeing the server's actual state (or a
  // clean failure) on every request, never a cached copy standing in for it.
  if (url.pathname.startsWith('/api/')) return;

  // The HTML document (a navigation, or index.html directly): network-first,
  // so a new deploy is never pinned by what's in the cache. Falls back to the
  // last cached shell only when the network is genuinely unreachable.
  if (request.mode === 'navigate' || url.pathname.endsWith('/index.html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Everything else — the JS bundle, fonts, icons, the manifest — is either
  // content-hashed by Metro or effectively static, so cache-first is safe.
  // There's no build-time precache manifest; the cache just fills in as the
  // app actually requests things, which is enough for a single-user app that
  // mostly runs from the same device.
  event.respondWith(cacheFirst(request));
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  // Only cache successful, cacheable responses — caching an opaque or error
  // response forever would pin a failure in place.
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}
