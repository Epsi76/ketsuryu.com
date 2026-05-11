/* KetsuRyu — service worker
   Présence d'un handler `fetch` => le site devient installable comme application
   (Chrome/Edge/Android). Bonus : il reste utilisable hors-ligne. */

const VERSION = 'v1';
const CORE_CACHE  = `ketsuryu-core-${VERSION}`;
const MEDIA_CACHE = `ketsuryu-media-${VERSION}`;
const CDN_CACHE   = `ketsuryu-cdn-${VERSION}`;

// Coquille de l'app : mise en cache à l'installation.
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/index2.html',
  '/site.webmanifest',
  '/favicon.svg',
  '/favicon-32.png',
  '/favicon.ico',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const keep = new Set([CORE_CACHE, MEDIA_CACHE, CDN_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first : on sert depuis le cache, sinon réseau puis on stocke.
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const resp = await fetch(request);
  if (resp && (resp.ok || resp.type === 'opaque')) cache.put(request, resp.clone());
  return resp;
}

// Stale-while-revalidate : on sert le cache tout de suite, on rafraîchit en fond.
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((resp) => { if (resp && resp.ok) cache.put(request, resp.clone()); return resp; })
    .catch(() => hit);
  return hit || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Modules ES servis par unpkg (three.js) : cache-first, bucket dédié.
  if (url.hostname === 'unpkg.com') {
    event.respondWith(cacheFirst(request, CDN_CACHE));
    return;
  }

  // On ne touche pas aux autres requêtes cross-origin.
  if (url.origin !== self.location.origin) return;

  // Vidéo / audio : cache-first dans un bucket à part (fichiers lourds).
  if (/\.(mp4|webm|ogg|mp3|wav|m4a|aac)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(request, MEDIA_CACHE));
    return;
  }

  // Navigations : réseau d'abord (HTML toujours frais), repli sur le cache hors-ligne.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () =>
        (await caches.match(request)) || (await caches.match('/index.html'))
      )
    );
    return;
  }

  // Le reste (icônes, manifest, images…) : stale-while-revalidate.
  event.respondWith(staleWhileRevalidate(request, CORE_CACHE));
});
