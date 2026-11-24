// Central de Operaciones (Infinix) · Service Worker
// App shell: red primero (para que las actualizaciones lleguen) con respaldo en caché.
// Imágenes y librerías CDN: caché primero. Firestore nunca se intercepta.
const CACHE_NAME = 'infinix-opscore-v36';
const SHELL = [
  './', './index.html', './manifest.json', './opscore.css', './icon-192.png', './icon-512.png', './favicon-32.png', './apple-touch-icon.png',
  './opscore-assets.js', './opscore-config.js', './opscore-core.js', './opscore-m1.js', './opscore-m2.js',
  './opscore-m3.js', './opscore-m4.js', './opscore-m5.js', './opscore-seed.js', './opscore-snap.js', './opscore-zone.js', './opscore-calc.js', './opscore-central.js', './opscore-evals.js', './opscore-cargas.js', './opscore-plan-roles.js', './opscore-ventas.js', './opscore-real.js', './opscore-adm.js', './opscore-parcial.js', './opscore-hub.js', './opscore-legal.js', './opscore-admin.js', './opscore-demo.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(SHELL.map(url => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME && k.startsWith('infinix-opscore')).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.includes('googleapis.com') || url.hostname.includes('firebaseio.com')) return;   // Firestore en vivo

  const sameOrigin = url.origin === self.location.origin;
  const isAsset = /\.(png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname) || !sameOrigin;

  if (isAsset) {            // caché primero
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE_NAME).then(c => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }
  event.respondWith(         // red primero
    fetch(req).then(res => {
      if (res && res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});

// Al tocar la notificación del recordatorio se abre (o enfoca) la app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.includes(self.registration.scope));
    return open ? open.focus() : clients.openWindow((event.notification.data && event.notification.data.url) || './');
  }));
});
