/* Simple offline cache for the app shell. Speech scoring itself always needs internet (Azure). */
const CACHE = "khawla-aussprache-v12";
const ASSETS = [
  "./", "./index.html", "./styles.css", "./app.js", "./i18n.js", "./logic.js", "./sentences.js", "./manifest.webmanifest",
  "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png",
  "./vendor/speech-sdk-1.52.0.min.js", "./vendor/qrcode.js",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.includes("/grammatik-beta/")) return; // hidden course: do not precache or route
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // never touch Azure / font requests
  // network first (so updates show up), cache as fallback
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
