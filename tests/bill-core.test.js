// เทสต์ฟังก์ชันคำนวณล้วนใน js/bill-core.js — รัน: node --test tests/
// ค่าที่คาดหวังทุกตัวคำนวณมือจากกฎ ไม่ได้ก๊อปจากผลที่โค้ดรันออกมา
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../js/bill-core.js');

test('billNormDate', () => {
  assert.equal(C.billNormDate('2028-01-14'), '2028-01-14');          // ค.ศ. อนาคต (งวดผ่อน) ต้องไม่ถูกแปลง
  assert.equal(C.billNormDate('2569-11-14'), '2026-11-14');          // พ.ศ. → ค.ศ.
  assert.equal(C.billNormDate('2026-1-5'), '2026-01-05');            // เติมศูนย์
  assert.equal(C.billNormDate('2026-11-14T10:00:00'), '2026-11-14'); // ตัดส่วนเวลา
  const today = C.todayISO();
  assert.equal(C.billNormDate('garbage'), today);
  assert.equal(C.billNormDate(''), today);
  assert.equal(C.billNormDate(null), today);
  assert.equal(C.billNormDate('2026-02-31'), today);                 // วันที่ที่ไม่มีจริง
});

test('billInstDate: วันสิ้นเดือนและข้ามปี', () => {
  assert.equal(C.billInstDate('2026-01-31', 0), '2026-01-31');
  assert.equal(C.billInstDate('2026-01-31', 1), '2026-02-28');
  assert.equal(C.billInstDate('2028-01-31', 1), '2028-02-29');       // ปีอธิกสุรทิน
  assert.equal(C.billInstDate('2026-01-31', 2), '2026-03-31');       // กลับมา 31 (ไม่เพี้ยนสะสม)
  assert.equal(C.billInstDate('2026-11-15', 2), '2027-01-15');       // ข้ามปี
  assert.equal(C.billInstDate('2026-12-31', 1), '2027-01-31');
  assert.equal(C.billInstDate('2026-01-15', 12), '2027-01-15');
});

test('billSubDate / billSubDueCount', () => {
  const m = { startDate: '2026-01-31', cycle: 'monthly' };
  assert.equal(C.billSubDate(m, 1), '2026-02-28');
  assert.equal(C.billSubDueCount(m, '2026-01-30'), 0);
  assert.equal(C.billSubDueCount(m, '2026-01-31'), 1);
  assert.equal(C.billSubDueCount(m, '2026-03-31'), 3);               // 31 ม.ค., 28 ก.พ., 31 มี.ค.
  const y = { startDate: '2025-11-15', cycle: 'yearly' };
  assert.equal(C.billSubDate(y, 1), '2026-11-15');
  assert.equal(C.billSubDueCount(y, '2026-11-14'), 1);
  assert.equal(C.billSubDueCount(y, '2026-11-15'), 2);
});

test('billRwCycle: วันตัดรอบ 15 / 29 / 31 และข้ามปี', () => {
  assert.deepEqual(C.billRwCycle(15, '2026-11-14'), { start: '2026-10-16', end: '2026-11-15' });
  assert.deepEqual(C.billRwCycle(15, '2026-11-15'), { start: '2026-10-16', end: '2026-11-15' }); // วันตัดรอบอยู่ในรอบเดิม
  assert.deepEqual(C.billRwCycle(15, '2026-11-16'), { start: '2026-11-16', end: '2026-12-15' });
  assert.deepEqual(C.billRwCycle(31, '2026-02-10'), { start: '2026-02-01', end: '2026-02-28' }); // ก.พ. ไม่มีวันที่ 31
  assert.deepEqual(C.billRwCycle(31, '2026-03-05'), { start: '2026-03-01', end: '2026-03-31' });
  assert.deepEqual(C.billRwCycle(29, '2026-03-05'), { start: '2026-03-01', end: '2026-03-29' }); // ก.พ. 2026 ตัดที่ 28
  assert.deepEqual(C.billRwCycle(29, '2028-02-10'), { start: '2028-01-30', end: '2028-02-29' }); // ปีอธิกสุรทิน
  // ม.ค. ข้ามปี
  assert.deepEqual(C.billRwCycle(15, '2027-01-10'), { start: '2026-12-16', end: '2027-01-15' });
  assert.deepEqual(C.billRwCycle(15, '2027-01-20'), { start: '2027-01-16', end: '2027-02-15' });
  assert.deepEqual(C.billRwCycle(31, '2027-01-10'), { start: '2027-01-01', end: '2027-01-31' });
});

test('billRwDue', () => {
  assert.equal(C.billRwDue('2026-11-15', 4), '2026-12-04');          // dueDay < วันตัดรอบ → เดือนถัดไป
  assert.equal(C.billRwDue('2026-11-15', 25), '2026-11-25');         // dueDay > วันตัดรอบ → เดือนเดียวกัน
  assert.equal(C.billRwDue('2026-12-15', 4), '2027-01-04');          // ข้ามปี
  assert.equal(C.billRwDue('2027-01-31', 28), '2027-02-28');
  assert.equal(C.billRwDue('2027-01-31', 31), '2027-02-28');         // ก.พ. ไม่มีวันที่ 31
});

test('billTotals: เงินคืนหักจากหมวด, cc_payment และ invest ไม่นับเป็นรายจ่าย', () => {
  const mk = o => Object.assign({ date: '2026-11-05', type: 'expense', currency: 'THB', fxToThb: 1, payMethod: 'cash' }, o);
  const list = [
    mk({ type: 'income', category: 'salary', amount: 1000 }),
    mk({ category: 'food', amount: 300 }),
    mk({ type: 'income', category: 'refund', amount: 100, offsetCat: 'food' }),
    mk({ category: 'cc_payment', amount: 500, payMethod: 'transfer' }),
    mk({ category: 'invest', amount: 200, payMethod: 'transfer' }),
    mk({ category: 'travel', amount: 120, currency: 'USD', amountThb: 4000, payMethod: 'card', card: 'A' })
  ];
  const r = C.billTotals(() => true, list);
  assert.equal(r.income, 1000);                  // เงินคืนไม่นับเป็นรายรับ
  assert.equal(r.refund, 100);
  assert.equal(r.byCat.food, 200);               // 300 - 100
  assert.equal(r.byCat.travel, 4000);            // ใช้ amountThb ไม่ใช่ amount
  assert.equal(r.consumption, 4200);
  assert.equal(r.ccPaid, 500);
  assert.equal(r.invest, 200);
  assert.equal(r.byCat.cc_payment, undefined);
  assert.equal(r.byCat.invest, undefined);
  assert.equal(r.surplus, 1000 - 4200);
  assert.equal(r.cards.A.spent, 4000);
  assert.equal(r.cards['ไม่ระบุบัตร'].paid, 500);
  // พฤติกรรมเดิม (ไม่แก้ในเฟส 0): เงินคืนไม่ถูกหักออกจาก byPay → ผลรวม byPay ≠ consumption เมื่อมีเงินคืน
  assert.equal(r.byPay.cash, 300);
  // ตัวกรอง match + รายการที่ไม่มี date ข้าม
  const only = C.billTotals(t => t.category === 'food', list.concat([{ type: 'expense', category: 'food', amount: 9999 }]));
  assert.equal(only.consumption, 300);
  assert.equal(only.count, 1);
  assert.equal(C.billTotals(() => true, []).savingsRate, null);
});

test('billAmtThb / billRefKey / billAddMonths / billInPeriod', () => {
  assert.equal(C.billAmtThb({ amountThb: 99, amount: 1, fxToThb: 50 }), 99);
  assert.equal(C.billAmtThb({ amount: 10, fxToThb: 35 }), 350);
  assert.equal(C.billAmtThb({ amount: 10 }), 10);
  assert.equal(C.billAmtThb({}), 0);
  assert.equal(C.billRefKey(' ab-12 /cd '), 'AB12CD');
  assert.equal(C.billRefKey('x'.repeat(200)).length, 120);
  assert.equal(C.billAddMonths('2026-11', 2), '2027-01');
  assert.equal(C.billAddMonths('2026-01', -1), '2025-12');
  assert.equal(C.billInPeriod({ date: '2026-11-05' }, '2026-11'), true);
  assert.equal(C.billInPeriod({ date: '2026-11-05' }, '2026'), true);
  assert.equal(C.billInPeriod({ date: '2026-11-05' }, '2026-10'), false);
  assert.equal(C.billInPeriod({}, '2026'), false);
});

test('billRwEarn', () => {
  const base = { per: 25, pts: 1 };
  const prof = (rules, extra) => ({ p: Object.assign({ base, rules }, extra), off: {} });
  const tx = (o) => Object.assign({ date: '2026-11-01', currency: 'THB', merchant: 'ร้าน', category: 'other' }, o);

  // capSpend: 800 อยู่ในเพดาน, 400 ถัดมา 200 อยู่ในเพดาน ที่เหลืออีก 200 ได้อัตราปกติ
  const pc = prof([{ id: 'r', tags: ['thb'], per: 25, pts: 5, capSpend: 1000 }]);
  let st = {};
  assert.deepEqual(C.billRwEarn(pc, st, tx(), 800), { pts: 160, cash: 0, rule: 'r' });
  assert.deepEqual(C.billRwEarn(pc, st, tx(), 400), { pts: 48, cash: 0, rule: 'r' }); // 200/25*5 + 200/25*1
  assert.equal(st.r.used, 1000);
  assert.deepEqual(C.billRwEarn(pc, st, tx(), 250), { pts: 10, cash: 0, rule: 'r' }); // เกินเพดานทั้งก้อน → ปกติ
  // overPts
  const po = prof([{ id: 'r', tags: ['thb'], per: 25, pts: 5, capSpend: 100, overPts: 2 }]);
  assert.equal(C.billRwEarn(po, {}, tx(), 200).pts, 4 * 5 + 4 * 2);

  // block + perSlip: ต้องครบในสลิปเดียว
  const pb = prof([{ id: 'b', tags: ['thb'], block: 1000, per: 25, bonusPts: 2, perSlip: true }]);
  assert.equal(C.billRwEarn(pb, {}, tx(), 2500).pts, 100 + 2 * 40 * 2);   // ฐาน 100 + 2 ก้อน × 40 × 2
  assert.equal(C.billRwEarn(pb, {}, tx(), 900).pts, 36);                  // ไม่ถึงก้อน = ฐานเท่านั้น
  // maxBlocks / capBonusPts
  const pm = prof([{ id: 'b', tags: ['thb'], block: 1000, per: 25, bonusPts: 2, perSlip: true, maxBlocks: 1 }]);
  assert.equal(C.billRwEarn(pm, {}, tx(), 2500).pts, 100 + 80);
  const pk = prof([{ id: 'b', tags: ['thb'], block: 1000, per: 25, bonusPts: 2, perSlip: true, capBonusPts: 100 }]);
  assert.equal(C.billRwEarn(pk, {}, tx(), 2500).pts, 100 + 100);
  // block สะสมข้ามสลิป (ไม่ perSlip)
  const pa = prof([{ id: 'b', tags: ['thb'], block: 1000, per: 25, bonusPts: 2 }]);
  st = {};
  assert.equal(C.billRwEarn(pa, st, tx(), 600).pts, 24);                  // ยังไม่ถึงก้อนแรก
  assert.equal(C.billRwEarn(pa, st, tx(), 600).pts, 24 + 80);             // รวม 1200 ข้ามก้อนแรก

  // pct + capCash
  const pp = prof([{ id: 'c', tags: ['thb'], pct: 5, capCash: 50 }]);
  st = {};
  assert.deepEqual(C.billRwEarn(pp, st, tx(), 800), { pts: 32, cash: 40, rule: 'c' });
  assert.deepEqual(C.billRwEarn(pp, st, tx(), 800), { pts: 32, cash: 10, rule: 'c' }); // เหลือเพดาน 10
  assert.equal(C.billRwEarn(pp, st, tx(), 800).cash, 0);

  // minSlip: ต่ำกว่าขั้นต่ำ = ไม่เข้ากฎ ตกไปใช้อัตราฐาน
  const pn = prof([{ id: 'm', tags: ['thb'], per: 25, pts: 3, minSlip: 500 }]);
  assert.deepEqual(C.billRwEarn(pn, {}, tx(), 400), { pts: 16, cash: 0, rule: '' });
  assert.deepEqual(C.billRwEarn(pn, {}, tx(), 500), { pts: 60, cash: 0, rule: 'm' });

  // ปิดกฎ, หมดอายุ, ยังไม่เริ่ม
  const pf = prof([{ id: 'r', tags: ['thb'], per: 25, pts: 5 }]); pf.off = { r: true };
  assert.equal(C.billRwEarn(pf, {}, tx(), 500).rule, '');
  const pe = prof([{ id: 'r', tags: ['thb'], per: 25, pts: 5, validTo: '2026-12-31' }]);
  assert.equal(C.billRwEarn(pe, {}, tx({ date: '2026-12-31' }), 500).rule, 'r');
  assert.equal(C.billRwEarn(pe, {}, tx({ date: '2027-01-01' }), 500).rule, '');
  const ps = prof([{ id: 'r', tags: ['thb'], per: 25, pts: 5, validFrom: '2026-12-01' }]);
  assert.equal(C.billRwEarn(ps, {}, tx({ date: '2026-11-30' }), 500).rule, '');

  // ต่างประเทศ: กฎ cur / notCur / exclude
  const pu = prof([{ id: 'fx', tags: ['fx'], per: 25, pts: 4 }, { id: 'th', tags: ['thb'], per: 25, pts: 2 }]);
  assert.equal(C.billRwEarn(pu, {}, tx({ currency: 'USD' }), 500).rule, 'fx');
  assert.equal(C.billRwEarn(pu, {}, tx(), 500).rule, 'th');
  const px = prof([], { exclude: ['fx'] });
  assert.deepEqual(C.billRwEarn(px, {}, tx({ currency: 'JPY' }), 500), { pts: 0, cash: 0, rule: '-' });
  const pn2 = prof([{ id: 'r', notCur: ['USD'], per: 25, pts: 5 }]);
  assert.equal(C.billRwEarn(pn2, {}, tx({ currency: 'usd' }), 500).rule, '');   // ตัวพิมพ์เล็กก็ต้องจับได้
});

test('billRwTags: เดาหมวดสิทธิ์จากชื่อร้าน/หมวด', () => {
  const t = o => C.billRwTags(Object.assign({ currency: 'THB', category: 'other' }, o));
  assert.ok(t({ merchant: 'PTT Station' }).has('fuel'));
  assert.ok(t({ merchant: 'Tops', category: 'food' }).has('supermarket'));
  assert.ok(!t({ merchant: 'Tops', category: 'food' }).has('dining'));
  assert.ok(t({ merchant: 'ร้านข้าว', category: 'food' }).has('dining'));
  const sia = t({ merchant: 'Singapore Airlines', currency: 'SGD' });
  assert.ok(sia.has('sia') && sia.has('airhotel') && sia.has('travel') && sia.has('fx'));
  assert.ok(t({ merchant: 'x', rewardTag: 'dept' }).has('dept'));          // เลือกเองชนะการเดา
  assert.ok(!t({ merchant: 'PTT', rewardTag: 'dept' }).has('fuel'));
  assert.ok(t({}).has('thb'));
});

test('index.html: ไม่มีสำเนาที่ซ้ำ และโหลด bill-core ก่อน script หลัก', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  for (const name of ['billAmtThb', 'billTotals', 'billRwEarn', 'billRwCycle', 'billNormDate', 'todayISO', 'billInstDate'])
    assert.ok(!new RegExp('function ' + name + '\\(').test(html), name + ' ยังซ้ำอยู่ใน index.html');
  for (const name of ['BILL_PAY', 'BILL_NON_SPEND', 'BILL_RW_TAGS', 'BILL_RW_RX'])
    assert.ok(!new RegExp('const ' + name + '\\b').test(html), name + ' ยังซ้ำอยู่ใน index.html');
  const core = html.indexOf('<script src="js/bill-core.js"></script>');
  const main = html.indexOf('<script>\n// --- NOTE');
  assert.ok(core > 0 && main > core);
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  assert.ok(sw.includes("'/Folio/js/bill-core.js'"));
});
