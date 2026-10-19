// Offline-Cache: App funktioniert nach dem ersten Öffnen auch ohne Internet.
// Bei jeder Änderung an der App VERSION erhöhen (auch die ?v= in index.html).
const VERSION = "18";
const CACHE = "clocktower-v" + VERSION;
const FILES = ["./", "index.html", "css/style.css", "js/roles.js", "js/guide.js", "js/app.js", "js/online.js", "js/firebase-config.js", "vendor/qrcode.js",
  "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Netzwerk zuerst und am Browser-Cache vorbei (damit Updates sofort ankommen), offline aus dem Cache.
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // Nur eigene Dateien cachen – Firebase-Verbindungen laufen direkt übers Netz.
  if (new URL(e.request.url).origin !== self.location.origin) return;
  const req = e.request.mode === "navigate" ? new Request(e.request.url, { cache: "no-cache" }) : new Request(e.request, { cache: "no-cache" });
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
