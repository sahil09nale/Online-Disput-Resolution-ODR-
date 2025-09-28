// Service Worker for PWA functionality
const CACHE_NAME = 'resolveai-v1';
const urlsToCache = [
  '/',
  '/styles.css',
  '/js/main.js',
  '/index.html',
  '/login.html',
  '/register.html',
  '/dashboard.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});