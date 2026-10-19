// keeps every file the app needs on the device, so snappdf opens and works with no connection.
// not bundled: the build copies this to /sw.js and fills in FILES and VERSION (see offline() in vite.config.ts)

const FILES = __FILES__;
const CACHE = 'snappdf-__VERSION__';

// save everything on the first visit, so going offline later just works
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

// a new version clears out the files of the old one
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('snappdf-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// pages: ask the network first so new deploys show up, use the saved app when offline or after 3s of waiting
function openPage(request) {
  const network = fetch(request);
  const saved = () => caches.match('/index.html');
  const slow = new Promise((resolve) => setTimeout(resolve, 3000)).then(saved);
  return Promise.race([network, slow])
    .then((response) => response || network)
    .catch(() => saved().then((response) => response || Response.error()));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(openPage(request));
    return;
  }

  // the cache only holds files from this exact build, so the saved copy is always the right one
  event.respondWith(caches.match(request).then((response) => response || fetch(request)));
});
