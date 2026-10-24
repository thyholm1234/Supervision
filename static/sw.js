// Service worker: makes the app installable and lets the shell load offline.
// Network-first for everything so code updates (including security fixes) reach users immediately;
// the cache is only a fallback. API responses are never cached.
const CACHE = "supervision-shell-v3";
const SHELL = [
  "/", "/manifest.webmanifest", "/static/css/app.css", "/static/icons/icon.svg", "/static/icons/icon-192.png",
  "/static/js/app.js", "/static/js/api.js", "/static/js/crypto.js", "/static/js/keystore.js", "/static/js/store.js",
  "/static/js/rules.js", "/static/js/templates.js", "/static/js/zip.js", "/static/js/backup.js", "/static/js/html.js", "/static/js/ui.js", "/static/js/charts.js",
  "/static/js/views/auth.js", "/static/js/views/dashboard.js", "/static/js/views/supervision.js",
  "/static/js/views/konfrontation.js", "/static/js/views/setup.js", "/static/js/views/therapy.js",
  "/static/js/views/reports.js", "/static/js/views/agreements.js", "/static/js/views/attachments.js", "/static/js/views/profile.js", "/static/js/views/admin.js",
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (ev) => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  ev.respondWith(
    fetch(ev.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(ev.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(ev.request).then((r) => r || caches.match("/"))),
  );
});
