const CACHE = 'folio-v13'; // v13: แยก index.html เป็น css/app.css + js/*.js (เฟส 8) · v12: แคช Firebase SDK/Chart.js ให้เปิดแอปออฟไลน์ได้ (เดิมไฟล์ firebase-firestore.js ถูกตัวกรอง 'firestore' ส่งไปเครือข่ายทุกครั้ง) · v11: เพิ่ม js/bill-core.js เข้า SHELL (v10: ล้าง cache อัตราแลกเปลี่ยนที่เคยถูกเก็บค้างไว้)
const CDN_CACHE = 'folio-cdn'; // SDK/ไลบรารีที่ระบุเวอร์ชันใน URL (ไม่เปลี่ยนเนื้อหา) — เก็บข้ามการเปลี่ยน CACHE
const SHARE_CACHE = 'folio-share'; // ไฟล์ที่แชร์เข้ามา (Share Target) — หน้าเว็บอ่านแล้วลบทิ้งเอง
// ไฟล์ของแอป (network-first แล้ว fallback cache ตอนออฟไลน์) — ไฟล์ไหนไม่อยู่ในรายการนี้จะเป็น cache-first และค้างเวอร์ชันเก่า
// เพิ่ม/เปลี่ยนชื่อไฟล์ css/js ต้องมาแก้ที่นี่และเปลี่ยนชื่อ CACHE (tests/structure.test.js ตรวจให้)
const SHELL = ['/Folio/', '/Folio/index.html', '/Folio/css/app.css', '/Folio/js/bill-core.js', '/Folio/js/portfolio.js', '/Folio/js/advisor.js',
  '/Folio/js/rewards.js', '/Folio/js/bill.js', '/Folio/js/signals.js', '/Folio/js/ai.js'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE && k !== SHARE_CACHE && k !== CDN_CACHE).map(k => caches.delete(k)))
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
  // ไลบรารีบน CDN ที่ล็อกเวอร์ชันใน URL → cache-first (ต้องมาก่อนตัวกรองด้านล่าง เพราะชื่อไฟล์ firebase-firestore.js มีคำว่า firestore)
  // Chart.js โหลดด้วย <script src> (no-cors) จึงได้ opaque response — เก็บได้แต่ใช้อ่านเนื้อหาไม่ได้ ใช้ได้เฉพาะให้เบราว์เซอร์รันสคริปต์
  if (url.startsWith('https://www.gstatic.com/firebasejs/') || url.startsWith('https://cdnjs.cloudflare.com/ajax/libs/')) {
    e.respondWith(
      caches.open(CDN_CACHE).then(c => c.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        if (res.ok || res.type === 'opaque') c.put(e.request, res.clone());
        return res;
      })))
    );
    return;
  }
  // Always network for Firebase, Gemini, APIs
  if (url.includes('firestore') || url.includes('googleapis') ||
      url.includes('generativelanguage') || url.includes('workers.dev') ||
      url.includes('coingecko') || url.includes('alphavantage') ||
      url.includes('finnhub') || url.includes('marketaux') ||
      url.includes('script.google') || url.includes('fonts.googleapis') ||
      url.includes('frankfurter') || url.includes('exchangerate-api')) {
    return;
  }
  // App shell: network-first so a new deploy shows up immediately on refresh;
  // cache is only a fallback when offline. Avoids needing to bump CACHE on every release.
  const isShell = e.request.mode === 'navigate' || SHELL.some(s => url.endsWith(s));
  if (isShell) {
    // cache: 'no-cache' = ถามเซิร์ฟเวอร์ทุกครั้ง (ไม่เปลี่ยนก็ได้ 304 เร็ว) — GitHub Pages ตั้ง max-age=600
    // ถ้าไม่ใส่ เบราว์เซอร์จะเอา HTML เก่าใน HTTP cache มาใช้ได้นานถึง 10 นาทีหลัง deploy
    // navigate request สร้าง Request ใหม่ด้วย init ไม่ได้ จึงส่ง URL แทน
    const fresh = e.request.mode === 'navigate'
      ? fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
      : fetch(e.request, { cache: 'no-cache' });
    e.respondWith(
      fresh.then(res => {
        // เก็บเฉพาะหน้าที่โหลดสำเร็จ — ไม่เอาหน้า error มาทับ shell ที่ใช้ได้
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      // offline: URL ที่มี query (เช่น ?share-target=1) ใช้ shell เดียวกัน
      }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('/Folio/')))
    );
    return;
  }
  // Cache-first for other static assets (icons, manifest, Chart.js/Firebase SDK ที่ระบุเวอร์ชันใน URL)
  // เดิมไม่เคย put ลง cache เลย ไฟล์พวกนี้จึงไม่มีให้ใช้ตอน offline
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      // res.ok = same-origin หรือ CORS ปกติ (ไม่เก็บ opaque/error response)
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }))
  );
});
