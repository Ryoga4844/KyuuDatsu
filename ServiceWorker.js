const CACHE_NAME = "datsugoku-webgl-PLACEHOLDER";
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
PRECACHE_URLS.push(...[]);
// BUILD_CACHE_URLS_END

const OFFLINE_CRITICAL_PATHS = ["/Build/", "/StreamingAssets/"];

self.addEventListener("install", (event) => {
  event.waitUntil(precacheAll(PRECACHE_URLS));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(handleNavigateRequest(event.request));
    return;
  }

  if (isOfflineCriticalPath(requestUrl.pathname)) {
    event.respondWith(handleCriticalAssetRequest(event.request));
    return;
  }

  event.respondWith(handleDefaultRequest(event.request));
});

function isOfflineCriticalPath(pathname) {
  for (let i = 0; i < OFFLINE_CRITICAL_PATHS.length; i++) {
    if (pathname.startsWith(OFFLINE_CRITICAL_PATHS[i])) {
      return true;
    }
  }

  return false;
}

function createCacheableRequest(request) {
  return new Request(request.url, {
    method: "GET",
    headers: request.headers,
    credentials: request.credentials,
    mode: request.mode,
    redirect: request.redirect,
    referrer: request.referrer,
    integrity: request.integrity
  });
}

async function sanitizeResponseForCache(response) {
  const headers = new Headers(response.headers);
  headers.delete("cache-control");
  headers.delete("pragma");
  headers.delete("expires");

  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function putInCache(request, response) {
  const cache = await caches.open(CACHE_NAME);
  const cacheableResponse = await sanitizeResponseForCache(response);
  await cache.put(request, cacheableResponse);
}

async function matchCached(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const url = new URL(request.url);
  return cache.match(url.pathname);
}

async function precacheAll(urls) {
  const uniqueUrls = [...new Set(urls)];
  const cache = await caches.open(CACHE_NAME);

  await Promise.all(
    uniqueUrls.map(async (url) => {
      try {
        const response = await fetch(url, { cache: "reload" });
        if (!response || !response.ok) {
          console.warn("[SW] precache skipped:", url, response && response.status);
          return;
        }

        const cacheableResponse = await sanitizeResponseForCache(response);
        await cache.put(url, cacheableResponse);
      } catch (error) {
        console.warn("[SW] precache failed:", url, error);
      }
    })
  );
}

async function handleNavigateRequest(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const cacheableResponse = await sanitizeResponseForCache(networkResponse);
      await cache.put("/index.html", cacheableResponse);
      await cache.put("/", cacheableResponse);
    }

    return networkResponse;
  } catch (error) {
    return (
      (await cache.match("/index.html")) ||
      (await cache.match("/")) ||
      (await cache.match(request)) ||
      Response.error()
    );
  }
}

async function handleCriticalAssetRequest(request) {
  const cached = await matchCached(request);
  const networkRequest = createCacheableRequest(request);

  try {
    const networkResponse = await fetch(networkRequest);
    if (!networkResponse || !networkResponse.ok) {
      return cached || networkResponse;
    }

    await putInCache(request, networkResponse);
    return networkResponse;
  } catch (error) {
    if (cached) {
      return cached;
    }

    throw error;
  }
}

async function handleDefaultRequest(request) {
  const cached = await matchCached(request);
  if (cached) {
    return cached;
  }

  const networkRequest = createCacheableRequest(request);

  try {
    const networkResponse = await fetch(networkRequest);
    if (!networkResponse || !networkResponse.ok) {
      return networkResponse;
    }

    await putInCache(request, networkResponse);
    return networkResponse;
  } catch (error) {
    return cached || Response.error();
  }
}
