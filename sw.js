const CACHE_NAME = 'debt-app-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './customer.html',
    './styles.css',
    './app.js',
    './customer.js',
    './pwa.js',
    './manifest.json'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then((response) => response || fetch(e.request))
    );
});
