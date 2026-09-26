const CACHE_NAME = 'campusread-v2';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/pwa-192.png',
  '/pwa-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );

  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );

  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Never cache protected CampusRead APIs, Firestore, Firebase Storage,
  // or protected academic documents.
  if (
  event.request.url.includes('/api/') ||
  event.request.url.includes('/materials/') ||
  event.request.url.includes('firebasestorage') ||
  event.request.url.includes('firestore') ||
  event.request.url.toLowerCase().includes('.pdf')
) {
  return;
}

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
