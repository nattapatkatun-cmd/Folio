// โครงสร้างไฟล์หลังแยก index.html (เฟส 8): ลำดับการโหลด, ไฟล์อยู่ใน SW SHELL, ไม่มีชื่อซ้ำข้ามไฟล์, ไฟล์ที่โหลดก่อน bill.js ไม่มีโค้ดระดับบนสุดที่พึ่งของไฟล์หลัง
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html'), sw = read('sw.js');
const scripts = [...html.matchAll(/^<script\b([^>]*)>/gm)].map(m => m[1]);
const localSrc = scripts.map(a => (a.match(/\bsrc="([^"]+)"/) || [])[1]).filter(s => s && !/^https?:/.test(s));
const css = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]).filter(s => !/^https?:/.test(s));

test('index.html: ไม่มี <script>/<style> แบบฝังเหลือ นอกจาก module ของ Firebase', () => {
  const inline = scripts.filter(a => !/\bsrc=/.test(a));
  assert.deepEqual(inline.map(a => a.trim()), ['type="module"']);
  assert.ok(!/<style\b/.test(html), 'CSS ต้องอยู่ใน css/app.css');
});
test('ลำดับโหลด: bill-core → portfolio → (Chart.js) → advisor → rewards → bill → signals → ai', () => {
  assert.deepEqual(localSrc, ['js/bill-core.js', 'js/portfolio.js', 'js/advisor.js', 'js/rewards.js', 'js/bill.js', 'js/signals.js', 'js/ai.js']);
  const idx = s => html.indexOf(s);
  assert.ok(idx('js/portfolio.js') < idx('Chart.js/4.4.1') && idx('Chart.js/4.4.1') < idx('js/advisor.js'), 'Chart.js ต้องอยู่ระหว่าง portfolio และ advisor เหมือนเดิม');
});
test('ทุกไฟล์ css/js ที่ index.html โหลดมีอยู่จริง อ่านไวยากรณ์ผ่าน และอยู่ใน SHELL ของ sw.js (ไม่งั้นค้างเวอร์ชันเก่า/ออฟไลน์ไม่ได้)', () => {
  for (const f of localSrc.concat(css)) {
    assert.ok(fs.existsSync(path.join(root, f)), f + ' ไม่มีไฟล์');
    assert.ok(sw.includes("'/Folio/" + f + "'"), f + ' ไม่อยู่ใน SHELL ของ sw.js');
    if (f.endsWith('.js')) assert.doesNotThrow(() => new vm.Script(read(f), { filename: f }), f);
  }
});
test('ไม่มีชื่อฟังก์ชัน/const/let ระดับบนสุดซ้ำข้ามไฟล์ (ซ้ำ = ไฟล์หลังทับไฟล์แรกเงียบ ๆ หรือ const ชนกันตอนโหลด)', () => {
  const seen = {};
  for (const f of localSrc) for (const m of read(f).matchAll(/^(?:async )?function (\w+)|^(?:const|let|var) (\w+)/gm)) {
    const n = m[1] || m[2]; (seen[n] = seen[n] || new Set()).add(f);
  }
  const dup = Object.entries(seen).filter(([, v]) => v.size > 1).map(([n, v]) => n + ' ← ' + [...v].join(', '));
  assert.deepEqual(dup, []);
});
test('rewards.js โหลดก่อน bill.js: ต้องไม่มีคำสั่งระดับบนสุดที่เรียกฟังก์ชัน/ค่าของ bill ตอนโหลด (มีแต่การประกาศ)', () => {
  const bad = read('js/rewards.js').split('\n').filter(l => /^[^\s\/}\])]/.test(l) && !/^(function|async function|const|let|var) /.test(l));
  assert.deepEqual(bad, [], 'โค้ดระดับบนสุดใน rewards.js: ' + bad.join(' | '));
});
