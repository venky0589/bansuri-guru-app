/* Bansuri Guru service worker.
   HTML and the app scripts are network-first so a new build lands on reload;
   icons and the manifest stay cache-first. */
const CACHE = "bansuri-guru-v5";
const CORE = [
  "./",
  "./index.html",
  "./styles.css",
  "./data.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(CORE.map(u => c.add(u)))));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", e => { if (e.data === "skipWaiting") self.skipWaiting(); });

const fresh = req => {
  const u = new URL(req.url);
  return req.mode === "navigate" ||
         (req.headers.get("accept") || "").includes("text/html") ||
         /\.(js|css)$/.test(u.pathname);
};

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  if (fresh(req)) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req)
        .then(res => { if (res.ok) caches.open(CACHE).then(c => c.put(req, res.clone())); return res; })
        .catch(() => cached);
      return cached || net;
    })
  );
});
