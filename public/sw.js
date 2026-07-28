// Two caches:
// - STATIC_CACHE: immutable hashed build output/icons -- cache-first,
//   never goes stale since the filename changes whenever the content does.
// - PAGES_CACHE: HTML pages and RSC/data fetches -- network-first with a
//   cache fallback, so the app still boots and navigates when there's no
//   connection at all (e.g. opening the installed icon in a supermarket
//   with no signal), while always preferring the live network response
//   when one is available so data is never stale on a normal load.
//
// Both are strictly same-origin: Supabase API calls (a different origin)
// are never touched here -- those are handled by the app's own local
// cache + sync queue (see src/lib/useSupabaseTable.ts, src/lib/syncQueue.ts).
const STATIC_CACHE = "samama-static-v1";
const PAGES_CACHE = "samama-pages-v1";
const CURRENT_CACHES = [STATIC_CACHE, PAGES_CACHE];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !CURRENT_CACHES.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/family.jpg"
  );
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirstThenCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Last resort so *something* renders instead of the browser's own
    // offline page: the cached app shell, if this page was ever visited.
    const shell = await cache.match("/");
    if (shell) return shell;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }

  event.respondWith(networkFirstThenCache(event.request, PAGES_CACHE));
});
