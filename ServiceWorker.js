const CACHE_NAME = "datsugoku-webgl-20260623";

const PRECACHE_URLS = [
    "/",
    "/index.html",
    "/manifest.webmanifest",
    "/ServiceWorker.js",
    "/icon-192.png",
    "/icon-512.png",
    "/TemplateData/style.css",
    "/TemplateData/favicon.ico"
];

// BUILD_CACHE_URLS_START
PRECACHE_URLS.push(
    "/Build/WebGLBuild.data",
    "/Build/WebGLBuild.framework.js",
    "/Build/WebGLBuild.loader.js",
    "/Build/WebGLBuild.wasm"
);
// BUILD_CACHE_URLS_END

self.addEventListener("install", (event) => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);

            for (const url of PRECACHE_URLS) {
                try {
                    const response = await fetch(url, {
                        cache: "no-cache"
                    });

                    if (!response.ok) {
                        console.warn("[SW] skip", url, response.status);
                        continue;
                    }

                    await cache.put(url, response.clone());
                    console.log("[SW] cached", url);
                }
                catch (e) {
                    console.warn("[SW] failed", url, e);
                }
            }
        })()
    );

    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );

    self.clients.claim();
});

self.addEventListener("fetch", (event) => {

    if (event.request.method !== "GET")
        return;

    event.respondWith(
        caches.match(event.request)
            .then((cached) => {

                if (cached)
                    return cached;

                return fetch(event.request)
                    .then((response) => {

                        if (
                            response &&
                            response.ok &&
                            event.request.url.startsWith(self.location.origin)
                        ) {

                            const responseClone = response.clone();

                            caches.open(CACHE_NAME)
                                .then((cache) => cache.put(event.request, responseClone));
                        }

                        return response;
                    });
            })
    );
});