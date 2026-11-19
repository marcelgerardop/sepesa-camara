const CACHE = 'sepesa-camara-v1';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/brand/sepesa-logo-white.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(async (url) => {
      try {
        await cache.add(url);
      } catch {
        /* The app still works online if one shell file misses the cache. */
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const fresh = await fetch(request);
      if (fresh.ok && !request.headers.get('range')) {
        const cache = await caches.open(CACHE);
        await cache.put(request, fresh.clone());
      }
      return fresh;
    } catch {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const shell = await caches.match('/');
        if (shell) return shell;
      }
      return new Response('Sin conexión', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});
