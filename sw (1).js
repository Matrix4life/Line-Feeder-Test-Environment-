// Minimal PWA service worker — app shell + Web Push notifications
// NOTE: Does NOT cache Supabase/API data to avoid conflicts.

// ── HOW TO PUSH UPDATES WITHOUT HARD RESETS ──────────────────────────────────
// 1. Bump APP_VERSION below whenever you deploy new HTML
// 2. Upload both WarehouseLineFeeder.html + sw.js
// 3. Devices auto-update next time the user switches back to the tab

const APP_VERSION = 'v17';
const CACHE_NAME  = 'warehouse-pwa-' + APP_VERSION;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// ── INSTALL ───────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

// ── ACTIVATE ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── FETCH (app shell only — Supabase calls pass through) ──────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

// ── SKIP WAITING (triggered by HTML update banner) ────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── PUSH — fires even when app is closed/locked ───────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'Warehouse Update', body: 'Tap to open', icon: './icons/icon-192.png' };

  if (event.data) {
    try { data = { ...data, ...event.data.json() }; }
    catch(e) { data.body = event.data.text(); }
  }

  // Map notification type to emoji prefix
  const typeIcons = {
    high_priority: '🔥',
    completed:     '✅',
    cancelled:     '❌',
    chat:          '💬',
    break:         '🍵',
    new_request:   '📦',
  };
  const prefix = typeIcons[data.type] || '📦';
  const title  = data.title || `${prefix} Warehouse`;

  event.waitUntil(
    self.registration.showNotification(title, {
      body:    data.body   || '',
      icon:    data.icon   || './icons/icon-192.png',
      badge:   data.badge  || './icons/icon-72.png',
      tag:     data.tag    || data.type || 'wds',
      vibrate: (() => {
        switch(data.type) {
          case 'high_priority': return [150, 80, 150, 80, 150];
          case 'completed':     return [100];
          case 'chat':          return [80];
          case 'cancelled':     return [200, 100, 200];
          default:              return [100, 50, 100];
        }
      })(),
      data:    data.data   || { url: '/' },
      requireInteraction: data.type === 'high_priority', // stays on screen until tapped
    })
  );
});

// ── NOTIFICATION CLICK — opens/focuses the app ────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
