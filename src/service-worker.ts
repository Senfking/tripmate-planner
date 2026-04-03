/// <reference lib="webworker" />
declare const __BUILD_TS__: string;

const CACHE_NAME = `junto-${__BUILD_TS__}`;
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
];

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  // Don't skipWaiting here — let the client trigger it via message
});

sw.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    sw.skipWaiting();
  }
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  sw.clients.claim();
});

sw.addEventListener('fetch', (event) => {
  // Never intercept OAuth redirect
  if (new URL(event.request.url).pathname.startsWith('/~oauth')) {
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/index.html').then((r) => r || fetch(event.request))
      )
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((r) => r || fetch(event.request))
  );
});
