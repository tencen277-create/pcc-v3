const VERSION = 'pcc-v3-1.0.0';
const CACHE = VERSION + '-cache';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap',
];

// ─── INSTALL: cache all core assets ───
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE: remove old caches ───
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH: cache-first for assets, network-first for API ───
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always go network for Anthropic API
  if (url.hostname === 'api.anthropic.com') {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({
          content: [{ type: 'text', text: 'My connection to the outside world is currently severed. I can still assist with what I have on hand.' }]
        }), { headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }

  // Cache-first for everything else
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const toCache = response.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, toCache));
        return response;
      }).catch(() => {
        // Offline fallback for navigation requests
        if (e.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});

// ─── PUSH NOTIFICATIONS ───
self.addEventListener('push', e => {
  const data = e.data?.json() || {};
  const title = data.title || 'PCC v3 — Francois';
  const body = data.body || 'You have a new update from Francois.';
  const icon = data.icon || './icons/icon-192.png';
  const badge = data.badge || './icons/icon-192.png';
  const tag = data.tag || 'pcc-default';
  const url = data.url || './index.html';

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      data: { url },
      vibrate: [100, 50, 100],
      actions: [
        { action: 'open', title: 'Open PCC v3' },
        { action: 'dismiss', title: 'Dismiss' }
      ]
    })
  );
});

// ─── NOTIFICATION CLICK ───
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  const url = e.notification.data?.url || './index.html';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes('pcc') || c.url.includes('index'));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});

// ─── BACKGROUND SYNC (for deferred actions when offline) ───
self.addEventListener('sync', e => {
  if (e.tag === 'sync-notes') {
    e.waitUntil(syncPendingNotes());
  }
  if (e.tag === 'sync-transactions') {
    e.waitUntil(syncPendingTransactions());
  }
});

async function syncPendingNotes() {
  // Pending notes saved while offline will be re-attempted here
  const cache = await caches.open(CACHE);
  const pending = await cache.match('pending-notes');
  if (pending) {
    // Process and clear
    await cache.delete('pending-notes');
  }
}

async function syncPendingTransactions() {
  const cache = await caches.open(CACHE);
  const pending = await cache.match('pending-transactions');
  if (pending) {
    await cache.delete('pending-transactions');
  }
}
