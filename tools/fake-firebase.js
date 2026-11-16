// Firebase SDK จำลอง (ในหน่วยความจำ) สำหรับทดสอบโค้ดฝั่ง window.FB ของจริงใน index.html โดยไม่แตะ Firestore จริง
// เลียนแบบสิ่งที่สำคัญต่อการทดสอบออฟไลน์:
//   • เขียนแล้ว listener เห็นทันที (latency compensation) • promise ของคำสั่งเขียน resolve เมื่อ "เซิร์ฟเวอร์รับ" เท่านั้น — ตอน __fs.offline = true จะค้างไม่รู้จบ
//   • getDoc ตอนออฟไลน์ถ้าไม่มีใน cache = reject code 'unavailable' • __fs.failNext = 'permission-denied' ทำให้การเขียนครั้งถัดไป (ออนไลน์) ถูกปฏิเสธ
// เปิดดู/ตั้งค่าได้ที่ window.__fs ในหน้า: { docs, offline, log, initOpts, failNext }
const APP = "export const initializeApp = c => ({ c });";
const FS = `
const S = window.__fs;
const colOf = p => p.slice(0, p.lastIndexOf('/'));
const snapOf = path => { const d = S.docs[path]; return { id: path.slice(path.lastIndexOf('/') + 1), exists: () => !!d, data: () => d && JSON.parse(JSON.stringify(d)) }; };
const colSnap = col => { const docs = Object.keys(S.docs).filter(p => colOf(p) === col).map(snapOf); return { docs }; };
const notify = col => (S.listeners[col] || []).forEach(cb => cb(colSnap(col)));
const stamp = o => JSON.parse(JSON.stringify(o, (k, v) => (v && v.__ts ? { seconds: Math.floor(Date.now() / 1000) } : v)));
const ack = (op, path) => {
  S.log.push({ op, path, offline: !!S.offline });
  if (S.offline) return new Promise(() => {});                                   // ไม่เคย resolve
  if (S.failNext) { const code = S.failNext; S.failNext = null; return Promise.reject(Object.assign(new Error('rejected'), { code })); }
  return Promise.resolve();
};
S.listeners = S.listeners || {}; S.log = S.log || []; S.docs = S.docs || {};
export const initializeFirestore = (app, opts) => { S.initOpts = opts; return { app }; };
export const getFirestore = app => { S.initOpts = S.initOpts || 'default'; return { app }; };
export const persistentLocalCache = o => ({ kind: 'persistent', opts: o });
export const persistentMultipleTabManager = () => ({ kind: 'multiTab' });
export const collection = (db, path) => ({ type: 'col', path });
export const doc = (a, ...segs) => a.type === 'col' ? { type: 'doc', path: a.path + '/auto' + Math.random().toString(36).slice(2, 10) } : { type: 'doc', path: segs.join('/') };
export const serverTimestamp = () => ({ __ts: true });
export const query = (c) => c; export const orderBy = () => null; export const limit = () => null;
export const setDoc = (ref, data, opts) => { S.docs[ref.path] = opts && opts.merge ? { ...(S.docs[ref.path] || {}), ...stamp(data) } : stamp(data); notify(colOf(ref.path)); return ack('set', ref.path); };
export const addDoc = (c, data) => { const ref = doc(c); setDoc(ref, data); return Promise.resolve(ref); };
export const updateDoc = (ref, data) => { if (!S.docs[ref.path]) return Promise.reject(Object.assign(new Error('not-found'), { code: 'not-found' })); S.docs[ref.path] = { ...S.docs[ref.path], ...stamp(data) }; notify(colOf(ref.path)); return ack('update', ref.path); };
export const deleteDoc = ref => { delete S.docs[ref.path]; notify(colOf(ref.path)); return ack('delete', ref.path); };
export const getDoc = ref => S.offline && !S.docs[ref.path] ? Promise.reject(Object.assign(new Error('offline'), { code: 'unavailable' })) : Promise.resolve(snapOf(ref.path));
export const getDocFromCache = ref => S.docs[ref.path] ? Promise.resolve(snapOf(ref.path)) : Promise.reject(new Error('not in cache'));
export const getDocs = c => Promise.resolve(colSnap(c.path));
export const onSnapshot = (c, cb) => { (S.listeners[c.path] = S.listeners[c.path] || []).push(cb); setTimeout(() => cb(colSnap(c.path)), 0); return () => {}; };
`;
exports.install = async function (ctx, initialDocs) {
  await ctx.addInitScript(d => { window.__fs = { docs: d || {}, offline: false, log: [], listeners: {}, failNext: null }; }, initialDocs || {});
  await ctx.route('https://www.gstatic.com/firebasejs/**', r => {
    const u = r.request().url();
    const body = u.includes('firebase-app') ? APP : u.includes('firebase-firestore') ? FS : '';
    r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body });
  });
};
