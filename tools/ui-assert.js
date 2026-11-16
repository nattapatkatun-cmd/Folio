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
  assert.equal(await p.evaluate(() => document.querySelector('#page-bills .bill-head .page-greeting')), null);
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

// ───────── เฟส 4 ─────────
const go = (p, name) => p.evaluate(n => { showPage('bills'); billSetTab(n); window.scrollTo(0, 0); }, name);
test('เฟส4: มือถือ — แถบล่าง 4 ปุ่ม ไม่มีเมนูบนเลื่อนแนวนอน และไม่มีหน้าเลื่อนแนวนอน', async p => {
  assert.equal(await vis(p, '.topbar .nav'), false);
  assert.equal(await vis(p, '#bottomNav'), true);
  const btns = await p.evaluate(() => [...document.querySelectorAll('#bottomNav button')].map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), h: r.height, w: r.width }; }));
  assert.equal(btns.length, 4);
  btns.forEach(b => assert.ok(b.h >= 44, 'ปุ่ม ' + b.t + ' สูง ' + b.h));
  const nav = await rect(p, '#bottomNav'); assert.ok(Math.abs(nav.b - 844) < 1, 'แถบล่างต้องชิดขอบล่าง');
  for (const pg of ['overview', 'trading', 'benchmark', 'signals', 'bills', 'settings']) {
    await p.evaluate(x => showPage(x), pg); await p.waitForTimeout(100);
    assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= 390 && document.body.scrollWidth <= 390), pg + ' เลื่อนแนวนอน');
  }
});
test('เฟส4: เมนูลงทุน = ซื้อขาย / Benchmark / สัญญาณ จำแท็บล่าสุด', async p => {
  await p.evaluate(() => { _lastInvest = 'trading'; showPage('overview'); });   // ค่าเริ่มต้นของ "ลงทุน" = ซื้อขาย
  await p.click('#bottomNav [data-group=invest]');
  assert.equal(await p.evaluate(() => document.getElementById('page-trading').classList.contains('active')), true);
  assert.deepEqual(await p.locator('#page-trading .invest-tabs button').allInnerTexts(), ['ซื้อขาย', '📈 Benchmark', '📡 สัญญาณ']);
  await p.locator('#page-trading .invest-tabs button', { hasText: 'Benchmark' }).click();
  assert.equal(await p.evaluate(() => document.getElementById('page-benchmark').classList.contains('active')), true);
  assert.equal(await p.evaluate(() => document.querySelector('#bottomNav [data-group=invest]').classList.contains('active')), true);
  await p.click('#bottomNav [data-group=bills]');
  assert.equal(await p.evaluate(() => document.querySelector('#bottomNav [data-group=invest]').classList.contains('active')), false);
  await p.click('#bottomNav [data-group=invest]');
  assert.equal(await p.evaluate(() => document.getElementById('page-benchmark').classList.contains('active')), true, 'ต้องกลับไปแท็บลงทุนล่าสุด');
  await p.locator('#page-benchmark .invest-tabs button', { hasText: 'สัญญาณ' }).click();
  assert.equal(await p.evaluate(() => document.getElementById('page-signals').classList.contains('active')), true);
  await p.click('#bottomNav [data-group=settings]');
  assert.equal(await p.evaluate(() => document.getElementById('page-settings').classList.contains('active')), true);
  await p.click('#bottomNav [data-group=overview]');
  assert.equal(await p.evaluate(() => document.getElementById('page-overview').classList.contains('active')), true);
});
test('เฟส4: ปุ่มลอย ＋ และแถบเลิกทำอยู่เหนือแถบล่าง', async p => {
  await go(p, 'list');
  const fab = await rect(p, '.bill-fab'), nav = await rect(p, '#bottomNav');
  assert.ok(fab.b <= nav.y, 'ปุ่มลอยต้องไม่ทับแถบล่าง fab.b=' + fab.b + ' nav.y=' + nav.y);
  await p.evaluate(() => billShowUndo('ทดสอบ', []));
  const u = await rect(p, '#billUndo');
  assert.ok(u.b <= fab.y + 1 || u.r <= fab.x, 'แถบเลิกทำต้องไม่ทับปุ่มลอย');
  assert.ok(u.b <= nav.y);
  await p.evaluate(() => billHideUndo());
  // เลื่อนสุดหน้า ไม่มีเนื้อหาถูกแถบล่างบัง
  for (const t of ['overview', 'list', 'cards', 'recur', 'budget']) {
    await go(p, t); await p.evaluate(() => window.scrollTo(0, 1e6)); await p.waitForTimeout(120);
    const last = await p.evaluate(() => { const els = [...document.querySelectorAll('#page-bills .bill-tab.on .card, #page-bills .bill-tab.on .metric')]; const e = els[els.length - 1]; return e ? e.getBoundingClientRect().bottom : 0; });
    const nv = await rect(p, '#bottomNav'); assert.ok(last <= nv.y, t + ': เนื้อหาท้ายหน้าถูกแถบล่างบัง ' + last + ' > ' + nv.y);
  }
});
test('เฟส4: หน้างบประมาณย้ายเป็นแท็บ "งบ" — ลิงก์เก่า showPage(budget) พาไปแท็บนี้', async p => {
  assert.equal(await p.evaluate(() => !!document.getElementById('page-budget')), false);
  assert.equal(await p.locator('.nav-btn[data-group=budget], #bottomNav [data-group=budget]').count(), 0);
  await p.evaluate(() => showPage('budget')); await p.waitForTimeout(150);
  assert.deepEqual(await p.evaluate(() => [document.getElementById('page-bills').classList.contains('active'), billState.tab]), [true, 'budget']);
  assert.ok((await p.locator('#budgetMetrics .metric').count()) >= 4);
  assert.equal(await vis(p, '[data-tab=budget]'), true);
  assert.equal(await vis(p, '#page-bills .bill-head .bill-month-nav'), false);
  assert.equal(await p.evaluate(() => document.querySelector('#billTabs button.on').dataset.t), 'budget');
});
test('เฟส4: ฟังก์ชันงบเดิมครบ — ตั้ง/แก้/ลบงบ, ตั้งงบจาก "ใช้จ่ายนอกงบ", เป้าออม, แก้รายได้, แตะไปดูรายการ', async p => {
  await p.evaluate(() => showPage('budget')); await p.waitForTimeout(150);
  const nb = () => p.evaluate(() => state.budgetExpenses.length);
  const n0 = await nb();
  // ตั้งงบใหม่
  await p.locator('[data-tab=budget] button', { hasText: '+ ตั้งงบ' }).first().click();
  await p.selectOption('#exp-billcat', 'transport'); await p.fill('#exp-amount', '3000');
  await p.click('#expense-modal .btn-primary'); await p.waitForTimeout(200);
  assert.equal(await nb(), n0 + 1);
  assert.ok((await p.textContent('#expenseList')).includes('฿3,000'));
  // แก้งบ
  const idx = await p.evaluate(() => state.budgetExpenses.findIndex(e => e.billCat === 'transport'));
  await p.evaluate(i => budgetOpenExpense(i), idx); await p.fill('#exp-amount', '3500'); await p.click('#expense-modal .btn-primary'); await p.waitForTimeout(150);
  assert.equal(await p.evaluate(i => state.budgetExpenses[i].amount, idx), 3500);
  // ลบงบ
  p.once('dialog', d => d.accept()); await p.evaluate(i => deleteExpense(i), idx); await p.waitForTimeout(150);
  assert.equal(await nb(), n0);
  // ตั้งงบจากรายการ "ใช้จ่ายนอกงบ"
  const out = p.locator('#expenseList >> text=+ ตั้งงบ').first();
  assert.ok(await out.count() > 0, 'ต้องมีปุ่มตั้งงบจากรายการนอกงบ');
  await out.click(); assert.equal(await p.evaluate(() => document.getElementById('expense-modal').classList.contains('open')), true);
  assert.notEqual(await p.inputValue('#exp-billcat'), 'food');   // หมวดถูกเติมจากแถวที่แตะ
  await p.evaluate(() => closeModal('expense-modal'));
  // เป้าออม
  await p.evaluate(() => { openModal('saving-modal'); }); await p.fill('#sav-name', 'ทดสอบออม'); await p.fill('#sav-target', '10000'); await p.fill('#sav-current', '2500');
  await p.click('#saving-modal .btn-primary'); await p.waitForTimeout(150);
  assert.ok((await p.textContent('#savingsList')).includes('ทดสอบออม'));
  await p.evaluate(() => deleteSaving(state.budgetSavings.length - 1)); await p.waitForTimeout(100);
  assert.ok(!(await p.textContent('#savingsList')).includes('ทดสอบออม'));
  // แก้รายได้ตามแผน
  p.once('dialog', d => d.accept('90000')); await p.evaluate(() => editIncome()); await p.waitForTimeout(150);
  assert.ok((await p.textContent('#budgetMetrics')).includes('90,000'));
  // แตะหมวดไปดูรายการจริง (budgetGoBills)
  await p.evaluate(() => budgetGoBills('cat', 'food')); await p.waitForTimeout(150);
  assert.deepEqual(await p.evaluate(() => [billState.tab, billState.catFilter]), ['list', 'food']);
  await p.evaluate(() => billClearFilters());
});
test('เฟส4: ตั้งค่าที่เดียว — เนื้อหา billSettingsModal ย้ายเข้าหน้า ⚙️ ตั้งค่า และ ⚙️ ในหน้าบิลพาไปหัวข้อนั้น', async p => {
  assert.equal(await p.evaluate(() => !!document.getElementById('billSettingsModal')), false);
  assert.equal(await p.evaluate(() => ['billOwnerNames', 'billCardChips', 'billFxFeeDefault', 'billCardNew'].every(id => document.querySelector('#page-settings #settingsBill #' + id))), true);
  await go(p, 'cards');
  await p.click('#page-bills .bill-head .bill-icon-btn'); await p.waitForTimeout(700);
  assert.equal(await p.evaluate(() => document.getElementById('page-settings').classList.contains('active')), true);
  const r = await rect(p, '#settingsBill'); assert.ok(r.y < 300 && r.y > -50, 'เลื่อนไปที่หัวข้อ y=' + r.y);
  await go(p, 'cards');
  await p.click('#page-bills [data-tab=cards] button:has-text("ตั้งค่าบัตร")'); await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => document.getElementById('page-settings').classList.contains('active')), true);
  await p.locator('#settingsBill button', { hasText: 'สิทธิ์บัตร' }).click();
  assert.equal(await p.evaluate(() => document.getElementById('billRwModal').classList.contains('open')), true);
  await p.evaluate(() => closeModal('billRwModal'));
  await p.fill('#billCardNew', 'KTC 9999'); await p.click('#settingsBill button:has-text("เพิ่มบัตร")');
  assert.ok((await p.evaluate(() => localStorage.getItem('folio_bill_cards'))).includes('KTC 9999'));
  await p.evaluate(() => localStorage.setItem('folio_bill_cards', 'UOB PRVI Miles, KBank THE PASSION, ttb absolute'));
});

// ───────── เฟส 5 ─────────
const withToday = async (p, iso, fn) => { await p.evaluate(d => { window._realToday = window.todayISO; window.todayISO = () => d; }, iso); try { return await fn(); } finally { await p.evaluate(() => { window.todayISO = window._realToday; }); } };
const mockGemini = p => p.evaluate(() => { window._calls = []; window._geminiFail = 0; window.callGemini = async req => { window._calls.push({ sys: req.systemInstruction.parts[0].text, last: req.contents[req.contents.length - 1].parts[0].text }); if (window._geminiFail-- > 0) throw new Error('boom'); return { candidates: [{ content: { parts: [{ text: 'สรุป: ตอบทดสอบ' }] } }] }; }; });
const aihIdle = p => p.waitForFunction(() => !aihBusy);
test('เฟส5: โหมดคะแนนเหลือ "คุ้มสุด" อย่างเดียว — ไม่มีปุ่มสลับ/ตัวเลือกโหมด และไม่แตะค่า folio_bill_rw_mode2', async p => {
  await p.evaluate(() => localStorage.setItem('folio_bill_rw_mode2', 'rop'));
  await go(p, 'cards');
  assert.equal(await p.evaluate(() => !!document.getElementById('billRwModeToggle')), false);
  assert.equal(await p.evaluate(() => typeof billRwSetMode), 'undefined');
  assert.equal(await p.evaluate(() => billRwMode()), 'baht');
  await p.evaluate(() => { billRwOpen(); });
  assert.equal(await p.locator('#billRwModalBody select[onchange*=billRwSetMode]').count(), 0);
  assert.equal(await p.evaluate(() => localStorage.getItem('folio_bill_rw_mode2')), 'rop', 'ค่าเดิมต้องไม่ถูกเขียนทับ');
  await p.evaluate(() => closeModal('billRwModal'));
  assert.equal(await p.evaluate(() => billSyncPayload && 1).catch(() => 1), 1);
  await p.evaluate(() => localStorage.removeItem('folio_bill_rw_mode2'));
});
test('เฟส5: แต่ละบัตรมีบรรทัดรอง = คะแนนดิบ + ไมล์ ROP ที่เทียบเท่า', async p => {
  await go(p, 'cards');
  const subs = await p.locator('#billRw details.rw-card .rw-sub2').allInnerTexts();
  assert.ok(subs.length >= 3, 'มีบัตรอย่างน้อย 3 ใบ ได้ ' + subs.length);
  assert.ok(subs.every(s => /\d/.test(s)), subs.join('|'));
  const uob = await p.evaluate(() => { const prof = billRwCards().find(x => x.card === 'UOB PRVI Miles'); return prof.ropPer; });
  assert.ok(uob > 0);
  assert.ok(subs.some(s => /ไมล์ ROP/.test(s)), 'บัตรที่มีอัตรา ROP ต้องแสดงไมล์ ROP: ' + subs.join('|'));
});
test('เฟส5: ซ่อนคำเตือน "โปรไฟล์ที่ยังไม่มีบัตร" — เตือนเฉพาะบัตรที่ยังไม่ผูกโปรไฟล์', async p => {
  await go(p, 'cards');
  assert.ok(!(await p.textContent('#billRw')).includes('โปรไฟล์ที่ยังไม่มีบัตร'));
  assert.equal(await p.locator('#billRwUnmapped').count(), 0);
  await p.evaluate(() => { localStorage.setItem('folio_bill_cards', 'UOB PRVI Miles, KBank THE PASSION, ttb absolute, MyCard 1111'); billRender(); });
  assert.equal(await p.locator('#billRwUnmapped').count(), 1);
  assert.match(await p.textContent('#billRwUnmapped'), /MyCard 1111/);
  assert.ok(!(await p.textContent('#billRw')).includes('โปรไฟล์ที่ยังไม่มีบัตร'));
  await p.evaluate(() => { localStorage.setItem('folio_bill_cards', 'UOB PRVI Miles, KBank THE PASSION, ttb absolute'); billRender(); });
});
test('เฟส5: แถบเตือนโปรหมดอายุ — ใกล้หมด (≤30 วัน) / หมดแล้ว พร้อมปุ่มไปแก้วันหมดอายุ แก้แล้วแถบหาย', async p => {
  const expectCount = d => p.evaluate(d => billRwExpiring(billRwCards(), d).length, d);
  // ไกลเกิน 30 วันจากทุกกฎ → ไม่มีแถบ (ใช้วันที่ย้อนไปไกล)
  await withToday(p, '2020-01-01', async () => { await go(p, 'cards'); assert.equal(await p.locator('#billRwExpiry').count(), 0); assert.equal(await expectCount('2020-01-01'), 0); });
  // หาวันหมดโปรที่ใกล้ที่สุดของกฎที่ใช้อยู่ แล้วทดสอบก่อนหมด 10 วัน
  const target = await p.evaluate(() => { const v = []; billRwCards().forEach(pr => pr.p.rules.forEach(r => { if (r.validTo && !pr.off[r.id]) v.push(r.validTo); })); return v.sort()[0]; });
  assert.ok(target, 'ต้องมีกฎที่มีวันหมดโปร');
  const before10 = await p.evaluate(t => billIsoAdd(t, -10), target);
  await withToday(p, before10, async () => {
    await go(p, 'cards');
    assert.equal(await p.locator('#billRwExpiry').count(), 1);
    assert.match(await p.textContent('#billRwExpiry'), /อีก 10 วัน/);
    assert.match(await p.textContent('#billRwExpiry'), /แก้วันหมดอายุ/);
  });
  const after5 = await p.evaluate(t => billIsoAdd(t, 5), target);
  await withToday(p, after5, async () => { await go(p, 'cards'); assert.match(await p.textContent('#billRwExpiry'), /หมดแล้ว/); });
  // ปุ่มไปตั้งค่าบัตร + แก้วันหมดอายุ (ไม่ต้องแก้โค้ด) → แถบหาย
  await withToday(p, after5, async () => {
    await go(p, 'cards');
    const n0 = await expectCount(after5); assert.ok(n0 >= 1);
    await p.click('#billRwExpiry button'); await p.waitForTimeout(150);
    assert.equal(await p.evaluate(() => document.getElementById('billRwModal').classList.contains('open')), true);
    const inputs = p.locator('#billRwModalBody input[type=date]');
    const idx = await inputs.evaluateAll((els, t) => els.findIndex(e => e.value === t), target);
    assert.ok(idx >= 0, 'ต้องมีช่องวันหมดเขตของกฎนี้');
    await inputs.nth(idx).evaluate(el => { el.value = '2099-12-31'; el.dispatchEvent(new Event('change')); }); await p.waitForTimeout(200);   // ช่องอยู่ใน <details> ที่พับอยู่ จึงตั้งค่าตรง ๆ
    await p.evaluate(() => closeModal('billRwModal'));
    assert.ok((await expectCount(after5)) < n0, 'กฎที่แก้วันหมดเขตต้องไม่ถูกเตือนอีก');
    assert.equal(await p.evaluate(() => { localStorage.removeItem('folio_bill_card_profiles'); billRender(); return 1; }), 1);
  });
});
test('เฟส5: AI แชตเดียว — ปุ่มลัดบัตร/บิลเปิดแชตหน้าแรกพร้อมคำถามตั้งต้นและบริบทที่ถูกต้อง', async p => {
  await p.evaluate(() => { localStorage.removeItem('folio_aiHubThread'); aihThread = []; });
  await mockGemini(p);
  assert.equal(await p.evaluate(() => [typeof rwcAsk, typeof rwcRender, !!document.getElementById('rwcThread'), !!document.getElementById('rwcInput'), !!document.getElementById('billAiResult')].join()), 'undefined,undefined,false,false,false');
  // จากแท็บบัตร
  await go(p, 'cards');
  const q1 = (await p.locator('#rwcCard .rwc-chip').first().innerText()).trim();
  await p.locator('#rwcCard .rwc-chip').first().click(); await aihIdle(p); await p.waitForTimeout(100);
  assert.equal(await p.evaluate(() => document.getElementById('page-overview').classList.contains('active')), true);
  let calls = await p.evaluate(() => window._calls);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].sys.includes('[บัตร]') && calls[0].sys.includes('แนะนำ: <ชื่อบัตร>') && calls[0].sys.includes('ข้อมูลบัตรเครดิต/สิทธิ์'), 'บริบทบัตร');
  assert.ok(calls[0].last.includes('รูดใบไหน'));
  const bubbles = await p.locator('#aihThread .aih-bubble').allInnerTexts();
  assert.ok(bubbles.length === 2 && bubbles[1].includes('ตอบทดสอบ'), bubbles.join('|'));
  // จากแท็บภาพรวมของบิล
  await go(p, 'overview');
  await p.click('#billAiBtn'); await aihIdle(p); await p.waitForTimeout(100);
  calls = await p.evaluate(() => window._calls);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].sys.includes('รายรับ-รายจ่ายจริงจากสลิป/บิล') && !calls[1].sys.includes('[บัตร]'), 'บริบทบิลต้องมี และไม่มีบริบทบัตร');
  assert.ok(calls[1].last.includes('## จุดรั่วไหล'));
  // พิมพ์ถามเองที่หน้าแรก = บริบททั่วไป
  await p.fill('#aihInput', 'ทดสอบถามเอง'); await p.click('#aihSend'); await aihIdle(p); await p.waitForTimeout(100);
  calls = await p.evaluate(() => window._calls);
  assert.equal(calls.length, 3); assert.ok(!calls[2].sys.includes('[บัตร]'));
  // error → ลองใหม่ ต้องคงบริบทบัตร
  await p.evaluate(() => { window._geminiFail = 1; });
  await go(p, 'cards'); await p.locator('#rwcCard .rwc-chip').nth(1).click(); await aihIdle(p); await p.waitForTimeout(100);
  assert.ok((await p.locator('#aihThread .aih-err').count()) === 1);
  await p.evaluate(() => aihRetry()); await aihIdle(p); await p.waitForTimeout(100);
  calls = await p.evaluate(() => window._calls);
  assert.equal(calls.length, 5); assert.ok(calls[4].sys.includes('[บัตร]'), 'ลองใหม่ต้องคงบริบทบัตร');
  // กำลังตอบอยู่ → ปุ่มลัดไม่ยิงซ้อน
  await p.evaluate(() => { aihBusy = true; });
  await go(p, 'cards'); await p.locator('#rwcCard .rwc-chip').first().click();
  assert.equal((await p.evaluate(() => window._calls)).length, 5);
  await p.evaluate(() => { aihBusy = false; localStorage.removeItem('folio_aiHubThread'); aihThread = []; });
});

// ───────── เฟส 6b ─────────
test('เฟส6b: กระทบยอดบัตร — ใส่ยอด statement แล้วเห็นส่วนต่าง + รายการต่างประเทศที่ยอดบาทยังประมาณ', async p => {
  const info = await p.evaluate(() => { window._rt = window.todayISO; window.todayISO = () => '2026-11-20';
    const prof = billRwCards().find(c => c.card === 'UOB PRVI Miles'); const cur = billRwCycle(prof.stmtDay, todayISO()); const closed = billRwCycle(prof.stmtDay, billIsoAdd(cur.start, -1));
    return { start: closed.start, end: closed.end }; });
  try {
    await p.evaluate(i => { window.todayISO = () => billIsoAdd(i.end, 1);
      const base = { type: 'expense', category: 'shopping', payMethod: 'card', card: 'UOB PRVI Miles', fxToThb: 1 };
      state.transactions.push({ ...base, id: 'st1', date: i.end, amount: 1000, currency: 'THB', amountThb: 1000, merchant: 'Lazada' },
        { ...base, id: 'st2', date: i.end, amount: 100, currency: 'USD', fxToThb: 35, amountThb: 3500, thbActual: false, merchant: 'Agoda' }); billRender(); }, info);
    await go(p, 'cards');
    const row = p.locator('.rw-stmt[data-card="UOB PRVI Miles"]');
    assert.equal(await row.count(), 1);
    // ยังไม่ใส่ยอด → ไม่มีผลเทียบ แต่เตือนรายการต่างประเทศที่ยังประมาณ
    assert.equal(await row.locator('.rw-stmt-res').count(), 0);
    assert.match(await row.locator('.rw-stmt-est').innerText(), /Agoda.*USD 100/);
    const app = await p.evaluate(i => billRwTxs('UOB PRVI Miles', i.start, i.end).reduce((a, t) => a + billAmtThb(t), 0), info);
    // statement สูงกว่าแอป 1,234
    await row.locator('input').fill(String(app + 1234)); await row.locator('input').dispatchEvent('change'); await p.waitForTimeout(150);
    let res = await p.locator('.rw-stmt[data-card="UOB PRVI Miles"] .rw-stmt-res').innerText();
    assert.match(res, /สูงกว่าแอป \+฿1,234/); assert.ok(res.includes('ยอดในแอป ฿' + Math.round(app).toLocaleString()));
    // เก็บถูกที่ (card → วันตัดรอบ) และคงอยู่หลังวาดใหม่
    assert.equal(await p.evaluate(i => JSON.parse(localStorage.getItem('folio_bill_statements'))['UOB PRVI Miles'][i.end], info), app + 1234);
    await p.evaluate(() => billRender());
    assert.equal(await p.locator('.rw-stmt[data-card="UOB PRVI Miles"] input').inputValue(), String(app + 1234));
    // statement ต่ำกว่าแอป 500
    await p.locator('.rw-stmt[data-card="UOB PRVI Miles"] input').fill(String(app - 500)); await p.locator('.rw-stmt[data-card="UOB PRVI Miles"] input').dispatchEvent('change'); await p.waitForTimeout(150);
    assert.match(await p.locator('.rw-stmt[data-card="UOB PRVI Miles"] .rw-stmt-res').innerText(), /แอปสูงกว่า statement ฿500/);
    // ตรงกัน (ต่างไม่ถึง ฿1)
    await p.locator('.rw-stmt[data-card="UOB PRVI Miles"] input').fill(String(app + 0.4)); await p.locator('.rw-stmt[data-card="UOB PRVI Miles"] input').dispatchEvent('change'); await p.waitForTimeout(150);
    assert.match(await p.locator('.rw-stmt[data-card="UOB PRVI Miles"] .rw-stmt-res').innerText(), /ตรงกับยอดในแอป/);
    // แตะ "ใส่ยอดจริง" → เปิดฟอร์มแก้ไขรายการนั้น
    await p.locator('.rw-stmt[data-card="UOB PRVI Miles"] .rw-stmt-est button').click(); await p.waitForTimeout(150);
    assert.equal(await p.evaluate(() => billState.editingId), 'st2');
    await p.evaluate(() => billCloseConfirm());
    // ใส่ยอดจริงแล้วรายการหลุดจากรายการ "ประมาณ"
    await p.evaluate(() => { const t = state.transactions.find(x => x.id === 'st2'); t.thbActual = true; billRender(); });
    assert.equal(await p.locator('.rw-stmt[data-card="UOB PRVI Miles"] .rw-stmt-est').count(), 0);
    // ล้างค่า (ช่องว่าง) → เอาออกจาก storage
    await p.locator('.rw-stmt[data-card="UOB PRVI Miles"] input').fill(''); await p.locator('.rw-stmt[data-card="UOB PRVI Miles"] input').dispatchEvent('change'); await p.waitForTimeout(150);
    assert.equal(await p.evaluate(() => localStorage.getItem('folio_bill_statements')), '{}');
  } finally { await p.evaluate(() => { window.todayISO = window._rt; state.transactions = state.transactions.filter(t => !/^st[12]$/.test(t.id)); localStorage.removeItem('folio_bill_statements'); billRender(); }); }
});

// ───────── เฟส 6c ─────────
const NOTE_WEIRD = 'มี, จุลภาค "คำพูด"\nและบรรทัดใหม่';
const csvKeys = (p, arr) => p.evaluate(a => a.map(t => [t.date, t.time || '', t.type, t.category, t.merchant || '', t.amount, t.currency, Math.round(billAmtThb(t) * 100) / 100, t.payMethod || 'unknown', t.card || '', t.ref || '', t.note || ''].join('|')).sort(), arr);
test('เฟส6c: นำเข้า CSV — ส่งออกแล้วนำเข้ากลับได้ครบทุกฟิลด์ (รวมต่างประเทศ ยอดบาท โน้ตที่มีจุลภาค/คำพูด/บรรทัดใหม่)', async p => {
  const orig = await p.evaluate(note => {
    const y = todayISO(); const mk = (o) => Object.assign({ date: y, type: 'expense', category: 'food', amount: 100, currency: 'THB', fxToThb: 1, merchant: 'ร้าน', payMethod: 'cash', card: '', time: '', ref: '', note: '' }, o);
    state.transactions = [mk({ id: 'c1', merchant: 'ข้าวมันไก่', amount: 65, note, time: '12:34' }), mk({ id: 'c2', type: 'income', category: 'salary', amount: 85000, merchant: 'บริษัท', payMethod: 'transfer' }),
      mk({ id: 'c3', category: 'travel', amount: 120, currency: 'USD', fxToThb: 34.5, amountThb: 4140, thbActual: true, merchant: 'Agoda', payMethod: 'card', card: 'UOB PRVI Miles' }),
      mk({ id: 'c4', category: 'shopping', amount: 1890.5, merchant: 'Shopee', payMethod: 'ewallet', ref: 'RF-123' }), mk({ id: 'c5', category: 'cc_payment', amount: 5000, merchant: 'จ่ายบัตร', payMethod: 'transfer', card: 'KBank THE PASSION' }),
      mk({ id: 'c6', type: 'income', category: 'refund', amount: 50, merchant: 'เพื่อนคืน', payMethod: 'transfer', offsetCat: 'food' })];
    return state.transactions.map(t => ({ ...t }));
  }, NOTE_WEIRD);
  const csv = await p.evaluate(() => billCsvText(state.transactions));
  await p.evaluate(() => { state.transactions = []; billRender(); });
  const r = await p.evaluate(c => billImportCsvText(c), csv);
  assert.deepEqual([r.shown, r.dupRef, r.beyondCap, r.skipped], [6, 0, 0, 0]);
  assert.equal(await p.textContent('#billConfirmTitle'), 'ตรวจสอบ 6 รายการก่อนบันทึก');
  assert.ok((await p.textContent('#billConfirmNote')).includes('นำเข้าจาก CSV'));
  assert.equal(await p.locator('#billDrafts input[type=checkbox]:checked').count(), 6);
  await p.click('#billSaveBtn'); await p.waitForTimeout(300);
  const got = await p.evaluate(() => state.transactions.map(t => ({ ...t })));
  assert.deepEqual(await csvKeys(p, got), await csvKeys(p, orig));
  const fx = got.find(t => t.merchant === 'Agoda'); assert.deepEqual([fx.amountThb, fx.thbActual, fx.currency], [4140, true, 'USD']);
  assert.ok(got.every(t => t.source === 'csv'));
  assert.equal(got.find(t => t.category === 'refund').offsetCat, 'other');
  await p.evaluate(() => { state.transactions = []; });
});
test('เฟส6c: ระบบกันซ้ำเดิม — เลขอ้างอิงซ้ำถูกข้าม, วัน+ยอดตรงกับของเดิมแสดงแต่ไม่ติ๊กให้, ติ๊กเองได้', async p => {
  const csv = await p.evaluate(() => {
    const y = todayISO(); const mk = (o) => Object.assign({ date: y, type: 'expense', category: 'food', amount: 100, currency: 'THB', fxToThb: 1, merchant: 'ร้าน', payMethod: 'cash' }, o);
    state.transactions = [mk({ id: 'd1', amount: 321, refKey: 'XYZ1', ref: 'XYZ1' }), mk({ id: 'd2', amount: 222 }), mk({ id: 'd3', amount: 333, merchant: 'อื่น' })];
    const c = billCsvText(state.transactions); state.transactions.push(mk({ id: 'd4', amount: 999 })); return c;   // d4 มีแต่ไม่อยู่ในไฟล์
  });
  const r = await p.evaluate(c => billImportCsvText(c), csv);
  assert.equal(r.dupRef, 1);                                   // d1 (มีเลขอ้างอิง) ถูกข้ามเงียบ ๆ
  assert.equal(r.shown, 2);                                    // d2, d3 วัน+ยอดตรงกับของเดิม → แสดงไว้
  assert.equal(await p.locator('#billDrafts input[type=checkbox]:checked').count(), 0, 'รายการที่อาจซ้ำต้องไม่ติ๊กให้');
  assert.match(await p.textContent('#billConfirmNote'), /ข้ามที่ซ้ำแน่นอน 1.*ไม่ติ๊กให้/);
  assert.equal(await p.locator('#billSaveBtn').isDisabled(), true);
  await p.evaluate(() => billCloseConfirm());
  await p.evaluate(c => billImportCsvText(c), csv);
  await p.locator('#billDrafts input[type=checkbox]').first().check();
  await p.click('#billSaveBtn'); await p.waitForTimeout(250);
  assert.equal(await p.evaluate(() => state.transactions.length), 5);   // เดิม 4 + ที่ติ๊กเอง 1
  await p.evaluate(() => { state.transactions = []; });
});
test('เฟส6c: ไฟล์ผิดรูปแบบ/ว่าง/แถวเสีย + ตัวคั่น ; และวันที่ พ.ศ. + จำกัด 100 รายการต่อครั้งแล้วนำเข้าซ้ำรับส่วนที่เหลือ', async p => {
  const toast = () => p.evaluate(() => document.getElementById('toast').textContent);
  let r = await p.evaluate(() => billImportCsvText('a,b\n1,2'));
  assert.match(r.error, /ไม่ใช่ไฟล์ที่ส่งออกจากแอปนี้/); assert.match(await toast(), /ไม่ใช่ไฟล์ที่ส่งออกจากแอปนี้/);
  assert.equal(await p.evaluate(() => document.getElementById('bill-confirm-modal').classList.contains('open')), false);
  r = await p.evaluate(() => billImportCsvText('วันที่,ประเภท,ยอด\nxx,รายจ่าย,5\n2026-01-01,รายจ่าย,0'));
  assert.equal(r.error, 'empty'); assert.match(await toast(), /ไม่พบรายการที่อ่านได้.*ข้าม 2/);
  r = await p.evaluate(() => billImportCsvText('วันที่;ประเภท;ยอด;ร้าน/ผู้รับ\n02/11/2569;รายจ่าย;1,250.75;ร้านทดสอบ'));
  assert.equal(r.shown, 1);
  assert.deepEqual(await p.evaluate(() => { const d = billState.drafts[0]; return [d.date, d.amount, d.merchant, d.category, d.source]; }), ['2026-11-02', 1250.75, 'ร้านทดสอบ', 'other', 'csv']);
  await p.evaluate(() => billCloseConfirm());
  const big = await p.evaluate(() => 'วันที่,ประเภท,หมวด,ร้าน/ผู้รับ,ยอด\n' + Array.from({ length: 130 }, (_, i) => `2026-03-${String(1 + i % 28).padStart(2, '0')},รายจ่าย,อาหาร/เครื่องดื่ม,ร้าน${i},${10 + i}`).join('\n'));
  r = await p.evaluate(c => billImportCsvText(c), big);
  assert.deepEqual([r.shown, r.beyondCap], [100, 30]);
  assert.match(await p.textContent('#billConfirmNote'), /ยังเหลืออีก 30/);
  await p.click('#billSaveBtn'); await p.waitForTimeout(600);
  assert.equal(await p.evaluate(() => state.transactions.length), 100);
  r = await p.evaluate(c => billImportCsvText(c), big);   // รอบสอง
  assert.equal(r.shown, 100);
  assert.equal(await p.locator('#billDrafts input[type=checkbox]:checked').count(), 30, 'ส่วนที่เหลือ 30 รายการติ๊กให้ ที่วัน+ยอดตรงกับของเดิมไม่ติ๊ก');
  await p.evaluate(() => { billCloseConfirm(); state.transactions = []; });
});
test('เฟส6c: ปุ่ม "นำเข้า CSV" ในตั้งค่า รับไฟล์จริงผ่าน input แล้วเปิดหน้าตรวจสอบ', async p => {
  await p.evaluate(() => showPage('settings'));
  assert.equal(await p.locator('#settingsBill button', { hasText: 'นำเข้า CSV' }).count(), 1);
  await p.setInputFiles('#billCsvInput', { name: 'folio-bills.csv', mimeType: 'text/csv', buffer: Buffer.from('﻿วันที่,เวลา,ประเภท,หมวด,ร้าน/ผู้รับ,ยอด,สกุลเงิน\n2026-05-05,08:00,รายจ่าย,อาหาร/เครื่องดื่ม,กาแฟ,60,THB\n', 'utf8') });
  await p.waitForFunction(() => document.getElementById('bill-confirm-modal').classList.contains('open'), null, { timeout: 3000 });
  assert.equal(await p.inputValue('#billAmt0'), '60');
  await p.evaluate(() => billCloseConfirm());
});

// ───────── เฟส 6d ─────────
const alertReset = p => p.evaluate(() => { state.transactions = []; state.budgetExpenses = []; state.subscriptions = []; localStorage.removeItem('folio_alerts_dismissed'); showPage('overview'); });
const alertTexts = p => p.locator('#alertBar .alert-item .al-txt').allInnerTexts();
const mkTx = (p, o) => p.evaluate(o => { state.transactions.push(Object.assign({ id: 'al' + state.transactions.length, date: todayISO(), type: 'expense', category: 'food', amount: 100, currency: 'THB', fxToThb: 1, amountThb: o.amount || 100, merchant: 'x', payMethod: 'cash' }, o)); renderAlerts(); }, o);
test('เฟส6d: ไม่มีเรื่องให้เตือน = ไม่แสดงแถบ', async p => { await alertReset(p); assert.equal(await vis(p, '#alertBar'), false); });
test('เฟส6d: งบหมวด — เงียบที่ 84.9% เตือนที่ 85% (เหลือง) เกินงบ (แดง) และเงินคืนที่หักหมวดทำให้กลับต่ำกว่าเกณฑ์', async p => {
  await alertReset(p);
  await p.evaluate(() => { state.budgetExpenses = [{ billCat: 'food', amount: 1000 }]; });
  await mkTx(p, { amount: 849 }); assert.equal(await vis(p, '#alertBar'), false, '84.9% ต้องเงียบ');
  await mkTx(p, { amount: 1, id: 'al_x' }); let t = await alertTexts(p);
  assert.equal(t.length, 1); assert.match(t[0], /ใกล้เต็ม.*ใช้ไป 85%.*฿850 \/ ฿1,000/);
  assert.equal(await p.locator('#alertBar .alert-item.danger').count(), 0);
  await mkTx(p, { amount: 150, id: 'al_y' }); t = await alertTexts(p);
  assert.match(t[0], /เกินงบแล้ว.*100%/); assert.equal(await p.locator('#alertBar .alert-item.danger').count(), 1);
  await p.evaluate(() => { state.transactions.push({ id: 'rf', date: todayISO(), type: 'income', category: 'refund', offsetCat: 'food', amount: 300, currency: 'THB', fxToThb: 1, amountThb: 300, merchant: 'คืน', payMethod: 'transfer' }); renderAlerts(); });
  assert.equal(await vis(p, '#alertBar'), false, 'หักเงินคืนแล้ว 700/1000 ต้องเงียบ');
  // งบหลายรายการในหมวดเดียวกันรวมกัน · เดือนอื่นไม่นับ
  await p.evaluate(() => { state.budgetExpenses = [{ billCat: 'food', amount: 500 }, { billCat: 'food', amount: 500 }]; state.transactions.push({ id: 'old', date: '2020-01-01', type: 'expense', category: 'food', amount: 99999, currency: 'THB', fxToThb: 1, amountThb: 99999, merchant: 'เก่า', payMethod: 'cash' }); renderAlerts(); });
  assert.equal(await vis(p, '#alertBar'), false);
});
test('เฟส6d: Subscription จะตัดใน 3 วัน (วันนี้/อีก N วัน) — ไกลกว่า 3 วัน/ยกเลิกแล้ว/รอบที่ลงแล้ว ไม่เตือน', async p => {
  await alertReset(p);
  const sub = (o) => p.evaluate(o => { state.subscriptions = [Object.assign({ id: 'sx', name: 'Netflix', amount: 419, amountThb: 419, active: true, cycle: 'monthly', lastNo: 0, card: 'UOB PRVI Miles' }, o)]; renderAlerts(); }, o);
  const plus = n => p.evaluate(n => billIsoAdd(todayISO(), n), n);
  await sub({ startDate: await plus(2) }); assert.match((await alertTexts(p))[0], /Netflix จะตัด ฿419 อีก 2 วัน · UOB PRVI Miles/);
  await sub({ startDate: await plus(0) }); assert.match((await alertTexts(p))[0], /วันนี้/);
  await sub({ startDate: await plus(4) }); assert.equal(await vis(p, '#alertBar'), false);
  await sub({ startDate: await plus(2), active: false }); assert.equal(await vis(p, '#alertBar'), false);
  // รอบแรกผ่านไปแล้ว (lastNo=1) → ดูรอบถัดไปอีกเดือน ไม่เตือนรอบที่ตัดไปแล้ว
  await sub({ startDate: await plus(-2), lastNo: 1 }); assert.equal(await vis(p, '#alertBar'), false);
  await sub({ startDate: await p.evaluate(() => billInstDate(billIsoAdd(todayISO(), 2), -1)), lastNo: 1 }); assert.match((await alertTexts(p))[0], /อีก 2 วัน/);
});
test('เฟส6d: บัตรครบกำหนดใน 3 วัน (เหลือง) เลยกำหนด (แดง) และหายเมื่อจ่ายบิลครบ', async p => {
  await alertReset(p);
  const cyc = await p.evaluate(() => { window._rt = window.todayISO; window.todayISO = () => '2026-11-20'; const prof = billRwCards().find(c => c.card === 'UOB PRVI Miles'); const cur = billRwCycle(prof.stmtDay, todayISO()); const closed = billRwCycle(prof.stmtDay, billIsoAdd(cur.start, -1)); return { end: closed.end, due: billRwDue(closed.end, prof.dueDay) }; });
  try {
    await p.evaluate(c => { state.transactions = [{ id: 'cc1', date: c.end, type: 'expense', category: 'shopping', amount: 4200, currency: 'THB', fxToThb: 1, amountThb: 4200, merchant: 'ห้าง', payMethod: 'card', card: 'UOB PRVI Miles' }]; }, cyc);
    const at = async d => { await p.evaluate(x => { window.todayISO = () => x; renderAlerts(); }, d); return alertTexts(p); };
    const plus = d => p.evaluate(([a, n]) => billIsoAdd(a, n), [cyc.due, d]);
    assert.equal((await at(await plus(-4))).length, 0, 'ยังเหลือ 4 วัน ต้องเงียบ');
    let t = await at(await plus(-3)); assert.match(t[0], /UOB PRVI Miles ครบกำหนดชำระอีก 3 วัน · ยอด ฿4,200/); assert.equal(await p.locator('#alertBar .alert-item.danger').count(), 0);
    t = await at(cyc.due); assert.match(t[0], /ครบกำหนดชำระวันนี้/);
    t = await at(await plus(2)); assert.match(t[0], /เลยกำหนดชำระ 2 วัน/); assert.equal(await p.locator('#alertBar .alert-item.danger').count(), 1);
    await p.evaluate(c => { state.transactions.push({ id: 'pay', date: billIsoAdd(c.end, 3), type: 'expense', category: 'cc_payment', amount: 4200, currency: 'THB', fxToThb: 1, amountThb: 4200, merchant: 'จ่ายบัตร', payMethod: 'transfer', card: 'UOB PRVI Miles' }); }, cyc);
    t = await at(await plus(-1)); assert.equal(t.length, 0, 'จ่ายครบแล้วต้องไม่เตือน');
  } finally { await p.evaluate(() => { window.todayISO = window._rt; }); }
});
test('เฟส6d: กด ✕ ซ่อนเรื่องนั้นไปจนสิ้นวัน (วันถัดไปกลับมา) · เรียงแดงก่อน · แสดงสูงสุด 5 + "และอีก N เรื่อง" · แตะแล้วไปแท็บที่เกี่ยวข้อง', async p => {
  await alertReset(p);
  await p.evaluate(() => {
    const y = todayISO(); state.budgetExpenses = ['food', 'shopping', 'transport', 'travel', 'health', 'housing'].map(k => ({ billCat: k, amount: 100 }));
    state.transactions = ['food', 'shopping', 'transport', 'travel', 'health', 'housing'].map((k, i) => ({ id: 'm' + i, date: y, type: 'expense', category: k, amount: 90 + i * 5, currency: 'THB', fxToThb: 1, amountThb: 90 + i * 5, merchant: 'x', payMethod: 'cash' }));
    state.subscriptions = [{ id: 'sx', name: 'Spotify', amount: 99, amountThb: 99, active: true, cycle: 'monthly', lastNo: 0, startDate: billIsoAdd(y, 1) }]; renderAlerts();
  });
  // 6 งบ (90..115%) + 1 sub = 7 เรื่อง → แสดง 5
  assert.equal(await p.locator('#alertBar .alert-item').count(), 5);
  assert.match(await p.textContent('#alertBar'), /และอีก 2 เรื่อง/);
  const first = await p.locator('#alertBar .alert-item').first().getAttribute('class'); assert.match(first, /danger/, 'แดง (เกินงบ) ต้องมาก่อน');
  const key = await p.locator('#alertBar .alert-item').first().getAttribute('data-key');
  await p.locator('#alertBar .alert-item').first().locator('button').click();
  assert.notEqual(await p.locator('#alertBar .alert-item').first().getAttribute('data-key'), key);
  assert.equal(await p.evaluate(k => JSON.parse(localStorage.getItem('folio_alerts_dismissed'))[k], key), await p.evaluate(() => todayISO()));
  await p.evaluate(() => renderAlerts()); assert.ok(!(await p.locator('#alertBar .alert-item').evaluateAll((els, k) => els.some(e => e.dataset.key === k), key)), 'ต้องไม่กลับมาในวันเดียวกัน');
  // ซ่อนแล้ววันถัดไปกลับมา — ใช้เรื่อง Subscription (key ผูกกับวันตัดรอบ ไม่ขึ้นกับเดือน จึงไม่เพี้ยนข้ามเดือน)
  await p.evaluate(() => { state.budgetExpenses = []; state.transactions = []; state.subscriptions = [{ id: 'sd', name: 'Disney', amount: 199, amountThb: 199, active: true, cycle: 'monthly', lastNo: 0, startDate: billIsoAdd(todayISO(), 2) }]; localStorage.removeItem('folio_alerts_dismissed'); renderAlerts(); });
  await p.locator('#alertBar .alert-item .al-x').click(); assert.equal(await vis(p, '#alertBar'), false);
  await p.evaluate(() => { window._rt = window.todayISO; const t = todayISO(); window.todayISO = () => billIsoAdd(t, 1); renderAlerts(); });
  try { assert.match((await alertTexts(p))[0] || '', /Disney จะตัด ฿199 อีก 1 วัน/); } finally { await p.evaluate(() => { window.todayISO = window._rt; renderAlerts(); }); }
  // แตะแล้วไปแท็บที่เกี่ยวข้อง
  await p.evaluate(() => { state.budgetExpenses = []; state.transactions = []; state.subscriptions = [{ id: 'sx', name: 'Spotify', amount: 99, amountThb: 99, active: true, cycle: 'monthly', lastNo: 0, startDate: billIsoAdd(todayISO(), 1) }]; renderAlerts(); });
  await p.locator('#alertBar .alert-item').first().locator('.al-txt').click();
  assert.deepEqual(await p.evaluate(() => [document.getElementById('page-bills').classList.contains('active'), billState.tab]), [true, 'recur']);
  await p.evaluate(() => { state.budgetExpenses = [{ billCat: 'food', amount: 100 }]; state.transactions = [{ id: 'z', date: todayISO(), type: 'expense', category: 'food', amount: 95, currency: 'THB', fxToThb: 1, amountThb: 95, merchant: 'x', payMethod: 'cash' }]; state.subscriptions = []; showPage('overview'); });
  await p.locator('#alertBar .alert-item').first().locator('.al-txt').click();
  assert.deepEqual(await p.evaluate(() => [document.getElementById('page-bills').classList.contains('active'), billState.tab]), [true, 'budget']);
});
test('เฟส6d: แถบอยู่บนสุดของหน้าแรก (เหนือการ์ดสรุป) และกดปุ่ม ✕ ได้ง่าย (≥44px)', async p => {
  await alertReset(p);
  await p.evaluate(() => { state.budgetExpenses = [{ billCat: 'food', amount: 100 }]; state.transactions = [{ id: 'z', date: todayISO(), type: 'expense', category: 'food', amount: 99, currency: 'THB', fxToThb: 1, amountThb: 99, merchant: 'x', payMethod: 'cash' }]; showPage('overview'); });
  const a = await rect(p, '#alertBar'), hero = await rect(p, '#page-overview .hero-grid');
  assert.ok(a.b <= hero.y + 1 && a.y < 200, 'bar y=' + a.y);
  const x = await rect(p, '#alertBar .al-x'); assert.ok(x.h >= 44 && x.w >= 44);
  await p.evaluate(() => { state.budgetExpenses = []; state.transactions = []; renderAlerts(); });
});

(async () => {
  const { b, p, errors } = await lib.open();
  for (const [name, fn] of tests) {
    try { await fn(p); passed++; console.log('PASS', name); }
    catch (e) { failed++; console.log('FAIL', name, '\n   ', String(e.message).split('\n').slice(0, 4).join('\n    ')); }
  }
  await b.close();
  // ───────── เฟส 6a: ออฟไลน์ (ใช้ window.FB ของจริงกับ Firebase SDK จำลอง) ─────────
  {
    const D = 'users/nattapat/';
    const seedTx = (id, o) => [D + 'transactions/' + id, Object.assign({ date: new Date().toISOString().slice(0, 7) + '-02', type: 'expense', category: 'food', amount: 100, currency: 'THB', fxToThb: 1, amountThb: 100, merchant: 'ร้านเดิม', payMethod: 'cash', createdAt: { seconds: 1 } }, o)];
    const docs = Object.fromEntries([seedTx('t1', {}), seedTx('t2', { amount: 250, amountThb: 250, merchant: 'อีกร้าน' })]);
    const f = await lib.open(null, '', { fake: docs });
    const fp = f.p, ctx = fp.context();
    const sub = async (name, fn) => { try { await fn(); passed++; console.log('PASS เฟส6a:', name); } catch (e) { failed++; console.log('FAIL เฟส6a:', name, '\n   ', String(e.message).split('\n').slice(0, 5).join('\n    ')); } };
    const toast = () => fp.evaluate(() => document.getElementById('toast').textContent);
    const modalClosed = id => fp.waitForFunction(i => !document.getElementById(i).classList.contains('open'), id, { timeout: 1500 });
    const goOffline = async v => { await fp.evaluate(x => { window.__fs.offline = x; }, v); await ctx.setOffline(v); await fp.waitForTimeout(100); };
    const nDocs = col => fp.evaluate(c => Object.keys(window.__fs.docs).filter(k => k.startsWith('users/nattapat/' + c + '/')).length, col);
    const saveManual = async (amount, opts) => {
      await fp.evaluate(() => { showPage('bills'); billSetTab('list'); billOpenManual(); }); await fp.waitForTimeout(120);
      await fp.keyboard.type(String(amount));
      await fp.locator('.bill-cat-tile', { hasText: 'อาหาร' }).first().click();
      await fp.locator('.bill-pay-chip', { hasText: 'เงินสด' }).click();
      if (opts && opts.ref) { await fp.locator('summary', { hasText: 'เพิ่มเติม' }).click(); await fp.locator('#billDrafts input[placeholder="ถ้ามี"]').fill(opts.ref); await fp.dispatchEvent('#billDrafts input[placeholder="ถ้ามี"]', 'change'); }
      const t0 = Date.now(); await fp.click('#billSaveBtn'); await modalClosed('bill-confirm-modal'); return Date.now() - t0;
    };
    await fp.waitForTimeout(500);
    await sub('เปิด persistent cache (หลายแท็บ) และโหลดข้อมูลผ่าน listener', async () => {
      const o = await fp.evaluate(() => window.__fs.initOpts);
      assert.equal(o.localCache.kind, 'persistent'); assert.equal(o.localCache.opts.tabManager.kind, 'multiTab');
      assert.equal(await fp.evaluate(() => !!window.FB && state.transactions.length), 2);
    });
    await sub('ออนไลน์: บันทึกรายการแล้วเอกสารขึ้น Firestore และ listener อัปเดต', async () => {
      localStorageSetup: await fp.evaluate(() => localStorage.setItem('folio_bill_cards', 'UOB PRVI Miles'));
      await saveManual(321); assert.equal(await nDocs('transactions'), 3);
      assert.equal(await fp.evaluate(() => state.transactions.some(t => t.amount === 321)), true);
    });
    await goOffline(true);
    await sub('ป้ายออฟไลน์แสดงเมื่อไม่มีเน็ต', async () => { assert.equal(await vis(fp, '#offlineBadge'), true); });
    await sub('ออฟไลน์: บันทึกแล้วปิดฟอร์มทันที (ไม่รอ server) และรายการขึ้นในเครื่อง', async () => {
      const ms = await saveManual(555); console.log('   ปิดฟอร์มภายใน', ms, 'ms');
      assert.ok(ms < 1500);
      assert.equal(await fp.evaluate(() => state.transactions.some(t => t.amount === 555)), true);
      assert.match(await toast(), /บันทึก 1 รายการ/);
      assert.equal(await fp.evaluate(() => window.__fs.log.filter(l => l.offline && l.op === 'set').length >= 1), true);
    });
    await sub('ออฟไลน์: บันทึกพร้อมเลขอ้างอิง (ต้องอ่านเอกสารเดิมตอนไม่มีเน็ต) ไม่ error และกันซ้ำได้', async () => {
      await saveManual(777, { ref: 'REF-001' });
      assert.ok(!/ไม่สำเร็จ/.test(await toast()), await toast());
      assert.equal(await fp.evaluate(() => !!window.__fs.docs['users/nattapat/transactions/ref_REF001']), true);
      // สลิปซ้ำ: ฟอร์มเตือนและยกเลิกติ๊กให้เอง (ตรวจจากข้อมูลในเครื่อง) · ชั้นกันซ้ำตอนเขียน (billPutByRef) อ่านจากข้อมูลในเครื่องก่อน จึงไม่ต้องถามเซิร์ฟเวอร์
      await fp.evaluate(() => billOpenConfirm([billNewDraft({ amount: 777, ref: 'REF-001', source: 'upload' })], ''));
      assert.match(await fp.locator('.bill-warn').first().innerText(), /เลขอ้างอิงนี้บันทึกไปแล้ว/);
      assert.equal(await fp.evaluate(() => billState.drafts[0].include), false);
      await fp.evaluate(() => billCloseConfirm());
      const r = await fp.evaluate(async () => [await billPutByRef('REF001', { amount: 777, currency: 'THB' }), await billPutByRef('REF002', { amount: 5, currency: 'THB' })]);
      assert.deepEqual(r, [false, true]);
      assert.equal(await fp.evaluate(() => Object.keys(window.__fs.docs).filter(k => k.includes('ref_REF001')).length), 1);
    });
    await sub('ออฟไลน์: แก้ไขรายการแล้วปิดฟอร์มทันที', async () => {
      await fp.evaluate(() => billEdit('t1')); await fp.fill('#billAmt0', '888'); await fp.dispatchEvent('#billAmt0', 'input');
      await fp.click('#billSaveBtn'); await modalClosed('bill-confirm-modal');
      assert.equal(await fp.evaluate(() => state.transactions.find(t => t.id === 't1').amount), 888);
    });
    await sub('ออฟไลน์: ลบแล้วเลิกทำ (คืน id เดิม)', async () => {
      await fp.evaluate(() => billEdit('t2')); await fp.locator('#billDrafts button', { hasText: 'ลบรายการนี้' }).click(); await modalClosed('bill-confirm-modal');
      assert.equal(await fp.evaluate(() => state.transactions.some(t => t.id === 't2')), false);
      await fp.click('#billUndoBtn'); await fp.waitForTimeout(150);
      assert.equal(await fp.evaluate(() => state.transactions.some(t => t.id === 't2' && t.amount === 250)), true);
    });
    await sub('ออฟไลน์: ผ่อน 3 งวด และ Subscription ปิดฟอร์มทันที', async () => {
      const n0 = await nDocs('transactions');
      await fp.evaluate(() => { billOpenManual(); const d = billState.drafts[0]; d.amount = 900; d.merchant = 'ผ่อนของ'; billDraftSet(0, 'plan', 'inst', true); billDraftSet(0, 'instMonths', 3); });
      await fp.click('#billSaveBtn'); await modalClosed('bill-confirm-modal');
      assert.equal(await nDocs('transactions'), n0 + 3);
      await fp.evaluate(() => { billOpenManualSub(); const d = billState.drafts[0]; d.amount = 99; d.merchant = 'ThaiSub'; d.date = todayISO(); billDraftSet(0, 'plan', 'sub', true); });
      await fp.click('#billSaveBtn'); await modalClosed('bill-confirm-modal');
      assert.equal(await nDocs('subscriptions'), 1);
    });
    await sub('ออฟไลน์: ตั้งงบ/เป้าออมปิด modal ทันที', async () => {
      await fp.evaluate(() => { showPage('budget'); budgetOpenExpense(); }); await fp.selectOption('#exp-billcat', 'transport'); await fp.fill('#exp-amount', '2000');
      await fp.click('#expense-modal .btn-primary'); await modalClosed('expense-modal');
      assert.equal(await nDocs('budget_expenses'), 1);
      await fp.evaluate(() => openModal('saving-modal')); await fp.fill('#sav-name', 'ออมออฟไลน์'); await fp.fill('#sav-target', '5000');
      await fp.click('#saving-modal .btn-primary'); await modalClosed('saving-modal');
      assert.equal(await nDocs('budget_savings'), 1);
    });
    await sub('ออฟไลน์: FB.get/exists ของเอกสารที่ไม่มีใน cache คืน null/false แทน throw', async () => {
      assert.deepEqual(await fp.evaluate(async () => [await FB.get('transactions', 'nope'), await FB.exists('transactions', 'nope'), await FB.exists('transactions', 't1')]), [null, false, true]);
    });
    await goOffline(false);
    await sub('กลับมาออนไลน์: ป้ายหาย', async () => { assert.equal(await vis(fp, '#offlineBadge'), false); });
    await sub('ออนไลน์ที่เซิร์ฟเวอร์ปฏิเสธการเขียน: ผู้ใช้เห็น toast แจ้งเตือน', async () => {
      await fp.evaluate(() => { window.__fs.failNext = 'permission-denied'; });
      await saveManual(42); await fp.waitForTimeout(1100);
      assert.match(await toast(), /ซิงก์ขึ้นคลาวด์ไม่สำเร็จ.*permission-denied/);
    });
    await sub('6b: statements ขึ้น settings/bill (replace ทั้งเอกสารต้องไม่ทำคีย์อื่นหาย) และโหลดกลับจาก cloud', async () => {
      await fp.evaluate(() => { localStorage.setItem('folio_bill_cards', 'UOB PRVI Miles'); window._billSettingsLoaded = true; billStatementSet('UOB PRVI Miles', '2026-10-27', '12345.5'); });
      const d = await fp.evaluate(() => window.__fs.docs['users/nattapat/settings/bill']);
      assert.deepEqual(d.statements, { 'UOB PRVI Miles': { '2026-10-27': 12345.5 } });
      assert.deepEqual(d.cards, ['UOB PRVI Miles']);
      await fp.evaluate(() => { localStorage.removeItem('folio_bill_statements'); window.__fs.docs['users/nattapat/settings/bill'].statements = { KTC: { '2026-09-01': 99 } }; window._billSettingsLoaded = false; window._billSettingsLoading = false; localStorage.removeItem('folio_bill_settings_dirty'); return billLoadSettings(); });
      assert.deepEqual(await fp.evaluate(() => JSON.parse(localStorage.getItem('folio_bill_statements'))), { KTC: { '2026-09-01': 99 } });
    });
    if (f.errors.length) { failed++; console.log('FAIL เฟส6a: มี JS error', f.errors.join(' | ')); }
    await f.b.close();
  }
  // ───────── เฟส 8: เปิดแอปออฟไลน์จาก service worker หลังโหลดครั้งแรก (เซิร์ฟเวอร์ภายในเครื่องที่ /Folio/ + SW จริง) ─────────
  {
    const http = require('http'), fsx = require('fs'), pth = require('path'), { chromium } = require('playwright');
    const root = pth.resolve(__dirname, '..');
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(req.url.split('?')[0]); if (!u.startsWith('/Folio/')) { res.writeHead(404); return res.end(); }
      const fp = pth.join(root, u.slice('/Folio/'.length) || 'index.html');
      if (!fp.startsWith(root) || !fsx.existsSync(fp) || fsx.statSync(fp).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': mime[pth.extname(fp)] || 'application/octet-stream' }); fsx.createReadStream(fp).pipe(res);
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + srv.address().port + '/Folio/';
    const br = await chromium.launch(); const ctx = await br.newContext({ viewport: { width: 390, height: 844 } });
    const pg = await ctx.newPage();
    await pg.route('**/*', r => r.request().url().startsWith(base.slice(0, base.indexOf('/Folio/'))) ? r.continue() : r.abort());
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    try {
      await pg.goto(base); await pg.evaluate(() => navigator.serviceWorker.ready);
      await pg.waitForFunction(async () => { const ks = await caches.keys(); const k = ks.find(x => /^folio-v\d+$/.test(x)); return !!k && (await (await caches.open(k)).keys()).length >= 10; }, null, { timeout: 15000 });
      await ctx.setOffline(true);
      await pg.reload({ waitUntil: 'load' }); await pg.waitForTimeout(800);
      const probe = await pg.evaluate(() => ({
        fns: ['billTotals', 'renderHoldings', 'callGemini', 'billRwRender', 'billRender', 'sgOnShowSignals', 'aihAsk'].map(n => typeof window[n]),
        css: getComputedStyle(document.querySelector('.topbar')).position, st: typeof state, pages: document.querySelectorAll('.page').length, online: navigator.onLine }));
      assert.equal(probe.online, false);
      assert.deepEqual(probe.fns, Array(7).fill('function'));
      assert.equal(probe.css, 'sticky'); assert.equal(probe.st, 'object'); assert.ok(probe.pages >= 5);
      // เปิดหน้าบิลและทำงานได้ตามปกติ (ข้อมูลในเครื่อง)
      await pg.evaluate(() => { showPage('bills'); billSetTab('overview'); }); await pg.waitForTimeout(200);
      assert.equal(await pg.evaluate(() => document.getElementById('page-bills').classList.contains('active')), true);
      const jsErr = errs.filter(e => !/module|import|fetch|Firebase|firebase/i.test(e));
      assert.deepEqual(jsErr, [], 'JS error ตอนออฟไลน์');
      passed++; console.log('PASS เฟส8: ออฟไลน์หลังโหลดครั้งแรก — ไฟล์ css/js ทั้ง 8 ไฟล์โหลดจาก service worker cache แอปเปิดและใช้งานได้');
    } catch (e) { failed++; console.log('FAIL เฟส8: ออฟไลน์', String(e.message).split('\n').slice(0, 5).join('\n    '), errs.slice(0, 3)); }
    await br.close(); srv.close();
  }
  // อันดับบัตรต้องตรงกับโหมด "คุ้มสุด" เดิม (ไฟล์อ้างอิงถ่ายจากโค้ดก่อนเฟส 5) แม้ผู้ใช้เคยตั้งโหมดอื่นไว้
  {
    const f = await lib.open();
    try {
      const want = JSON.parse(require('fs').readFileSync(require('path').resolve(__dirname, '..', 'tests', 'fixtures', 'rw-rank.json'), 'utf8'));
      for (const stored of [null, 'baht', 'rop', 'raw']) {
        await f.p.evaluate(m => { m ? localStorage.setItem('folio_bill_rw_mode2', m) : localStorage.removeItem('folio_bill_rw_mode2'); }, stored);
        const got = await require('./rw-snapshot.js').snapshot(f.p);
        assert.deepEqual(got, want, 'อันดับ/คะแนนบัตรเปลี่ยนไปเมื่อค่าโหมดเดิมที่เก็บไว้ = ' + stored);
      }
      passed++; console.log('PASS เฟส5: อันดับและคะแนนบัตร (13 กรณี × ทุกบัตร) ตรงกับโหมด "คุ้มสุด" เดิมทุกตัวเลข แม้ค่าโหมดเดิมที่เก็บไว้เป็น baht/rop/raw');
    } catch (e) { failed++; console.log('FAIL เฟส5: อันดับบัตรต่างจากเดิม', String(e.message).split('\n').slice(0, 6).join('\n    ')); }
    await f.b.close();
  }
  // จอกว้าง: แถบบนจัดกลุ่มเดียวกัน ไม่มีแถบล่าง
  {
    const d = await lib.open({ width: 1280, height: 800 });
    try {
      assert.equal(await vis(d.p, '.topbar .nav'), true);
      assert.deepEqual(await d.p.locator('.topbar .nav-btn').allInnerTexts(), ['ภาพรวม', '📈 ลงทุน', '🧾 บิล', '⚙️ ตั้งค่า']);
      assert.equal(await vis(d.p, '#bottomNav'), false);
      await d.p.click('.topbar .nav-btn[data-group=invest]');
      assert.equal(await d.p.evaluate(() => document.getElementById('page-trading').classList.contains('active')), true);
      passed++; console.log('PASS เฟส4: จอกว้าง — แถบบน 4 กลุ่ม ไม่มีแถบล่าง');
    } catch (e) { failed++; console.log('FAIL เฟส4: จอกว้าง', e.message.split('\n')[0]); }
    await d.b.close();
  }
  // Share Target: ?share-target=1 ต้องเปิดหน้าบิล
  {
    const s = await lib.open(null, '?share-target=1');
    try {
      await s.p.waitForTimeout(800);
      assert.equal(await s.p.evaluate(() => document.getElementById('page-bills').classList.contains('active')), true);
      passed++; console.log('PASS เฟส4: Share Target (?share-target=1) เปิดหน้าบิล');
    } catch (e) { failed++; console.log('FAIL เฟส4: Share Target', e.message.split('\n')[0]); }
    await s.b.close();
  }
  if (errors.length) { failed++; console.log('FAIL: มี JS error ' + errors.length + ' รายการ'); }
  console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nALL ${passed} PASSED`);
  process.exit(failed ? 1 : 0);
})();
