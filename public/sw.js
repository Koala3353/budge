// budge· service worker — caches the app shell so it loads instantly, even on
// a slow or spotty connection, and works offline.
//
// Strategy:
//   - Cross-origin requests (Supabase API, etc.) are never touched — always
//     hit the network so data is live and never cached.
//   - Page navigations: stale-while-revalidate. Serve the cached shell
//     immediately (instant, never blocks on a slow network), and refresh it in
//     the background so the next open has the latest. The ?v= query is ignored
//     so cache-busted URLs still match.
//   - Static assets (hashed JS/CSS/images): stale-while-revalidate too. Vite
//     fingerprints filenames, so a new build naturally fetches new files.
//
// New versions arrive on the next launch, or instantly via Settings → "Check
// for updates" (which clears this cache and reloads).

const CACHE = "budge-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave the API alone

  // Page loads: serve cache first (instant), revalidate in the background.
  if (req.mode === "navigate") {
    const key = url.origin + url.pathname; // ignore ?v= so all loads share one entry
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(key);
        const fresh = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(key, res.clone());
            return res;
          })
          .catch(() => null);
        return cached || (await fresh) || Response.error();
      })()
    );
    return;
  }

  // Static assets: cached copy instantly, refresh in the background.
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            caches.open(CACHE).then((c) => c.put(req, res.clone()));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })()
  );
});
