const CACHE_NAME = 'nectora-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass-through network-first strategy for media and API requests
  if (event.request.url.includes('/api/')) {
    return;
  }
});
