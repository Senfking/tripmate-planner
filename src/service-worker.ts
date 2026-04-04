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

const SUPABASE_STORAGE_HOST = 'dwtbqomfleihcvkfoopm.supabase.co';
const STORAGE_PATH_PREFIX = '/storage/v1/object/sign/trip-attachments/';

const sw = self as unknown as ServiceWorkerGlobalScope;

/* ---------- IndexedDB helpers (mirrors src/lib/offlineDocuments.ts) ---------- */

const IDB_NAME = 'junto-offline-docs';
const IDB_STORE = 'documents';

function idbGet(filePath: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) { resolve(null); return; }
      const tx = db.transaction(IDB_STORE, 'readonly');
      const get = tx.objectStore(IDB_STORE).get(filePath);
      get.onsuccess = () => resolve(get.result ?? null);
      get.onerror = () => resolve(null);
    };
    req.onerror = () => resolve(null);
  });
}

/* ---------- Lifecycle ---------- */

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

/* ---------- Fetch ---------- */

function extractFilePath(url: URL): string | null {
  // Signed URL path: /storage/v1/object/sign/trip-attachments/<file_path>
  if (!url.pathname.startsWith(STORAGE_PATH_PREFIX)) return null;
  return decodeURIComponent(url.pathname.slice(STORAGE_PATH_PREFIX.length));
}

async function handleSupabaseStorage(request: Request, filePath: string): Promise<Response> {
  const cached = await idbGet(filePath);
  if (cached) {
    return new Response(cached, {
      headers: { 'Content-Type': cached.type || 'application/octet-stream' },
    });
  }
  return fetch(request);
}

sw.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept OAuth redirect
  if (url.pathname.startsWith('/~oauth')) {
    return;
  }

  // Intercept Supabase Storage signed-URL requests
  if (url.host === SUPABASE_STORAGE_HOST) {
    const filePath = extractFilePath(url);
    if (filePath) {
      event.respondWith(handleSupabaseStorage(event.request, filePath));
      return;
    }
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
