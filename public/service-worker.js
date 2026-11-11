const CACHE_VERSION = 'barber-agenda-shell-v1';
const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
];

const BYPASS_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'www.googleapis.com',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Never cache API endpoints, live availability, bookings, or Firebase PII/Auth requests
  if (
    url.pathname.startsWith('/api/') ||
    BYPASS_HOSTS.some((host) => url.hostname.includes(host))
  ) {
    return;
  }

  // Navigation requests: Network-first with offline app shell fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put('/index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || caches.match('/')))
    );
    return;
  }

  // Static assets (JS, CSS, images, fonts): Stale-While-Revalidate for same-origin and Google Fonts
  const isSameOrigin = url.origin === self.location.origin;
  const isGoogleFonts =
    url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

  if (isSameOrigin || isGoogleFonts) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const networkPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const copy = networkResponse.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || networkPromise;
      })
    );
  }
});
