// ตัวช่วยร่วมของสคริปต์ทดสอบ UI: เปิด index.html แบบออฟไลน์ (บล็อก network) ด้วยข้อมูลตัวอย่างชุดเดียวกับ tools/ui-check.js
const { chromium } = require('playwright');
const path = require('path');
exports.open = async function (viewport, query, opts) {
  opts = opts || {};
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: viewport || { width: 390, height: 844 }, deviceScaleFactor: 1 });
  if (opts.fake) await require('./fake-firebase.js').install(ctx, opts.fake === true ? {} : opts.fake); // Firebase SDK จำลอง (window.FB ของจริงทำงานกับมัน)
  const p = await ctx.newPage();
  const errors = [];
  await p.route('**/*', r => { const u = r.request().url(); if (opts.fake && u.includes('gstatic.com/firebasejs')) return r.fallback(); if (u.startsWith('file:') || u.includes('chart.js') || u.includes('cdn.jsdelivr') || u.includes('cdnjs')) r.continue(); else r.abort(); });
  p.on('pageerror', e => { errors.push(e.message.slice(0, 300)); console.log('PAGE ERROR:', e.message.slice(0, 300)); });
  await p.goto('file://' + path.resolve(__dirname, '..', 'index.html') + (query || ''));
  await p.waitForTimeout(1500);
  if (!opts.fake) await p.evaluate(() => {
    const t = todayISO(); const ym = t.slice(0, 7);
    localStorage.setItem('folio_bill_cards', 'UOB PRVI Miles, KBank THE PASSION, ttb absolute');
    const mk = (i, o) => Object.assign({ id: 'x' + i, date: ym + '-' + String(1 + i % 14).padStart(2, '0'), time: '12:3' + i % 10, type: 'expense', category: 'food', amount: 250 + i * 37, currency: 'THB', fxToThb: 1, amountThb: 250 + i * 37, merchant: 'ร้านอาหาร ' + i, note: '', ref: '', source: 'manual', payMethod: 'card', card: 'UOB PRVI Miles' }, o);
    state.transactions = [mk(0, { type: 'income', category: 'salary', amount: 85000, amountThb: 85000, merchant: 'เงินเดือน', payMethod: 'transfer', card: '' }),
      mk(1), mk(2, { category: 'shopping', merchant: 'Shopee', amount: 1890, amountThb: 1890 }), mk(3, { category: 'transport', merchant: 'Grab', payMethod: 'ewallet', card: '' }),
      mk(4, { category: 'housing', merchant: 'ค่าเช่าคอนโด', amount: 15000, amountThb: 15000, payMethod: 'transfer', card: '' }), mk(5, { category: 'invest', merchant: 'โอนเข้ากองทุน', amount: 20000, amountThb: 20000, payMethod: 'transfer', card: '' }),
      mk(6, { category: 'travel', merchant: 'Agoda', amount: 120, currency: 'USD', fxToThb: 33, fxFeePct: 2.5, amountThb: 4059, card: 'KBank THE PASSION' }), mk(7), mk(8, { category: 'bills', merchant: 'AIS', payMethod: 'transfer', card: '' }), mk(9, { category: 'entertainment', merchant: 'Netflix', amount: 419, amountThb: 419, subscriptionId: 's1', subscriptionNo: 3 })];
    state.subscriptions = [{ id: 's1', name: 'Netflix', amount: 419, currency: 'THB', amountThb: 419, category: 'entertainment', payMethod: 'card', card: 'UOB PRVI Miles', cycle: 'monthly', startDate: '2026-09-09', active: true, lastNo: 3 }];
    state.budgetExpenses = [{ billCat: 'food', cat: 'อาหาร', amount: 8000 }, { billCat: 'housing', cat: 'ค่าเช่า', amount: 15000 }];
    showPage('bills');
  });
  return { b, p, errors };
};
