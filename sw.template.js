// budge· service worker — SOURCE TEMPLATE.
//
// This is not shipped as-is: the precache-sw plugin in vite.config.js reads it
// at build time, replaces the __PRECACHE__ / __VERSION__ tokens with the real
// asset list + a version hash, and writes the result to dist/sw.js. It lives
// OUTSIDE public/ on purpose so Vite's public-dir copy can't overwrite the
// injected output during the build.
//
// The whole app shell (index.html + every hashed JS/CSS chunk + manifest and
// icons) is PRECACHED at install, so the app opens with no network even before
// you've visited every screen. This matters because the app is code-split:
// each screen is a lazy chunk, and a lazy-only cache would miss any screen you
// hadn't opened while online — so it wouldn't load offline.
//
// Strategy:
//   - install:  precache the shell, then take over immediately (skipWaiting).
//   - activate: delete old versioned caches, claim open pages.
//   - fetch:
//       • cross-origin (Supabase API, etc.) — never touched, always network.
//       • navigations — serve the cached index.html shell (works offline from
//         any entry URL), revalidating in the background when online.
//       • same-origin assets — cache-first (precached), revalidate in the bg.
//
// New versions arrive on the next launch (the injected version changes the SW
// bytes → the browser installs the new one), or instantly via Settings →
// "Check for updates" (which clears this cache and reloads).

const PRECACHE = __PRECACHE__; // injected at build: ["index.html", "assets/index-abc.js", ...]
const VERSION = "__VERSION__";
const CACHE = "budge-" + VERSION;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Precache each entry individually so one failure (e.g. a transient 404)
      // doesn't abort the whole install and leave the app un-cached.
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {})
        )
      );
      self.skipWaiting();
    })()
  );
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

  // Navigations: serve the cached app shell so the app opens offline from any
  // entry URL; refresh it in the background when online.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        // ignoreVary: the server may send `Vary: Origin`, and the precache
        // request's Origin differs from the page request's — without this the
        // match would miss and the app would fail to load offline.
        const shell = await cache.match("index.html", { ignoreVary: true });
        const fresh = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put("index.html", res.clone());
            return res;
          })
          .catch(() => null);
        return shell || (await fresh) || Response.error();
      })()
    );
    return;
  }

  // Same-origin assets: cached copy instantly, refresh in the background.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req, { ignoreVary: true });
      const fresh = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      return cached || (await fresh) || Response.error();
    })()
  );
});
