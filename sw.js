// Offline support. App files: network first so edits show up immediately,
// cache as fallback. Bottle images and fonts: cache first. Weather is never
// cached here; the app keeps its own last forecast in localStorage.
const CACHE = 'scentcast-v3';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'data/collection.json',
  'src/styles.css',
  'src/main.js',
  'src/ui.js',
  'src/engine.js',
  'src/accords.js',
  'src/occasions.js',
  'src/weather.js',
  'src/wmo.js',
  'src/scene.js',
  'src/location.js',
  'src/history.js',
  'src/hidden.js',
  'src/collections.js',
  'src/api.js',
  'src/fragella.js',
  'icons/icon.svg',
];
const CACHE_FIRST_HOSTS = ['fimgs.net', 'cdn.fragella.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true })),
    );
  } else if (CACHE_FIRST_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.match(req).then(hit => hit ?? fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      })),
    );
  }
});
