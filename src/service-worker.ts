/// <reference lib="webworker" />
// SW build 2026-04-07 — push + notificationclick included
declare const __BUILD_TS__: string;
declare const __PRECACHE_URLS__: string[];

const CACHE_NAME = `junto-${__BUILD_TS__}`;

/**
 * URLs to precache during install.
 * In production builds, __PRECACHE_URLS__ is injected by the Vite plugin and
 * includes index.html + all hashed JS/CSS chunks. During development it falls
 * back to a minimal shell so the SW still installs.
 */
const SHELL_URLS: string[] =
  typeof __PRECACHE_URLS__ !== 'undefined'
    ? __PRECACHE_URLS__
    : ['/', '/index.html', '/manifest.json'];

const SUPABASE_STORAGE_HOST = 'dwtbqomfleihcvkfoopm.supabase.co';
const STORAGE_PATH_PREFIX = '/storage/v1/object/sign/trip-attachments/';

declare var self: ServiceWorkerGlobalScope;

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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Use individual puts so a single 404 doesn't blow up the whole install.
      Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] Failed to precache ${url}:`, err);
          })
        )
      )
    )
  );
  // Don't skipWaiting here — let the client trigger it via message
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ---------- Fetch ---------- */

function extractFilePath(url: URL): string | null {
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

/** Cache-first for hashed assets (immutable), with runtime caching on miss. */
async function handleAsset(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  // Cache successful responses for immutable hashed assets
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests (except Supabase storage)
  if (url.origin !== self.location.origin && url.host !== SUPABASE_STORAGE_HOST) {
    return;
  }

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

  // Navigation: network-first, fall back to cached index.html for offline shell
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/index.html').then((r) => r || new Response('Offline', { status: 503 }))
      )
    );
    return;
  }

  // Hashed assets (/assets/*) — cache-first with runtime caching
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(handleAsset(event.request));
    return;
  }

  // All other same-origin requests: cache-first, fallback to network
  event.respondWith(
    caches.match(event.request).then((r) => r || fetch(event.request))
  );
});

/* ---------- Push Notifications ---------- */

self.addEventListener('push', (event) => {
  // DEBUG: temporary logging to diagnose push notification issues
  try {
    if (!event.data) {
      event.waitUntil(
        self.registration.showNotification('Junto', {
          body: 'Debug: push event fired but event.data is null',
        })
      );
      return;
    }

    const data = event.data.json();
    const title = data.title || 'Junto';
    const body = data.body || 'You have a new notification';
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: data.icon,
        data: { url: data.url },
      })
    );
  } catch (error) {
    event.waitUntil(
      self.registration.showNotification('Junto', {
        body: 'Debug: push event fired but data parsing failed: ' + (error instanceof Error ? error.message : String(error)),
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(self.clients.openWindow(url));
});
