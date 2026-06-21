const CACHE = 'folio-v2';
const SHELL = ['/Folio/', '/Folio/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = e.request.url;
  // Always network for Firebase, Gemini, APIs
  if (url.includes('firestore') || url.includes('googleapis') ||
      url.includes('generativelanguage') || url.includes('workers.dev') ||
      url.includes('coingecko') || url.includes('alphavantage') ||
      url.includes('finnhub') || url.includes('marketaux') ||
      url.includes('script.google') || url.includes('fonts.googleapis')) {
    return;
  }
  // Cache-first for app shell
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
