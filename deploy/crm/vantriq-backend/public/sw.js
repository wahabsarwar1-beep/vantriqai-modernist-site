/**
 * The VantriqAI app's service worker (v9.15) — what makes the customer portal
 * installable as an app, and the Play Store app work offline-aware.
 *
 * Deliberately small. It never caches the account's data, and never caches
 * the app's own pages or code, so an update can never be stuck behind a
 * stale copy and nothing private is left on a shared phone. All it keeps is
 * one page — "You're offline" — and it shows that when a page cannot be
 * reached. Everything else goes straight to the network, as without it.
 */
const CACHE = 'vq-app-v1';
const OFFLINE = '/app/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll([OFFLINE, '/app/icon-192.png']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only page loads; API calls, scripts and images pass straight through.
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)));
});
