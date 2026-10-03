const CACHE = 'folio-v5';
const SHARE_CACHE = 'folio-share'; // ไฟล์ที่แชร์เข้ามา (Share Target) — หน้าเว็บอ่านแล้วลบทิ้งเอง
const SHELL = ['/Folio/', '/Folio/index.html'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE && k !== SHARE_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Share Target (Android): manifest ส่ง POST multipart มาที่ /Folio/share-target
// GitHub Pages รับ POST ไม่ได้ จึงต้องดักที่ service worker → เก็บไฟล์ลง cache → redirect ไปหน้าแอป
async function handleShare(request) {
  try {
    const form = await request.formData();
    const cache = await caches.open(SHARE_CACHE);
    for (const k of await cache.keys()) await cache.delete(k);
    const files = form.getAll('files').filter(f => f && typeof f === 'object' && f.size);
    for (let i = 0; i < files.length; i++) {
      await cache.put('/Folio/__share/file-' + i, new Response(files[i], { headers: { 'Content-Type': files[i].type || 'image/jpeg' } }));
    }
    const text = ['title', 'text', 'url'].map(k => form.get(k)).filter(v => typeof v === 'string' && v.trim()).join('\n');
    if (text) await cache.put('/Folio/__share/text', new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
    return Response.redirect('/Folio/?share-target=1', 303);
  } catch (err) {
    return Response.redirect('/Folio/?share-target=error', 303);
  }
}

self.addEventListener('fetch', e => {
  if (e.request.method === 'POST' && new URL(e.request.url).pathname === '/Folio/share-target') {
    e.respondWith(handleShare(e.request));
    return;
  }
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
  // App shell: network-first so a new deploy shows up immediately on refresh;
  // cache is only a fallback when offline. Avoids needing to bump CACHE on every release.
  const isShell = e.request.mode === 'navigate' || SHELL.some(s => url.endsWith(s));
  if (isShell) {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // Cache-first for other static assets (icons, manifest, etc. - rarely change)
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
