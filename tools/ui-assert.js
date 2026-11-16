// ทดสอบพฤติกรรม UI แบบออฟไลน์ (จอ 390x844, ไม่แตะ Firebase/network) — รัน: node tools/ui-assert.js  → exit 1 ถ้ามีข้อใดไม่ผ่าน
// เพิ่มเทสต์ของแต่ละเฟสต่อท้ายไฟล์นี้ (กลุ่ม "เฟส N") เพื่อกันของเก่าพังเมื่อทำเฟสถัดไป
const assert = require('node:assert/strict');
const lib = require('./ui-lib.js');
let failed = 0, passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const rect = (p, sel, i = 0) => p.evaluate(([s, i]) => { const e = document.querySelectorAll(s)[i]; if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right }; }, [sel, i]);
const vis = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; }, sel);
const overlap = (a, b) => a && b && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;

// ───────── เฟส 1 ─────────
test('เฟส1: หัวหน้าบิลเป็นแถวเดียว ไม่มี eyebrow', async p => {
  await p.evaluate(() => { showPage('bills'); billSetTab('list'); });
  assert.equal(await p.evaluate(() => document.querySelector('#page-bills .page-greeting')), null);
  const t = await rect(p, '#page-bills .bill-head .page-title'), n = await rect(p, '#page-bills .bill-head .bill-month-nav');
  assert.ok(Math.abs((t.y + t.h / 2) - (n.y + n.h / 2)) < 8, 'ชื่อหน้ากับแถบเดือนต้องอยู่แถวเดียวกัน');
  assert.ok(n.r <= 390 && n.x >= 0, 'แถบเดือนต้องไม่ล้นจอ');
  const g = await rect(p, '#page-bills .bill-head .bill-icon-btn');
  assert.ok(g.r <= 390, 'ปุ่มตั้งค่าต้องไม่ล้นจอ');
});
test('เฟส1: ตัวเลือกเดือนชุดเดียวในโหมดเดือน, โหมดวัน/สัปดาห์ยังเลื่อนได้', async p => {
  await p.evaluate(() => { billSetTab('list'); billSetListMode('month'); });
  assert.equal(await vis(p, '#billRangeNav'), false);
  assert.equal(await vis(p, '#page-bills .bill-head .bill-month-nav'), true);
  await p.evaluate(() => billSetListMode('week')); assert.equal(await vis(p, '#billRangeNav'), true);
  await p.evaluate(() => billSetListMode('day')); assert.equal(await vis(p, '#billRangeNav'), true);
  await p.evaluate(() => billSetListMode('month'));
});
test('เฟส1: แถวรายการไม่มีปุ่ม ✕ และบรรทัดย่อยเรียง หมวด · ช่องทาง ก่อนเวลา ไม่มี "กรอกเอง"', async p => {
  const rows = await p.evaluate(() => [...document.querySelectorAll('#billList .bill-row')].map(r => ({ del: !!r.querySelector('.bill-del'), sub: r.querySelector('.bill-sub').textContent })));
  assert.ok(rows.length >= 8);
  rows.forEach(r => { assert.equal(r.del, false); assert.ok(!r.sub.includes('กรอกเอง')); });
  const food = rows.find(r => r.sub.includes('อาหาร') && r.sub.includes('UOB'));
  assert.ok(food && food.sub.indexOf('UOB') < food.sub.indexOf(':'), 'ช่องทาง/บัตรต้องมาก่อนเวลา: ' + (food && food.sub));
});
test('เฟส1: ปุ่มลอย ＋ ไม่ทับยอดเงิน/ปุ่มใด ๆ เมื่อเลื่อนสุดหน้า และซ่อนเมื่อมี modal', async p => {
  for (const tab of ['overview', 'list', 'cards', 'recur']) {
    await p.evaluate(t => { billSetTab(t); window.scrollTo(0, 1e6); }, tab); await p.waitForTimeout(150);
    const fab = await rect(p, '.bill-fab');
    const hits = await p.evaluate(f => [...document.querySelectorAll('#page-bills .bill-tab.on .bill-amt, #page-bills .bill-tab.on button, #page-bills .bill-tab.on a')].filter(e => { const r = e.getBoundingClientRect(); return r.height > 0 && f.x < r.right && r.x < f.r && f.y < r.bottom && r.y < f.b; }).map(e => e.textContent.trim().slice(0, 30)), fab);
    assert.deepEqual(hits, [], 'แท็บ ' + tab + ' ปุ่มลอยทับ: ' + hits.join('|'));
  }
  await p.evaluate(() => { window.scrollTo(0, 0); openModal('billAddModal'); });
  assert.equal(await vis(p, '.bill-fab'), false);
  await p.evaluate(() => closeModal('billAddModal'));
  assert.equal(await vis(p, '.bill-fab'), true);
});
test('เฟส1: ฟอร์มกรอกเอง = "เพิ่มรายการ" ไม่มี checkbox · ฟอร์มสลิปหลายใบยังมี checkbox', async p => {
  await p.evaluate(() => billOpenManual());
  assert.equal(await p.textContent('#billConfirmTitle'), 'เพิ่มรายการ');
  assert.equal(await p.locator('#billDrafts input[type=checkbox]').count(), 0);
  assert.equal(await p.locator('#billDrafts button', { hasText: 'ลบรายการนี้' }).count(), 0);
  await p.evaluate(() => billCloseConfirm());
  await p.evaluate(() => billOpenConfirm([billNewDraft({ amount: 10, source: 'upload' }), billNewDraft({ amount: 20, source: 'upload' })], ''));
  assert.match(await p.textContent('#billConfirmTitle'), /ตรวจสอบ 2 รายการ/);
  assert.equal(await p.locator('#billDrafts input[type=checkbox]').count(), 2);
  await p.evaluate(() => billCloseConfirm());
});
test('เฟส1: ลบจากฟอร์มแก้ไข — ยกเลิกแล้วอยู่ครบ, ยืนยันแล้วลบและปิดฟอร์ม', async p => {
  const count = () => p.evaluate(() => state.transactions.length);
  const n0 = await count();
  await p.evaluate(() => billEdit('x2'));
  assert.equal(await p.textContent('#billConfirmTitle'), 'แก้ไขรายการ');
  const btn = p.locator('#billDrafts button', { hasText: 'ลบรายการนี้' });
  assert.equal(await btn.count(), 1);
  assert.ok((await btn.boundingBox()).height >= 44, 'ปุ่มลบสูงอย่างน้อย 44px');
  p.once('dialog', d => d.dismiss()); await btn.click(); await p.waitForTimeout(150);
  assert.equal(await count(), n0); assert.equal(await p.evaluate(() => document.getElementById('bill-confirm-modal').classList.contains('open')), true);
  p.once('dialog', d => d.accept()); await btn.click(); await p.waitForTimeout(250);
  assert.equal(await count(), n0 - 1);
  assert.equal(await p.evaluate(() => state.transactions.some(t => t.id === 'x2')), false);
  assert.equal(await p.evaluate(() => document.getElementById('bill-confirm-modal').classList.contains('open')), false);
});
test('เฟส1: ลบงวดผ่อนจากฟอร์ม — ถามลบทั้งชุด', async p => {
  await p.evaluate(() => { state.transactions.push(...[1, 2, 3].map(n => ({ id: 'inst_' + n, date: todayISO().slice(0, 7) + '-0' + (3 + n), type: 'expense', category: 'shopping', amount: 500, currency: 'THB', fxToThb: 1, amountThb: 500, merchant: 'ผ่อนทีวี', payMethod: 'cash', installmentId: 'I1', installmentNo: n, installmentOf: 3 }))); billRender(); billEdit('inst_2'); });
  const dialogs = []; p.on('dialog', d => { dialogs.push(d.message().slice(0, 12)); d.accept(); });
  await p.locator('#billDrafts button', { hasText: 'ลบรายการนี้' }).click(); await p.waitForTimeout(300);
  p.removeAllListeners('dialog');
  assert.equal(dialogs.length, 2);
  assert.equal(await p.evaluate(() => state.transactions.filter(t => t.installmentId === 'I1').length), 0);
});
test('เฟส1: ตัวเลขหน้างบประมาณใช้ฟอนต์ sans เหมือนหน้าบิล', async p => {
  await p.evaluate(() => showPage('budget')); await p.waitForTimeout(200);
  const f = await p.evaluate(() => { const e = document.querySelector('#budgetMetrics .metric-value'); return e && getComputedStyle(e).fontFamily; });
  assert.ok(f && !/serif/i.test(f.replace(/sans-serif/gi, '')) && !/Serif Display/i.test(f), 'ฟอนต์ที่ได้: ' + f);
  await p.evaluate(() => showPage('bills'));
});
test('เฟส1: แถวรายการแถวแรกสูงกว่าเดิม (วัดจริงก่อนแก้ y=755 → หลังแก้ y=640; ต้อง < 700)', async p => {
  await p.evaluate(() => { showPage('bills'); billSetTab('list'); window.scrollTo(0, 0); });
  const r = await rect(p, '#billList .bill-row');
  console.log('   แถวแรกอยู่ที่ y =', Math.round(r.y));
  assert.ok(r.y < 700);
});

(async () => {
  const { b, p, errors } = await lib.open();
  for (const [name, fn] of tests) {
    try { await fn(p); passed++; console.log('PASS', name); }
    catch (e) { failed++; console.log('FAIL', name, '\n   ', String(e.message).split('\n').slice(0, 4).join('\n    ')); }
  }
  await b.close();
  if (errors.length) { failed++; console.log('FAIL: มี JS error ' + errors.length + ' รายการ'); }
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`);
  process.exit(failed ? 1 : 0);
})();
