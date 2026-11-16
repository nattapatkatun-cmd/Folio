// ถ่ายอันดับ/คะแนนบัตรด้วยข้อมูลตัวอย่างที่ตายตัว (วันที่คงที่ ไม่ขึ้นกับวันนี้) — ใช้เทียบก่อน/หลังแก้ระบบสิทธิ์บัตร
//   สร้างไฟล์อ้างอิงใหม่ (เมื่อเปลี่ยนกฎบัตรโดยตั้งใจ): node tools/rw-snapshot.js > tests/fixtures/rw-rank.json
const r4 = n => Math.round(n * 1e4) / 1e4;
exports.snapshot = page => page.evaluate(() => {
  const names = BILL_RW_ORDER.map(k => BILL_RW_PRESETS[k].name);
  localStorage.setItem('folio_bill_cards', names.join(', '));
  const mk = (i, o) => Object.assign({ id: 'rw' + i, date: '2026-11-0' + (1 + i % 8), time: '12:0' + i, type: 'expense', category: 'other', amount: 1500 + i * 700, currency: 'THB', fxToThb: 1, merchant: 'ร้าน' + i, payMethod: 'card' }, o);
  state.transactions = names.flatMap((n, k) => [mk(k * 3, { card: n, amount: 3000 + k * 900 }), mk(k * 3 + 1, { card: n, category: 'food', merchant: 'ร้านอาหาร', amount: 1200 + k * 150 }), mk(k * 3 + 2, { card: n, currency: 'USD', fxToThb: 34, amount: 80, amountThb: 2800, merchant: 'Agoda' })]);
  const r4 = n => Math.round(n * 1e4) / 1e4;
  const cases = [['dining', 'THB', 1500], ['online', 'THB', 3200], ['dept', 'THB', 8000], ['supermarket', 'THB', 2500], ['central', 'THB', 6000], ['fuel', 'THB', 1200], ['airhotel', 'THB', 12000], ['ewallet', 'THB', 600], ['general', 'THB', 800], ['general', 'THB', 25000], ['fx', 'USD', 4000], ['fx', 'JPY', 40000], ['fx', 'SGD', 15000]];
  const out = { cards: names, rank: {}, calc: {} };
  cases.forEach(([tag, cur, amt]) => {
    const t = { type: 'expense', payMethod: 'card', category: tag === 'dining' ? 'food' : 'other', merchant: '', currency: cur, rewardTag: tag === 'fx' ? 'general' : tag, date: '2026-11-10', amountThb: amt };
    out.rank[tag + '/' + cur + '/' + amt] = billRwRank(t, amt).map(r => [r.prof.card, r4(r.net), r4(r.pct), r.pts, r4(r.cash), r4(r.fee)]);
  });
  billRwCards().forEach(prof => { const cyc = billRwCycle(prof.stmtDay, '2026-11-10'); const c = billRwCalc(prof, billRwTxs(prof.card, cyc.start, cyc.end)); out.calc[prof.card] = [cyc.start, cyc.end, c.pts, r4(c.cash), r4(c.value), r4(c.spend), c.miles == null ? null : r4(c.miles)]; });
  return out;
});
if (require.main === module) {
  const lib = require('./ui-lib.js');
  (async () => { const { b, p } = await lib.open(); console.log(JSON.stringify(await exports.snapshot(p), null, 1)); await b.close(); })();
}
