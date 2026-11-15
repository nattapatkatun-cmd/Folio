// ตรวจ UI แบบออฟไลน์: เปิด index.html ด้วยข้อมูลตัวอย่าง (บล็อก Firebase/API ทั้งหมด — ไม่แตะข้อมูลจริง) แล้วถ่ายภาพจอมือถือ 390x844
// ใช้: node tools/ui-check.js [โฟลเดอร์ผลลัพธ์]   → exit 1 ถ้ามี JS error บนหน้า
const { chromium } = require('playwright');
const OUT = process.argv[2] || require('path').resolve(__dirname, '..', '.ui-shots'); require('fs').mkdirSync(OUT, { recursive: true });
let ERRORS = 0;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file:') || u.includes('chart.js') || u.includes('cdn.jsdelivr') || u.includes('cdnjs')) r.continue(); else r.abort(); });
  p.on('pageerror', e => { ERRORS++; console.log('PAGE ERROR:', e.message.slice(0, 300)); });
  await p.goto('file://' + require('path').resolve(__dirname, '..', 'index.html'));
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
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
  const shot = async n => { await p.waitForTimeout(400); await p.screenshot({ path: OUT + '/' + n + '.png', fullPage: true }); };
  await shot('1-overview');
  for (const tb of ['list', 'cards', 'recur']) { await p.evaluate(x => billSetTab(x), tb); await shot('2-' + tb); }
  await p.evaluate(() => { billSetTab('overview'); openModal('billAddModal'); }); await p.screenshot({ path: OUT + '/3-add.png' });
  await p.evaluate(() => { closeModal('billAddModal'); billOpenManual(); }); await p.waitForTimeout(300);
  const m = await p.$('#bill-confirm-modal .modal, #bill-confirm-modal > div'); 
  await p.screenshot({ path: OUT + '/4-form.png' });
  await p.evaluate(() => { const el = document.querySelector('#bill-confirm-modal .modal') || document.querySelector('#bill-confirm-modal > div'); el.style.maxHeight = 'none'; el.style.overflow = 'visible'; document.getElementById('bill-confirm-modal').style.cssText += ';position:absolute;align-items:flex-start;height:auto;overflow:visible;'; window.scrollTo(0,0); });
  await shot('5-form-full');
  await p.evaluate(() => { billCloseConfirm(); showPage('budget'); }); await shot('6-budget');
  await p.evaluate(() => showPage('overview')); await p.screenshot({ path: OUT + '/7-home.png' });
  await b.close();
  console.log(ERRORS ? 'FAIL: ' + ERRORS + ' page error(s)' : 'OK: no page errors — screenshots in ' + OUT);
  process.exit(ERRORS ? 1 : 0);
})();
