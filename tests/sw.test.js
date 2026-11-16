// ทดสอบตรรกะ service worker (sw.js) ด้วย vm + mock — ไม่ต้องใช้เบราว์เซอร์/เครือข่าย
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const handlers = {}, stores = new Map(), fetchCalls = [];
  const mkCache = name => { if (!stores.has(name)) stores.set(name, new Map()); const m = stores.get(name); return {
    match: async (req, o) => { const k = typeof req === 'string' ? req : req.url; if (m.has(k)) return m.get(k); if (o && o.ignoreSearch) { const b = k.split('?')[0]; for (const [kk, v] of m) if (kk.split('?')[0] === b) return v; } return undefined; },
    put: async (req, res) => { m.set(typeof req === 'string' ? req : req.url, res); }, keys: async () => [...m.keys()].map(url => ({ url })), delete: async req => m.delete(typeof req === 'string' ? req : req.url), addAll: async urls => urls.forEach(u => m.set(u, mkRes({ url: u }))) }; };
  const mkRes = o => ({ ok: true, type: 'basic', status: 200, ...o, clone() { return { ...this }; } });
  const sandbox = {
    URL, console,
    caches: { open: async n => mkCache(n), keys: async () => [...stores.keys()], delete: async n => stores.delete(n),
      match: async (req, o) => { for (const n of stores.keys()) { const r = await mkCache(n).match(req, o); if (r) return r; } } },
    fetch: async (req, init) => { fetchCalls.push(typeof req === 'string' ? req : req.url); return sandbox.__next(typeof req === 'string' ? req : req.url); },
    Response: { redirect: (u, s) => ({ redirect: u, s }) },
    self: { addEventListener: (t, fn) => { handlers[t] = fn; }, skipWaiting() {}, clients: { claim: async () => {} } },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'), sandbox);
  const fetchEvt = (url, extra) => { const e = { request: { url, method: 'GET', mode: 'cors', ...extra }, responded: null, respondWith(p) { this.responded = p; } }; handlers.fetch(e); return e; };
  return { sandbox, handlers, stores, fetchCalls, mkRes, mkCache, fetchEvt };
}
const FS_URL = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

test('Firebase SDK (firebase-firestore.js) ถูกแคชแบบ cache-first — เปิดแอปออฟไลน์ได้ (เดิมถูกตัวกรอง "firestore" ส่งไปเครือข่ายทุกครั้ง)', async () => {
  const w = load();
  w.sandbox.__next = async url => w.mkRes({ url, body: 'sdk' });
  const e1 = w.fetchEvt(FS_URL);
  assert.ok(e1.responded, 'ต้อง respondWith ไม่ใช่ปล่อยผ่านเครือข่าย');
  assert.equal((await e1.responded).body, 'sdk');
  assert.equal(w.fetchCalls.length, 1);
  assert.ok(w.stores.get('folio-cdn').has(FS_URL));
  w.sandbox.__next = async () => { throw new Error('offline'); };       // ออฟไลน์
  const e2 = w.fetchEvt(FS_URL);
  assert.equal((await e2.responded).body, 'sdk');
  assert.equal(w.fetchCalls.length, 1, 'ครั้งที่สองต้องไม่ยิงเครือข่าย');
  // ไฟล์ย่อยของ SDK (import ภายใน) ก็ต้องถูกแคชด้วยกฎเดียวกัน
  const sub = 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
  w.sandbox.__next = async url => w.mkRes({ url, body: 'app' });
  assert.equal((await w.fetchEvt(sub).responded).body, 'app');
});
test('Firestore API จริง (firestore.googleapis.com) และ API อื่นยังไปเครือข่ายเสมอ — SW ไม่แตะ', () => {
  const w = load();
  for (const u of ['https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel', 'https://generativelanguage.googleapis.com/v1/models', 'https://api.frankfurter.app/latest']) assert.equal(w.fetchEvt(u).responded, null, u);
});
test('Chart.js จาก cdnjs แคชได้แม้เป็น opaque response (โหลดด้วย <script src> แบบ no-cors)', async () => {
  const w = load(); const u = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js';
  w.sandbox.__next = async url => w.mkRes({ url, ok: false, type: 'opaque', status: 0 });
  await (w.fetchEvt(u).responded);
  assert.ok(w.stores.get('folio-cdn').has(u));
  w.sandbox.__next = async () => { throw new Error('offline'); };
  assert.equal((await w.fetchEvt(u).responded).type, 'opaque');
});
test('activate: ลบแคชเก่า แต่เก็บแคช SDK (folio-cdn) และไฟล์ที่แชร์เข้ามา (folio-share)', async () => {
  const w = load();
  for (const n of ['folio-v11', 'folio-v12', 'folio-cdn', 'folio-share', 'other']) w.mkCache(n);
  const e = { waitUntil(p) { this.p = p; } }; w.handlers.activate(e); await e.p;
  assert.deepEqual([...w.stores.keys()].sort(), ['folio-cdn', 'folio-share', 'folio-v12']);
});
test('หน้าแอป (navigate) ออฟไลน์ → ใช้ shell ที่แคชไว้ รวมถึง URL ที่มี query (?share-target=1)', async () => {
  const w = load();
  const shell = w.mkRes({ url: '/Folio/', body: 'shell' }); await (await w.mkCache('folio-v12')).put('/Folio/', shell);
  w.sandbox.__next = async () => { throw new Error('offline'); };
  const e = w.fetchEvt('https://x.github.io/Folio/?share-target=1', { mode: 'navigate' });
  assert.equal((await e.responded).body, 'shell');
});
test('SW: SHELL มี js/bill-core.js และ CACHE ถูกเปลี่ยนชื่อเมื่อเปลี่ยนไฟล์ใน SHELL', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  assert.ok(s.includes("'/Folio/js/bill-core.js'"));
  assert.match(s, /const CACHE = 'folio-v1[2-9]|const CACHE = 'folio-v[2-9]\d/);
});
