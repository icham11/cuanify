/**
 * Crumbella — Service Worker
 *
 * Strategy:
 *  - App Shell (layout, CSS, fonts): Cache-first
 *  - API calls: Network-first with offline fallback
 *  - Images: Cache-first with expiry
 *  - Offline fallback page for navigations
 */

// Bump this when shipped client code changes to invalidate stale mobile caches.
const CACHE_VERSION = "umkm-v3";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  "/offline",
  "/manifest.json",
];

// ─── Install ─────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn("[SW] Pre-cache partial failure:", err);
      });
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// ─── Activate ────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("umkm-") && k !== STATIC_CACHE && k !== DYNAMIC_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch ───────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip chrome-extension, ws://, etc.
  if (!url.protocol.startsWith("http")) return;

  // Strategy: API routes → Network-first
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstWithCache(request, API_CACHE, 60));
    return;
  }

  // Strategy: Next.js static assets (_next/static) → Cache-first
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      networkFirstWithCache(request, STATIC_CACHE, 60 * 60 * 24 * 7)
    );
    return;
  }

  // Strategy: Images → Cache-first with 7-day expiry
  if (request.destination === "image") {
    event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
    return;
  }

  // Strategy: Navigation (HTML pages) → Network-first with offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful navigations
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          // Try from cache first
          return caches.match(request).then((cached) => {
            if (cached) return cached;
            // Fallback to offline page
            return caches.match("/offline").then((offline) => {
              return offline || new Response("Anda sedang offline", {
                status: 503,
                headers: { "Content-Type": "text/html; charset=utf-8" },
              });
            });
          });
        })
    );
    return;
  }

  // Strategy: Everything else → Cache-first
  event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
});

// ─── Strategies ──────────────────────────────────────────────

/**
 * Cache-first: Try cache, fall back to network.
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("", { status: 408 });
  }
}

/**
 * Network-first: Try network, fall back to cache.
 * For API calls, caches responses for `maxAgeSeconds`.
 */
async function networkFirstWithCache(request, cacheName, maxAgeSeconds) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      // Store with timestamp header
      const headers = new Headers(response.headers);
      headers.set("sw-cached-at", Date.now().toString());
      const cachedResponse = new Response(await response.clone().blob(), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      cache.put(request, cachedResponse);
    }
    return response;
  } catch {
    // Network failed → try cache
    const cached = await caches.match(request);
    if (cached) {
      // Check if cached response is still fresh
      const cachedAt = cached.headers.get("sw-cached-at");
      if (cachedAt) {
        const age = (Date.now() - Number(cachedAt)) / 1000;
        if (age > maxAgeSeconds) {
          // Stale, but better than nothing when offline
          console.warn(`[SW] Serving stale API cache (${Math.round(age)}s old)`);
        }
      }
      return cached;
    }

    return new Response(
      JSON.stringify({ error: "Anda sedang offline", offline: true }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
}
