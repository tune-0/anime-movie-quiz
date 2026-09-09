/* =========================================================
   SERVICE WORKER — caches the app shell for offline access.
   Live API calls (TMDB, AniList) are never cached — they
   always go straight to the network so results stay current.
   ========================================================= */

const CACHE_NAME = "screening-room-v1";

const APP_SHELL = [
    "./",
    "./index.html",
    "./css/styles.css",
    "./js/app.js",
    "./js/engine.js",
    "./js/data.js",
    "./js/api.js",
    "./js/genre-map.js",
    "./icons/icon-192.png",
    "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);

    // Only handle our own files. TMDB/AniList requests pass through
    // untouched so quiz results are always fresh.
    if (url.origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
});