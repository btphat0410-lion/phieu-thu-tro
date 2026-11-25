const CACHE_NAME = 'tro-fullstack-shell-v8';
const SHELL_URLS = [
  '/',
  '/app',
  '/manifest.webmanifest',
  '/pwa.js',
  '/auth.js',
  '/icons/app-192.png?v=2',
  '/icons/app-512.png?v=2',
  '/icons/apple-touch-icon.png?v=2',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('tro-fullstack-shell-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' ||
      url.origin !== self.location.origin ||
      url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(request, copy)));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return (await caches.match('/app')) || (await caches.match('/'));
        })
    );
    return;
  }

  if (url.pathname === '/manifest.webmanifest' ||
      url.pathname === '/auth.js' ||
      url.pathname === '/pwa.js' ||
      url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request))
    );
  }
});
