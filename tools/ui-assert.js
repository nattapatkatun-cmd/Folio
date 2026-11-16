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
test('เฟส1+3: ลบจากฟอร์มแก้ไข — ลบทันที (ไม่มี confirm) ปิดฟอร์ม และมีแถบเลิกทำ', async p => {
  const count = () => p.evaluate(() => state.transactions.length);
  const n0 = await count();
  await p.evaluate(() => billEdit('x2'));
  assert.equal(await p.textContent('#billConfirmTitle'), 'แก้ไขรายการ');
  const btn = p.locator('#billDrafts button', { hasText: 'ลบรายการนี้' });
  assert.equal(await btn.count(), 1);
  assert.ok((await btn.boundingBox()).height >= 44, 'ปุ่มลบสูงอย่างน้อย 44px');
  let dialogs = 0; const on = () => { dialogs++; }; p.on('dialog', d => { on(); d.dismiss(); });
  await btn.click(); await p.waitForTimeout(250);
  p.removeAllListeners('dialog');
  assert.equal(dialogs, 0, 'ไม่ควรมี confirm');
  assert.equal(await count(), n0 - 1);
  assert.equal(await p.evaluate(() => state.transactions.some(t => t.id === 'x2')), false);
  assert.equal(await p.evaluate(() => document.getElementById('bill-confirm-modal').classList.contains('open')), false);
  assert.equal(await vis(p, '#billUndo'), true);
  await p.evaluate(() => billUndoRun());   // คืนข้อมูลให้เทสต์ถัดไป
});
test('เฟส1+3: ลบงวดผ่อนจากฟอร์ม — ยังถามลบทั้งชุด', async p => {
  await p.evaluate(() => { state.transactions.push(...[1, 2, 3].map(n => ({ id: 'inst_' + n, date: todayISO().slice(0, 7) + '-0' + (3 + n), type: 'expense', category: 'shopping', amount: 500, currency: 'THB', fxToThb: 1, amountThb: 500, merchant: 'ผ่อนทีวี', payMethod: 'cash', installmentId: 'I1', installmentNo: n, installmentOf: 3 }))); billRender(); billEdit('inst_2'); });
  const dialogs = []; p.on('dialog', d => { dialogs.push(d.message().slice(0, 12)); d.accept(); });
  await p.locator('#billDrafts button', { hasText: 'ลบรายการนี้' }).click(); await p.waitForTimeout(300);
  p.removeAllListeners('dialog');
  assert.equal(dialogs.length, 1);
  assert.equal(await p.evaluate(() => state.transactions.filter(t => t.installmentId === 'I1').length), 0);
  await p.evaluate(() => billUndoRun());
  assert.deepEqual(await p.evaluate(() => state.transactions.filter(t => t.installmentId === 'I1').map(t => t.id).sort()), ['inst_1', 'inst_2', 'inst_3']);
  await p.evaluate(() => { state.transactions = state.transactions.filter(t => t.installmentId !== 'I1'); billRender(); });
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

// ───────── เฟส 2 ─────────
const openManual = async p => { await p.evaluate(() => { showPage('bills'); billSetTab('list'); billOpenManual(); }); await p.waitForTimeout(150); };
const closeForm = p => p.evaluate(() => billCloseConfirm());
const lastTx = p => p.evaluate(() => state.transactions[state.transactions.length - 1]);
test('เฟส2: ฟอร์มกรอกเองสูงไม่เกินหนึ่งจอ ไม่ต้องเลื่อน และโฟกัสช่องยอด (แป้นตัวเลข)', async p => {
  await openManual(p);
  const m = await p.evaluate(() => { const e = document.querySelector('#bill-confirm-modal .modal'); return { sh: e.scrollHeight, ch: e.clientHeight, h: e.getBoundingClientRect().height }; });
  console.log('   ความสูงฟอร์ม =', Math.round(m.h), 'px');
  assert.ok(m.sh <= m.ch + 1, 'ต้องไม่มีแถบเลื่อนในฟอร์ม');
  assert.ok(m.h <= 844);
  assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.id), 'billAmt0');
  assert.equal(await p.getAttribute('#billAmt0', 'inputmode'), 'decimal');
  const order = await p.evaluate(() => ['#billAmt0', '.bill-cat-grid', '.bill-pay-chips', '#billDrafts input[list]', '#billDrafts input[type=date]'].map(s => document.querySelector(s).getBoundingClientRect().y));
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'ลำดับ ยอด → หมวด → จ่ายด้วย → ร้าน → วันที่');
  await closeForm(p);
});
test('เฟส2: บันทึกรายจ่ายเงินสดด้วยการแตะ ≤ 4 ครั้งหลังพิมพ์ยอด', async p => {
  await openManual(p); const n0 = await p.evaluate(() => state.transactions.length);
  await p.keyboard.type('123.5');
  let taps = 0;
  await p.locator('.bill-cat-tile', { hasText: 'ช้อปปิ้ง' }).click(); taps++;
  await p.locator('.bill-pay-chip', { hasText: 'เงินสด' }).click(); taps++;
  await p.locator('#billSaveBtn').click(); taps++; await p.waitForTimeout(250);
  assert.ok(taps <= 4);
  const t = await lastTx(p);
  assert.equal(await p.evaluate(() => state.transactions.length), n0 + 1);
  assert.deepEqual([t.amount, t.category, t.payMethod, t.card, t.currency, t.type], [123.5, 'shopping', 'cash', '', 'THB', 'expense']);
  assert.equal(t.date, await p.evaluate(() => todayISO()));
});
test('เฟส2: ชิปบัตร = แตะเดียวตั้ง payMethod=card + card, ชิปวันที่ "เมื่อวาน"', async p => {
  await openManual(p);
  await p.keyboard.type('500');
  await p.locator('.bill-pay-chip', { hasText: 'KBank THE PASSION' }).click();
  await p.locator('.bill-quick', { hasText: 'เมื่อวาน' }).click();
  await p.locator('#billSaveBtn').click(); await p.waitForTimeout(250);
  const t = await lastTx(p);
  assert.deepEqual([t.payMethod, t.card], ['card', 'KBank THE PASSION']);
  assert.equal(t.date, await p.evaluate(() => billIsoAdd(todayISO(), -1)));
});
test('เฟส2: ตารางหมวด = 8 หมวดที่ใช้บ่อยสุดใน 90 วัน + "ทั้งหมด" แสดงครบ', async p => {
  await p.evaluate(() => { const y = todayISO(); for (let i = 0; i < 5; i++) state.transactions.push({ id: 'ent' + i, date: y, type: 'expense', category: 'entertainment', amount: 1, currency: 'THB', amountThb: 1, merchant: 'x', payMethod: 'cash' }); state.transactions.push({ id: 'old', date: '2020-01-01', type: 'expense', category: 'health', amount: 1, currency: 'THB', amountThb: 1, merchant: 'x', payMethod: 'cash' }); });
  await openManual(p);
  const keys = await p.evaluate(() => billTopCats('expense', 'other'));
  assert.equal(keys.length, 8);
  assert.equal(keys[0], 'entertainment');                         // ใช้บ่อยสุด (5 ครั้ง) ต้องมาก่อน
  const counts = await p.evaluate(() => { const c = {}; state.transactions.filter(t => t.type === 'expense' && t.date >= billIsoAdd(todayISO(), -90)).forEach(t => c[t.category] = (c[t.category] || 0) + 1); return c; });
  assert.ok(keys.slice(1, 4).every(k => counts[k] >= 1));         // ถัดมาเป็นหมวดที่มีรายการจริง
  assert.ok(!keys.includes('health'));                            // รายการเก่านอก 90 วันไม่นับ
  assert.equal(await p.locator('.bill-cat-tile').count(), 8);
  await p.locator('#billDrafts button', { hasText: 'ทั้งหมด ▾' }).click();
  assert.equal(await p.locator('.bill-cat-tile').count(), await p.evaluate(() => BILL_CATS.expense.length));
  await closeForm(p);
  await p.evaluate(() => { state.transactions = state.transactions.filter(t => !/^(ent\d|old)$/.test(t.id)); });
});
test('เฟส2: จำร้าน — เลือกชื่อเดิมแล้วเติมหมวด/ช่องทาง/บัตรล่าสุด และไม่เติมทับที่เลือกเอง', async p => {
  await openManual(p);
  assert.ok((await p.locator('#billDrafts datalist option[value="Netflix"]').count()) === 1);
  await p.fill('#billDrafts input[list]', 'Netflix'); await p.dispatchEvent('#billDrafts input[list]', 'change');
  await p.waitForTimeout(150);
  assert.deepEqual(await p.evaluate(() => { const d = billState.drafts[0]; return [d.category, d.payMethod, d.card]; }), ['entertainment', 'card', 'UOB PRVI Miles']);
  assert.equal(await p.locator('.bill-cat-tile.on .lb').textContent(), 'บันเทิง');
  await closeForm(p);
  await openManual(p);
  await p.locator('.bill-pay-chip', { hasText: 'เงินสด' }).click();
  await p.fill('#billDrafts input[list]', 'Netflix'); await p.dispatchEvent('#billDrafts input[list]', 'change'); await p.waitForTimeout(100);
  assert.equal(await p.evaluate(() => billState.drafts[0].payMethod), 'cash');
  await closeForm(p);
});
test('เฟส2: "เพิ่มเติม" พับไว้ และเปิดเองเมื่อมีค่า (ต่างประเทศ / เลขอ้างอิง / ผ่อน)', async p => {
  const isOpen = () => p.evaluate(() => document.querySelector('#billDrafts details.bill-more').open);
  await openManual(p); assert.equal(await isOpen(), false); await closeForm(p);
  await p.evaluate(() => billOpenConfirm([billNewDraft({ amount: 100, ref: 'ABC123', source: 'upload', aiRead: true })], '')); assert.equal(await isOpen(), true); await closeForm(p);
  await p.evaluate(() => billOpenConfirm([billNewDraft({ amount: 100, currency: 'USD', fx: 35, source: 'upload' })], '')); assert.equal(await isOpen(), true); await closeForm(p);
  await openManual(p); await p.locator('summary', { hasText: 'เพิ่มเติม' }).click();
  await p.locator('#billDrafts .bill-more select').first().selectOption('inst'); await p.waitForTimeout(100);
  assert.equal(await isOpen(), true); await closeForm(p);
});
test('เฟส2: บันทึกซ้ำ — ไม่คัดลอก ref/ผ่อน/Subscription และเป็นวันนี้', async p => {
  await p.evaluate(() => { state.transactions.push({ id: 'rp1', date: '2026-01-05', type: 'expense', category: 'food', amount: 99, currency: 'THB', fxToThb: 1, amountThb: 99, merchant: 'ร้านซ้ำ', payMethod: 'card', card: 'UOB PRVI Miles', ref: 'R-999', refKey: 'R999', installmentId: 'Z', installmentNo: 2, installmentOf: 5, subscriptionId: 'sX', subscriptionNo: 4 }); billEdit('rp1'); });
  await p.locator('button', { hasText: 'บันทึกอีกครั้งวันนี้' }).click(); await p.waitForTimeout(150);
  const d = await p.evaluate(() => ({ ...billState.drafts[0], e: billState.editingId }));
  assert.equal(d.e, null);
  assert.deepEqual([d.ref, d.installmentId, d.installmentNo, d.subscriptionId, d.subscriptionNo, d.plan], ['', '', 0, '', 0, 'once']);
  assert.deepEqual([d.amount, d.merchant, d.category, d.payMethod, d.card], [99, 'ร้านซ้ำ', 'food', 'card', 'UOB PRVI Miles']);
  assert.equal(d.date, await p.evaluate(() => todayISO()));
  assert.equal(await p.textContent('#billConfirmTitle'), 'เพิ่มรายการ');
  await p.locator('#billSaveBtn').click(); await p.waitForTimeout(250);
  const t = await lastTx(p);
  assert.deepEqual([t.ref || '', t.installmentId || '', t.subscriptionId || '', t.merchant], ['', '', '', 'ร้านซ้ำ']);
  assert.equal(await p.evaluate(() => state.transactions.filter(x => x.merchant === 'ร้านซ้ำ').length), 2);
});
test('เฟส2: คำแนะนำรูดบัตร — บรรทัดเดียว แตะเพื่อดูอันดับเต็ม', async p => {
  await openManual(p);
  assert.equal(await p.locator('.rw-rec').innerText(), '');                       // ยังไม่มียอด = ไม่แสดง
  await p.keyboard.type('1000');
  await p.locator('.bill-cat-tile', { hasText: 'อาหาร' }).click();
  await p.fill('#billAmt0', '1000'); await p.dispatchEvent('#billAmt0', 'input'); await p.waitForTimeout(100);
  const h1 = (await p.locator('.rw-rec').boundingBox()).height;
  assert.ok(h1 < 50, 'บรรทัดเดียว สูง ' + h1);
  assert.match(await p.locator('.rw-rec').innerText(), /คุ้มสุด/);
  await p.locator('.rw-rec').click(); await p.waitForTimeout(100);
  const h2 = (await p.locator('.rw-rec').boundingBox()).height;
  assert.ok(h2 > h1 + 30, 'ต้องขยายเป็นอันดับเต็ม');
  await closeForm(p);
});
test('เฟส2: เส้นทางเดิมยังใช้ได้ — ผ่อน / Subscription / ต่างประเทศ+ยอดบาทจริง / เงินคืน+หมวดที่หัก / แก้ไข / หลาย draft / คำเตือนซ้ำ', async p => {
  const n0 = () => p.evaluate(() => state.transactions.length);
  // ผ่อน 3 งวด จ่ายแล้ว 1 → ลง 2 รายการ
  let a = await n0();
  await openManual(p);
  await p.evaluate(() => { const d = billState.drafts[0]; d.amount = 1000; d.merchant = 'ทีวีผ่อน'; billDraftSet(0, 'plan', 'inst', true); billDraftSet(0, 'instMonths', 3); billDraftSet(0, 'instPaid', 1); });
  await p.locator('#billSaveBtn').click(); await p.waitForTimeout(250);
  assert.equal(await n0(), a + 2);
  assert.deepEqual(await p.evaluate(() => state.transactions.filter(t => t.merchant === 'ทีวีผ่อน').map(t => t.installmentNo + '/' + t.installmentOf)), ['2/3', '3/3']);
  // Subscription
  a = await n0();
  await p.evaluate(() => billOpenManualSub());
  await p.evaluate(() => { const d = billState.drafts[0]; d.amount = 159; d.merchant = 'Spotify'; d.date = todayISO(); billDraftSet(0, 'plan', 'sub', true); });
  await p.locator('#billSaveBtn').click(); await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => state.subscriptions.some(s => s.name === 'Spotify')));
  // ต่างประเทศ + ยอดบาทจริง
  await openManual(p);
  await p.evaluate(() => { const d = billState.drafts[0]; Object.assign(d, { amount: 100, currency: 'USD', fx: 35, merchant: 'Steam', thbActual: 3600, payMethod: 'card', card: 'KBank THE PASSION', category: 'entertainment' }); billRenderDrafts(); });
  assert.equal(await p.evaluate(() => document.querySelector('#billDrafts details.bill-more').open), true);
  await p.locator('#billSaveBtn').click(); await p.waitForTimeout(250);
  const fx = await p.evaluate(() => state.transactions.find(t => t.merchant === 'Steam'));
  assert.deepEqual([fx.amount, fx.currency, fx.amountThb, fx.thbActual], [100, 'USD', 3600, true]);
  // เงินคืน + หมวดที่หัก
  await openManual(p);
  await p.locator('#billDrafts .bill-type-toggle button', { hasText: 'รายรับ' }).click();
  await p.locator('#billDrafts button', { hasText: 'ทั้งหมด ▾' }).click();
  await p.locator('.bill-cat-tile', { hasText: /เงินคืน/ }).click();
  await p.fill('#billAmt0', '50'); await p.dispatchEvent('#billAmt0', 'input');
  await p.locator('#billDrafts select', { hasText: 'อาหาร' }).first().selectOption('food');
  await p.locator('#billSaveBtn').click(); await p.waitForTimeout(250);
  const rf = await lastTx(p); assert.deepEqual([rf.type, rf.category, rf.offsetCat, rf.amount], ['income', 'refund', 'food', 50]);
  // แก้ไขรายการ
  await p.evaluate(() => billEdit('x3'));
  await p.fill('#billAmt0', '777'); await p.dispatchEvent('#billAmt0', 'input');
  await p.locator('#billSaveBtn').click(); await p.waitForTimeout(250);
  assert.equal(await p.evaluate(() => state.transactions.find(t => t.id === 'x3').amount), 777);
  // หลาย draft จากสลิป
  await p.evaluate(() => billOpenConfirm([billNewDraft({ amount: 11, source: 'upload', merchant: 'A1' }), billNewDraft({ amount: 22, source: 'upload', merchant: 'A2' })], 'ทดสอบ'));
  assert.equal(await p.locator('#billDrafts .bill-draft').count(), 2);
  await p.locator('#billDrafts input[type=checkbox]').nth(1).uncheck();
  assert.equal(await p.textContent('#billSaveBtn'), 'บันทึก 1 รายการ');
  await p.locator('#billSaveBtn').click(); await p.waitForTimeout(250);
  assert.deepEqual(await p.evaluate(() => ['A1', 'A2'].map(m => state.transactions.some(t => t.merchant === m))), [true, false]);
  // คำเตือนซ้ำ: วัน+ยอดเท่ากัน / เลขอ้างอิงซ้ำ
  await p.evaluate(() => { const t = state.transactions.find(t => t.id === 'x1'); billOpenConfirm([billNewDraft({ amount: t.amount, date: t.date, currency: 'THB', source: 'upload' })], ''); });
  assert.match(await p.locator('.bill-warn').first().innerText(), /ยอดเท่ากัน/);
  await closeForm(p);
  await p.evaluate(() => { state.transactions.push({ id: 'refx', date: '2026-02-02', type: 'expense', category: 'food', amount: 5, currency: 'THB', amountThb: 5, refKey: 'ZZ99', ref: 'ZZ99', merchant: 'q', payMethod: 'cash' }); billOpenConfirm([billNewDraft({ amount: 5, ref: 'ZZ99', date: '2026-02-02', source: 'upload' })], ''); });
  assert.match(await p.locator('.bill-warn').first().innerText(), /เลขอ้างอิงนี้บันทึกไปแล้ว/);
  await closeForm(p);
});

// ───────── เฟส 3 ─────────
const tab = (p, name) => p.evaluate(n => { showPage('bills'); billSetTab(n); window.scrollTo(0, 0); }, name);
test('เฟส3: แท็บรายการมีแค่ค้นหา + ปุ่มกรองปุ่มเดียว; ตัวกรองอยู่ในแผ่นล่าง', async p => {
  await tab(p, 'list');
  assert.equal(await vis(p, '#billFilterBtn'), true);
  assert.equal(await vis(p, '#billSearch'), true);
  for (const s of ['#billCatFilter', '#billPayFilter', '#billFilterChips', '#billListModeToggle']) assert.equal(await vis(p, s), false, s + ' ต้องซ่อนจนกว่าจะเปิดแผ่นกรอง');
  await p.click('#billFilterBtn'); await p.waitForTimeout(150);
  for (const s of ['#billCatFilter', '#billPayFilter', '#billFilterChips', '#billListModeToggle']) assert.equal(await vis(p, s), true, s);
  const m = await rect(p, '#billFilterSheet .modal'); assert.ok(Math.abs(m.b - 844) < 2, 'แผ่นต้องชิดขอบล่างจอ');
  assert.equal(await vis(p, '.bill-fab'), false);
  await p.selectOption('#billCatFilter', 'food');
  await p.click('#billFilterChips [data-f=expense]');
  await p.click('#billListModeToggle [data-m=week]');
  await p.evaluate(() => closeModal('billFilterSheet'));
  const chips = await p.locator('#billActiveFilters .bill-card-chip').allInnerTexts();
  assert.equal(chips.length, 3, chips.join('|'));
  assert.equal(await p.textContent('#billFilterBadge'), '3');
  assert.equal(await vis(p, '#billRangeNav'), true);
  // ลบชิปทีละอัน
  await p.locator('#billActiveFilters .bill-card-chip button').first().click();
  assert.equal(await p.evaluate(() => billState.listMode), 'month');
  assert.equal(await p.textContent('#billFilterBadge'), '2');
  await p.evaluate(() => billClearFilters());
  assert.deepEqual(await p.evaluate(() => [billState.catFilter, billState.payFilter, billState.filter, billState.listMode]), ['', '', 'all', 'month']);
  assert.equal(await vis(p, '#billActiveFilters'), false);
});
test('เฟส3: ค่าเริ่มต้นช่วงรายการ = เดือน และไม่จำโหมดวัน/สัปดาห์ข้ามการเปิดแอป', async p => {
  await p.evaluate(() => billSetListMode('day'));
  assert.equal(await p.evaluate(() => localStorage.getItem('folio_bill_listmode')), null);
  await p.evaluate(() => billSetListMode('month'));
});
test('เฟส3: การ์ดสรุปเต็มเฉพาะภาพรวม แท็บอื่นบรรทัดเดียว', async p => {
  await tab(p, 'overview'); const full = await rect(p, '#billMetrics');
  assert.ok(full.h > 110, 'เต็ม ' + full.h);
  for (const t of ['list', 'cards', 'recur']) {
    await tab(p, t); const c = await rect(p, '#billMetrics');
    assert.ok(c.h < 60, t + ' ย่อ ' + c.h);
    assert.match(await p.textContent('#billMetrics .bh-compact'), /เงินเหลือ.*รับ.*จ่าย/);
  }
});
test('เฟส3: ภาพรวมเรียงใหม่ (บิลถัดไป → หมวด 5 อันดับ → แนวโน้ม → เงินเหลือ↔DCA → ช่องทาง พับ → AI)', async p => {
  await tab(p, 'overview');
  assert.equal(await vis(p, '#billCashflowCard'), false, 'ไม่มี DCA/ไม่มีเดือนที่จบแล้ว ต้องซ่อน ' + JSON.stringify(await p.evaluate(() => ({ dca: dcaMonthly(), avg: billAvgSurplus(), n: state.dcaSchedules }))));
  assert.equal(await p.locator('#billCatList .bill-cat-row').count(), 5);
  await p.locator('#billCatMore').click();
  assert.ok((await p.locator('#billCatList .bill-cat-row').count()) > 5);
  await p.locator('#billCatMore').click();
  assert.equal(await p.locator('#billCatList .bill-cat-row').count(), 5);
  assert.equal(await p.evaluate(() => document.getElementById('billPayCard').open), false, 'แยกตามช่องทางจ่ายต้องพับ');
  assert.equal(await p.locator('#billPay').isVisible(), false);
  await p.evaluate(() => { window.dcaMonthly = () => 5000; billRender(); });
  assert.equal(await vis(p, '#billCashflowCard'), true);
  const ys = await p.evaluate(() => ['#billOvTiles', '#billCatList', '#billTrendTitle', '#billCashflowCard', '#billPayCard', '#billAiBtn'].map(s => Math.round(document.querySelector(s).getBoundingClientRect().y)));
  assert.deepEqual([...ys].sort((a, b) => a - b), ys, 'ลำดับ ' + ys);
  await p.evaluate(() => { delete window.dcaMonthly; billRender(); });
});
test('เฟส3: แตะจากแดชบอร์ด (billDrill) กรองถูกและยอดสรุปตรงกับตัวเลขที่แตะ', async p => {
  const ym = await p.evaluate(() => billState.month);
  const fmt = n => '฿' + Math.round(n).toLocaleString();
  const expected = await p.evaluate(ym => { const sum = f => state.transactions.filter(t => t.date.startsWith(ym) && f(t)).reduce((a, t) => a + billAmtThb(t), 0); return { food: sum(t => t.type === 'expense' && t.category === 'food') - sum(t => t.type === 'income' && t.category === 'refund' && (t.offsetCat || 'other') === 'food'), uob: sum(t => t.type === 'expense' && t.payMethod === 'card' && t.card === 'UOB PRVI Miles' && !BILL_NON_SPEND.includes(t.category)) }; }, ym);
  await p.evaluate(() => { showPage('bills'); billSetTab('overview'); billDrill('cat', 'food'); });
  assert.equal(await p.evaluate(() => billState.tab), 'list');
  assert.ok((await p.textContent('#billRangeSummary')).includes('−' + fmt(expected.food)), await p.textContent('#billRangeSummary'));
  const rows = await p.evaluate(() => [...document.querySelectorAll('#billList .bill-sub')].map(e => e.textContent));
  assert.ok(rows.length > 0 && rows.every(s => s.includes('อาหาร')));
  await p.evaluate(() => billDrill('pay', 'card:UOB PRVI Miles'));
  assert.ok((await p.textContent('#billRangeSummary')).includes('−' + fmt(expected.uob)), await p.textContent('#billRangeSummary'));
  assert.ok((await p.locator('#billActiveFilters').innerText()).includes('UOB PRVI Miles'));
  await p.evaluate(() => billClearFilters());
});
test('เฟส3: ลบแล้วเลิกทำ — คืนด้วย id เดิม (ref_… และ <subId>_<n>) และแถบหายใน 6 วินาที', async p => {
  await p.evaluate(() => { const y = todayISO(); state.transactions.push({ id: 'ref_ABC123', date: y, type: 'expense', category: 'food', amount: 80, currency: 'THB', amountThb: 80, merchant: 'สลิป', refKey: 'ABC123', ref: 'ABC123', payMethod: 'cash' }, { id: 's1_7', date: y, type: 'expense', category: 'entertainment', amount: 419, currency: 'THB', amountThb: 419, merchant: 'Netflix', subscriptionId: 's1', subscriptionNo: 7, payMethod: 'card', card: 'UOB PRVI Miles' }); billRender(); });
  for (const id of ['ref_ABC123', 's1_7']) {
    const before = await p.evaluate(id => ({ ...state.transactions.find(t => t.id === id) }), id);
    await p.evaluate(id => billDelete(id), id);
    assert.equal(await p.evaluate(id => state.transactions.some(t => t.id === id), id), false);
    assert.equal(await vis(p, '#billUndo'), true);
    await p.click('#billUndoBtn'); await p.waitForTimeout(150);
    assert.deepEqual(await p.evaluate(id => state.transactions.find(t => t.id === id), id), before);
    assert.equal(await vis(p, '#billUndo'), false);
  }
  await p.evaluate(() => billDelete('ref_ABC123')); assert.equal(await vis(p, '#billUndo'), true);
  await p.waitForTimeout(6300); assert.equal(await vis(p, '#billUndo'), false, 'ต้องซ่อนหลัง 6 วินาที');
  await p.evaluate(() => billUndoRun()); // แถบหายแล้ว เลิกทำไม่ได้
  assert.equal(await p.evaluate(() => state.transactions.some(t => t.id === 'ref_ABC123')), false);
  await p.evaluate(() => { state.transactions = state.transactions.filter(t => t.id !== 's1_7'); billRender(); });
});
test('เฟส3: โหมด Firestore (จำลอง FB) — ลบเรียก FB.del, เลิกทำเรียก FB.put ด้วย id เดิมและไม่ส่งฟิลด์ id', async p => {
  const calls = await p.evaluate(async () => {
    const log = [];
    state.transactions.push({ id: 's1_9', date: todayISO(), type: 'expense', category: 'food', amount: 5, currency: 'THB', amountThb: 5, merchant: 'FBทดสอบ', payMethod: 'cash' });
    window.FB = { del: async (c, id) => log.push(['del', c, id]), put: async (c, id, d) => log.push(['put', c, id, Object.keys(d).includes('id'), d.merchant]) };
    await billDelete('s1_9'); await billUndoRun();
    delete window.FB; state.transactions = state.transactions.filter(t => t.id !== 's1_9'); billHideUndo();
    return log;
  });
  assert.deepEqual(calls, [['del', 'transactions', 's1_9'], ['put', 'transactions', 's1_9', false, 'FBทดสอบ']]);
});
test('เฟส3: แถวแรกของแท็บรายการอยู่ในครึ่งบนของจอ 844px (y < 422)', async p => {
  await tab(p, 'list');
  const r = await rect(p, '#billList .bill-row');
  console.log('   แถวแรกอยู่ที่ y =', Math.round(r.y));
  assert.ok(r.y < 422);
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
