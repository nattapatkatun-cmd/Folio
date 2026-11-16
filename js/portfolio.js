// Folio — พอร์ต / DCA / ซื้อขาย / งบประมาณ / state กลาง
// โหลดหลัง js/bill-core.js
// แยกมาจาก index.html (เฟส 8) — เนื้อหาเดิมทุกบรรทัด ลำดับการโหลดต้องคงตาม <script src> ใน index.html

// --- NOTE: Firebase listeners set in module script above ---
// --- State (defaults shown until Firebase loads) ---
const state = {
  holdings: [],
  sheetTotals: null,   // ยอดรวมจาก Portfolio Sheet (แหล่งข้อมูลจริง) — null = ยังไม่ sync
  dcaSchedules: [],
  news: [],
  trades: [],
  aiLastUpdated: null,
  usdThb: 34.5,
  budgetIncome: parseFloat(localStorage.getItem('folio_budgetIncome') || '0') || 0,
  budgetExpenses: [],
  budgetSavings: [],
  transactions: [],     // Bill Manager — users/nattapat/transactions
  subscriptions: [],    // Bill Manager — users/nattapat/subscriptions (รายจ่ายที่หักอัตโนมัติทุกรอบ)
  sheetInputs: {},
};

// --- Hardcoded constants (no limit / ไม่มี quota) ---
const SET_PROXY = 'https://folio-proxy.ojo0308.workers.dev';
const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbxjdzzg_dDVC2fSHdF7PpajatdfieI4C5yjhUWxW9PCxnz2O9LTdQv-0rqaYcwzQbks/exec';
const NAV_SHEET_DEFAULT = 'https://script.google.com/macros/s/AKfycbx7nhAqsew76aq0rKUsfjPCEG8Aaz4KexYN6i9onNdiV7d7_iN8stlVtABV4bK1-dLf/exec';
const PORTFOLIO_SHEET_DEFAULT = 'https://script.google.com/macros/s/AKfycbxKHbm-Ge9XTk5CRKstK1UEMhamsXpvWCAJCcEcnYqyLqEoXWgGXzg0ubzEJpZeIxo/exec';

// --- Currency helpers: h.value always stores THB market value ---
function fxRate(h) { return h.currency === 'USD' ? (state.usdThb || 33) : 1; }
function valueThb(h) {
  // Portfolio Sheet = source of truth: ถ้า Sheet ส่ง Market Value มา ให้ใช้ค่านั้นตรง ๆ
  // (หน่วยลงทุนใน Firebase อาจไม่ตรงกับ Sheet ถ้าซื้อ/ขายแล้วไม่ได้แก้ในแอป)
  if (typeof h._sheetValue === 'number' && isFinite(h._sheetValue)) return h._sheetValue;
  const price = h.livePrice || h.avgPrice || 0;
  return h.shares * price * fxRate(h);
}
function costThb(h) {
  if (typeof h._sheetValue === 'number' && typeof h._sheetPL === 'number') return h._sheetValue - h._sheetPL;
  return h.shares * h.avgPrice * fxRate(h);
}

// ─── ยอดรวมของทั้งแอป — จุดเดียว ไม่ให้แต่ละหน้าคำนวณเองแล้วได้ตัวเลขคนละตัว ───
// มี state.sheetTotals (sync Sheet แล้ว) → ใช้ยอดจาก Sheet, ไม่มี → คำนวณจาก holdings ในเครื่อง
function portfolioValueThb() {
  const st = state.sheetTotals;
  if (st && st.count) return st.totalValue;
  return state.holdings.reduce((s, h) => s + valueThb(h), 0);
}
function portfolioCostThb() {
  const st = state.sheetTotals;
  if (st && st.count) return st.totalCost;
  return state.holdings.reduce((s, h) => s + costThb(h), 0);
}

// --- Escape user-entered text before injecting into innerHTML ---
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// window.FB มาจาก <script type="module"> ซึ่งรันหลัง script ปกติทั้งหมด
// โค้ดที่รันตอนโหลดหน้าต้องรอผ่านตัวนี้ ไม่งั้นเจอ window.FB เป็น undefined
function whenFB() {
  if (window.FB) return Promise.resolve(window.FB);
  return new Promise(r => window.addEventListener('folio-fb-ready', () => r(window.FB), { once: true }));
}


// --- DCA date helpers (d.nextISO = YYYY-MM-DD) ---
// คืนจำนวนวันที่เลยกำหนด: 0 = ครบกำหนดวันนี้, >0 = เลยกำหนดแล้ว, <0 = ยังไม่ถึง, null = ไม่มีข้อมูลวันที่
function dcaDueDays(d) {
  if (!d.nextISO) return null; // แผนเก่าก่อนอัพเดต — เก็บ next เป็น string ไทย เทียบวันที่ไม่ได้
  const due = new Date(d.nextISO + 'T00:00:00');
  if (isNaN(due)) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((now - due) / 86400000);
}
// รายเดือน: ยึดวันที่ตั้งต้น (anchorDay) — setMonth(+1) ตรง ๆ ทำให้ 31 ม.ค. เลยไปเป็นต้น มี.ค.
// เดือนที่สั้นกว่าใช้วันสุดท้ายของเดือน แล้วเดือนถัดไปกลับมาวันเดิม (31 ม.ค. → 28 ก.พ. → 31 มี.ค.)
function dcaNextFrom(iso, freq, anchorDay) {
  const d = new Date(iso + 'T00:00:00');
  if (freq === 'รายสัปดาห์') d.setDate(d.getDate() + 7);
  else if (freq === 'ทุก 2 สัปดาห์') d.setDate(d.getDate() + 14);
  else {
    const day = anchorDay || d.getDate();
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 2, 0).getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    d.setDate(Math.min(day, lastDay));
  }
  return isoFromDate(d);
}
// ยอด DCA ต่อเดือนของทุกแผน ปรับตามความถี่ (รายสัปดาห์ ×52/12, ทุก 2 สัปดาห์ ×26/12)
// ทุกหน้าใช้ตัวนี้ตัวเดียว — เดิมบางหน้ารวมยอดดิบ แผนรายสัปดาห์เลยถูกนับเป็นยอดต่อเดือน
function dcaMonthly() {
  return (state.dcaSchedules || []).reduce((s, d) => {
    const a = Number(d.amount) || 0;
    const mult = (d.freq === 'รายสัปดาห์' || d.freq === 'weekly') ? 52 / 12
      : (d.freq === 'ทุก 2 สัปดาห์' || d.freq === 'biweekly') ? 26 / 12 : 1;
    return s + a * mult;
  }, 0);
}
function dcaDisplayDate(iso) {
  if (!iso) return 'ยังไม่ระบุ';
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d) ? 'ยังไม่ระบุ' : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

// อ่านวันที่ trade: dateISO (record ใหม่) → createdAt จาก Firestore (record เก่า) → null
function tradeDate(t) {
  if (t.dateISO) { const d = new Date(t.dateISO); if (!isNaN(d)) return d; }
  if (t.createdAt && t.createdAt.seconds) return new Date(t.createdAt.seconds * 1000);
  return null;
}
function tradeYear(t) { const d = tradeDate(t); return d ? d.getFullYear() : null; }

// อัตรา USD/THB สำหรับแปลงมูลค่า holding สกุล USD — เดิมถูกเรียกจาก fetchAllPrices ที่ไม่มีปุ่มเรียก
// state.usdThb จึงค้างที่ค่าตั้งต้น 34.5 ตลอด ตอนนี้ดึงตอนเปิดแอป (init)
async function fetchUsdThb() {
  try {
    const r = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const d = await r.json();
    if (d.rates?.THB) state.usdThb = d.rates.THB;
  } catch(e) {}
}



// --- Thai Fund NAV via SEC API (routed through Cloudflare Worker) ---
// Cache proj_ids so we only look them up once per session
// --- Price Cache ---
function savePriceCache() {
  try {
    const today = todayISO();
    const data = {};
    state.holdings.forEach((h, i) => {
      if (h.livePrice || typeof h._sheetValue === 'number') {
        data[(h.id || h.ticker || i) + ''] = {
          livePrice: h.livePrice || 0, change: h.change || 0,
          value: h.value || 0, _navDate: h._navDate || '',
          _sheetValue: (typeof h._sheetValue === 'number' ? h._sheetValue : null),
          _sheetPL: (typeof h._sheetPL === 'number' ? h._sheetPL : null),
          _sheetMatched: h._sheetMatched || null
        };
      }
    });
    localStorage.setItem('folio_price_cache', JSON.stringify({ date: today, data }));
  } catch(e) {}
}

function loadPriceCache() {
  try {
    const raw = localStorage.getItem('folio_price_cache');
    if (!raw) return false;
    const cache = JSON.parse(raw);
    if (cache.date !== todayISO()) return false;
    if (typeof loadSheetTotalsCache === 'function') loadSheetTotalsCache();
    state.holdings.forEach((h, i) => {
      const c = cache.data[(h.id || h.ticker || i) + ''];
      if (!c) return;
      if (typeof c._sheetValue === 'number') h._sheetValue = c._sheetValue;
      if (typeof c._sheetPL === 'number') h._sheetPL = c._sheetPL;
      if (c._sheetMatched) h._sheetMatched = c._sheetMatched;
      if (c.livePrice) {
        h.livePrice = c.livePrice;
        // Recalculate change vs avgPrice (cost) - never vs old livePrice
        h.change = h.avgPrice > 0
          ? parseFloat(((c.livePrice - h.avgPrice) / h.avgPrice * 100).toFixed(2))
          : (c.change || 0);
        h._navDate = c._navDate || '';
      }
      h.value = Math.round(valueThb(h)); // แปลง USD→THB ให้ตรงกับตอน fetch สด
    });
    return true;
  } catch(e) { return false; }
}



function updatePortfolioSummary() {
  // Sheet sync แล้ว → ใช้ยอดจาก Sheet ทั้งมูลค่าและ P/L (เลขเดียวกับการ์ด Portfolio Analyzer)
  // ยังไม่ sync → fallback คำนวณจาก holdings ในเครื่องเหมือนเดิม
  const sheet = state.sheetTotals && state.sheetTotals.count ? state.sheetTotals : null;
  const total = portfolioValueThb();
  const cost = portfolioCostThb();
  const fundHoldingsAll = state.holdings.filter(h => h.type === 'fund');
  const fundsLoaded = !!sheet || fundHoldingsAll.length === 0 || fundHoldingsAll.some(h => h.livePrice);
  const liveHoldings = state.holdings.filter(h => h.livePrice);
  const liveValue = liveHoldings.reduce((s,h) => s + (h.currency==='USD' ? h.shares*h.livePrice*state.usdThb : h.shares*h.livePrice), 0);
  const liveCost = liveHoldings.reduce((s,h) => s + h.shares*h.avgPrice*(h.currency==='USD'?state.usdThb:1), 0);
  const pl = sheet ? sheet.totalPL : (fundsLoaded ? liveValue - liveCost : 0);
  const plBase = sheet ? sheet.totalCost : (fundsLoaded ? liveCost : cost);
  const plPct = plBase > 0 ? ((pl / plBase) * 100).toFixed(1) : 0;

  document.getElementById('totalValue').textContent = '฿' + Number(total).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  renderReconcileNote();
  if (!fundsLoaded) {
    document.getElementById('unrealizedPL').textContent = 'กด ✏️ ใส่ราคา เพื่อดู P&L';
    document.getElementById('unrealizedPL').className = 'hero-val';
  } else {
    document.getElementById('unrealizedPL').textContent = (pl >= 0 ? '+' : '') + '฿' + Number(pl).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
    document.getElementById('unrealizedPL').className = 'hero-val ' + (pl >= 0 ? 'pos' : 'neg');
  }

  // Best / Worst performer from current holdings (by % change)
  const holdingsWithChange = state.holdings.filter(h => h.livePrice && h.change !== 0 && h.change !== undefined);
  if (holdingsWithChange.length) {
    const best  = holdingsWithChange.reduce((a,b) => (b.change||0) > (a.change||0) ? b : a);
    const worst = holdingsWithChange.reduce((a,b) => (b.change||0) < (a.change||0) ? b : a);
    const bestEl  = document.getElementById('bestPerformerLabel');
    const worstEl = document.getElementById('worstPerformerLabel');
    if (bestEl)  { bestEl.textContent  = (best.name||best.ticker)  + ' ' + (best.change  >= 0 ? '+':'') + best.change.toFixed(2)  + '%'; bestEl.className  = best.change >= 0 ? 'pos' : 'neg'; }
    if (worstEl) { worstEl.textContent = (worst.name||worst.ticker) + ' ' + (worst.change >= 0 ? '+':'') + worst.change.toFixed(2) + '%'; worstEl.className = worst.change >= 0 ? 'pos' : 'neg'; }
  } else {
    const bestEl  = document.getElementById('bestPerformerLabel');
    const worstEl = document.getElementById('worstPerformerLabel');
    if (bestEl)  bestEl.textContent  = 'กด ✏️ ใส่ราคา';
    if (worstEl) worstEl.textContent = 'กด ✏️ ใส่ราคา';
  }

  // Realized P&L this year from trades = ยอดขาย − ต้นทุน (costBasisThb) − ค่าธรรมเนียม
  // trade เก่าที่ไม่มี costBasisThb คำนวณกำไรไม่ได้ — ข้ามไป (ไม่นับยอดขายทั้งก้อนเป็นกำไร)
  const rz = realizedPlThisYear();
  const realizedEl = document.getElementById('realizedPLLabel');
  if (realizedEl) {
    if (rz.counted) {
      realizedEl.textContent = (rz.pl >= 0 ? '+' : '') + '฿' + Math.round(rz.pl).toLocaleString() + (rz.skipped ? ' *' : '');
      realizedEl.className = rz.pl >= 0 ? 'pos' : 'neg';
      realizedEl.title = rz.skipped ? rz.skipped + ' รายการเก่าไม่มีข้อมูลต้นทุน — ไม่ถูกนับ' : '';
    } else if (state.trades.length) {
      realizedEl.textContent = rz.sells ? 'ไม่มีข้อมูลต้นทุน' : 'ยังไม่มีการขายปีนี้';
      realizedEl.className = '';
    } else {
      realizedEl.textContent = 'ยังไม่มี trade';
      realizedEl.className = '';
    }
  }

  // Update subtitle under unrealizedPL
  const plSub = document.getElementById('plPctLabel');
  if (plSub) plSub.textContent = 'กำไรรวม ' + (pl >= 0 ? '+' : '') + plPct + '%' + (sheet ? ' · จาก Sheet' : '');

  // Update todayChange to show last price update time
  const tc = document.getElementById('todayChange');
  if (tc) {
    const hasLive = state.holdings.some(h => h.livePrice);
    if (hasLive) {
      const now = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
      tc.textContent = 'อัพเดตราคาล่าสุด ' + now + ' น.';
      tc.style.color = 'var(--text3)';
    }
  }
}

// เตือนเมื่อรายการใน Sheet กับ holdings ในแอปจับคู่กันไม่ครบ
// ยอดรวมยังถูกต้อง (นับจาก Sheet) แต่กราฟสัดส่วน/alert รายตัวจะไม่เห็นรายการที่จับคู่ไม่ได้
function renderReconcileNote() {
  const el = document.getElementById('reconcileNote');
  if (!el) return;
  const st = state.sheetTotals;
  if (!st || !st.count) { el.style.display = 'none'; el.textContent = ''; return; }
  const missIn = (st.unmatchedSheet || []);
  const missApp = (st.unmatchedLocal || []);
  if (!missIn.length && !missApp.length) { el.style.display = 'none'; el.textContent = ''; return; }
  const parts = [];
  if (missIn.length) parts.push('มีใน Sheet แต่ไม่มีใน holdings: ' + missIn.join(', '));
  if (missApp.length) parts.push('มีใน holdings แต่จับคู่กับ Sheet ไม่ได้: ' + missApp.join(', '));
  el.textContent = '⚠️ ' + parts.join(' · ') + ' — ยอดรวมใช้ตัวเลขจาก Sheet, แก้ชื่อให้ตรงกันเพื่อให้กราฟสัดส่วนครบ';
  el.style.display = '';
}

// --- Helpers ---
const typeClass = { set: 't-set', us: 't-us', crypto: 't-crypto', tech: 't-tech', fund: 't-fund' };

// ─── Action Dropdown ───
function toggleActionMenu() {
  var dd = document.getElementById('actionDropdown');
  if (!dd) return;
  dd.classList.toggle('open');
}
// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
  var wrap = document.getElementById('actionMenuWrap');
  if (wrap && !wrap.contains(e.target)) {
    var dd = document.getElementById('actionDropdown');
    if (dd) dd.classList.remove('open');
  }
});

// ─── Collapsible AI Section ───
// เฟส 6a: ป้ายออฟไลน์ — ให้รู้ว่ารายการที่บันทึกตอนนี้ยังอยู่ในเครื่อง (ซิงก์เองเมื่อกลับมาออนไลน์)
function updateOfflineBadge() { const b = document.getElementById('offlineBadge'); if (b) b.style.display = navigator.onLine === false ? '' : 'none'; }
window.addEventListener('online', updateOfflineBadge); window.addEventListener('offline', updateOfflineBadge);
document.addEventListener('DOMContentLoaded', updateOfflineBadge);
function toggleAiSection() {
  var body = document.getElementById('aiSectionBody');
  var chevron = document.getElementById('aiSectionChevron');
  if (!body) return;
  body.classList.toggle('open');
  if (chevron) chevron.classList.toggle('open');
  try { localStorage.setItem('folio_ai_section_open', body.classList.contains('open') ? '1' : '0'); } catch(e) {}
}
function restoreAiSection() {
  try {
    var val = localStorage.getItem('folio_ai_section_open');
    if (val === '1') {
      var body = document.getElementById('aiSectionBody');
      var chevron = document.getElementById('aiSectionChevron');
      if (body) body.classList.add('open');
      if (chevron) chevron.classList.add('open');
    }
  } catch(e) {}
}

function updateGreeting() {
  var el = document.getElementById('greetingText');
  if (!el) return;
  var h = new Date().getHours();
  var word = h < 12 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : h < 21 ? 'สวัสดีตอนเย็น' : 'สวัสดีตอนค่ำ';
  el.textContent = word + ', Nattapat';
}
updateGreeting();

// เมนู 4 กลุ่ม: ภาพรวม · ลงทุน (ซื้อขาย / Benchmark / สัญญาณ) · บิล (รวมแท็บงบ) · ตั้งค่า
const NAV_GROUP = { overview: 'overview', trading: 'invest', benchmark: 'invest', signals: 'invest', bills: 'bills', settings: 'settings' };
const INVEST_TABS = [['trading', 'ซื้อขาย'], ['benchmark', '📈 Benchmark'], ['signals', '📡 สัญญาณ']];
let _lastInvest = 'trading';
function navGo(group) { showPage(group === 'invest' ? _lastInvest : group); }
function showPage(id) {
  if (id === 'budget') { // ลิงก์เก่า: หน้างบประมาณย้ายไปเป็นแท็บ "งบ" ในหน้าบิล
    billState.tab = 'budget';
    try { localStorage.setItem('folio_bill_tab', 'budget'); } catch (e) {}
    id = 'bills';
  }
  if (INVEST_TABS.some(t => t[0] === id)) _lastInvest = id;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.querySelectorAll('[data-group]').forEach(b => b.classList.toggle('active', b.dataset.group === NAV_GROUP[id]));
  document.querySelectorAll('.invest-tabs').forEach(el => {
    el.innerHTML = INVEST_TABS.map(([k, l]) => `<button class="${k === id ? 'on' : ''}" onclick="showPage('${k}')">${l}</button>`).join('');
  });
  if (id === 'bills' && typeof billRender === 'function') billRender(); // Chart.js ต้องวาดตอน canvas มองเห็นแล้ว
  if (id === 'signals' && typeof sgOnShowSignals === 'function') sgOnShowSignals();
  if (id === 'overview' && typeof renderAlerts === 'function') renderAlerts();
}

// ─── Autocomplete helpers ───
var TYPE_COLORS = { set:'var(--blue)', us:'var(--orange)', crypto:'var(--green)', tech:'var(--purple)', fund:'var(--amber)' };
var TYPE_BG = { set:'var(--blue-bg)', us:'var(--orange-bg)', crypto:'var(--green-bg)', tech:'var(--purple-bg)', fund:'var(--amber-bg)' };
var TYPE_LABELS = { set:'SET', us:'US', crypto:'Crypto', tech:'Tech', fund:'Fund' };

// ─── Security master: seed list for autocomplete + auto-fill (type/region/currency/tax) ───
// รายชื่อเริ่มต้นสำหรับช่วยพิมพ์เท่านั้น ไม่ใช่ข้อมูลอ้างอิงที่ยืนยันความถูกต้อง — ผู้ใช้ยังพิมพ์ชื่อเองได้เสมอถ้าไม่เจอในลิสต์
// (ชื่อกองทุนบางกองอาจคลาดเคลื่อน/เปลี่ยนชื่อไปแล้ว โปรดตรวจสอบกับ AMC ก่อนใช้งานจริง — ไม่กระทบการคำนวณราคา/NAV ใด ๆ เพราะเป็นแค่ตัวช่วยกรอกฟอร์ม)
var SET_STOCKS = [ // SET50 + mid-caps ยอดนิยม
  'PTT','PTTEP','AOT','CPALL','ADVANC','SCB','KBANK','BBL','KTB','TTB',
  'SCC','CPN','CRC','GULF','GPSC','EGCO','RATCH','BGRIM','TOP','IRPC',
  'IVL','BANPU','DELTA','HANA','KCE','TU','CBG','OSP','MINT','CENTEL',
  'BDMS','BH','TIDLOR','MTC','SAWAD','TISCO','TCAP','KKP','BAM','AWC',
  'WHA','AMATA','TRUE','COM7','HMPRO','GLOBAL','DOHOME','CPF','TVO','STA',
  // mid-caps เพิ่มเติม (SET100)
  'BJC','ERW','MAJOR','JMART','JMT','SINGER','KTC','SPALI','AP','LH',
  'ORI','SIRI','QH','PSL','SCCC','GUNKUL','CKP','EA','BCPG','PLANB',
  'VGI','BEC','MC','TFG','GFPT','CHG','BCH','SYNEX','TTA','UAC',
  'EASTW','JAS','SABUY'
];
var US_STOCKS = [
  'AAPL','MSFT','GOOGL','AMZN','NVDA','META','TSLA','JPM','V','MA',
  'UNH','HD','PG','JNJ','XOM','CVX','ABBV','MRK','KO','PEP',
  'COST','WMT','BAC','DIS','NFLX','ADBE','CRM','ORCL','AMD','INTC',
  'QCOM','CSCO','IBM','TXN','AVGO','PYPL','SBUX','NKE','MCD','BA',
  'GE','CAT','HON','LMT','UPS','F','GM','T','VZ','PFE',
  // เพิ่มเติม: การเงิน, เทคโนโลยี, health care, industrials, utilities, real estate
  'GS','MS','BLK','AXP','SPGI','RTX','UNP','ABNB','UBER','SHOP',
  'SQ','COIN','PLTR','SNOW','NOW','INTU','ADI','LRCX','AMAT','MU',
  'ISRG','REGN','VRTX','GILD','BMY','CI','ELV','MDT','SYK','DE',
  'EMR','ITW','PH','NSC','CSX','SO','DUK','NEE','AEP','PSA',
  'PLD','AMT','CCI','PANW','CRWD','ZS','DDOG','NET','TEAM','WDAY',
  'ADSK','ANET'
];
var CRYPTO_TICKERS = ['BTC','ETH','BNB','SOL','XRP','ADA','DOGE','AVAX','DOT','LINK'];
// { name, region } — region ตรงกับ h-fund-region select values; taxType เดาจากคำต่อท้ายชื่อ (RMF/SSF)
var THAI_FUNDS = [
  // Kasikorn Asset Management (K-)
  { name:'K-USA-A(A)', region:'us' }, { name:'K-USXNDQ-A(A)', region:'us' },
  { name:'K-CHINA-A(A)', region:'china' }, { name:'K-CHINA-RMF', region:'china' },
  { name:'K-GTECH-A(A)', region:'global' }, { name:'K-GHEALTH-A(A)', region:'global' },
  { name:'K-EUROPE-A(A)', region:'global' }, { name:'K-JP-A(A)', region:'asia' },
  { name:'K-VIETNAM-A(A)', region:'asia' }, { name:'K-GOLD-A(A)', region:'global' },
  { name:'K-FIXEDPLUS-A(A)', region:'bond' }, { name:'K-STAR-A(A)', region:'thai' },
  { name:'K-CASH', region:'bond' }, { name:'K-MIDSMALL', region:'thai' },
  { name:'K-FIT', region:'thai' },
  // Krungsri Asset Management (KF-)
  { name:'KFSDIV-A', region:'thai' }, { name:'KFSGOV-A', region:'bond' },
  { name:'KFGBRAND-A', region:'global' }, { name:'KFHTECH-A', region:'global' },
  { name:'KFACHINA-A', region:'china' }, { name:'KFGOLD-A', region:'global' },
  { name:'KFSMART-RMF', region:'thai' }, { name:'KFAFIX-A', region:'bond' },
  { name:'KFCASH-A', region:'bond' }, { name:'KFGG-A', region:'global' },
  { name:'KFVIET-A', region:'asia' }, { name:'KFTECH-A', region:'global' },
  // SCB Asset Management (SCB-)
  { name:'SCBS&P500', region:'us' }, { name:'SCBS&P500-SSF', region:'us' },
  { name:'SCBNDQ(A)', region:'us' }, { name:'SCBNDQ(SSF)', region:'us' },
  { name:'SCBRMS&P500', region:'us' }, { name:'SCBGOLD', region:'global' },
  { name:'SCBGOLDH', region:'global' }, { name:'SCBSET', region:'thai' },
  { name:'SCBDV', region:'thai' }, { name:'SCBLT1', region:'bond' },
  { name:'SCBLEQ', region:'thai' }, { name:'SCBPGF', region:'global' },
  // TISCO Asset Management
  { name:'TISCOUS', region:'us' }, { name:'TISCOCHINA', region:'china' },
  { name:'TISCOGOLD', region:'global' }, { name:'TISCOEUR', region:'global' },
  { name:'TISCOEQ', region:'thai' }, { name:'TISCOJP', region:'asia' },
  // Bangkok Bank Asset Management / BBLAM (B-)
  { name:'B-INNOTECH', region:'global' }, { name:'B-CHINE-EQ', region:'china' },
  { name:'B-ASIA', region:'asia' }, { name:'B-GLOBAL', region:'global' },
  { name:'B-FUTURE', region:'global' }, { name:'BCHIP', region:'thai' },
  { name:'B-TNTV', region:'thai' },
  // Principal (CIMB-Principal)
  { name:'PRINCIPAL GOPPORTUNITY', region:'global' }, { name:'PRINCIPAL GFUND', region:'global' },
  { name:'PRINCIPAL VNEQ-A', region:'asia' }, { name:'PRINCIPAL SET50', region:'thai' },
  { name:'PRINCIPAL DIVIDEND', region:'thai' },
  // One Asset Management
  { name:'ONE-UGG-RA', region:'global' }, { name:'ONE-GINNO-RA', region:'global' },
  { name:'ONE-DIVIDEND', region:'thai' },
  // UOB Asset Management
  { name:'UOBSGC', region:'global' }, { name:'UOBSA', region:'thai' },
  { name:'UOBSM', region:'thai' }, { name:'UOBSCI', region:'china' },
  { name:'UOBGB', region:'bond' }, { name:'UOBGOLD', region:'global' },
  // Asset Plus
  { name:'ASP-DIGIBLOC', region:'global' }, { name:'ASP-EVOLUX', region:'global' },
  { name:'ASP-SME', region:'thai' },
  // ttb Asset Management (formerly TMB)
  { name:'TMBGQG', region:'global' }, { name:'TMB50', region:'thai' },
  // Krungthai Asset Management (KTAM)
  { name:'KTSTAR', region:'thai' }, { name:'KT-PROPERTY', region:'mixed' },
  // Land and House Fund Management
  { name:'LHTPROP', region:'mixed' }, { name:'LHGOLD', region:'global' },
  { name:'LHSTRATEGY', region:'mixed' },
  // Kiatnakin Phatra
  { name:'KKP GNP', region:'global' }, { name:'PHATRA GNP', region:'global' }
];
function fundTaxTypeGuess(name) {
  var u = name.toUpperCase();
  if (u.indexOf('RMF') !== -1) return 'RMF';
  if (u.indexOf('SSF') !== -1) return 'SSF';
  return '';
}

function acGetCandidates(mode) {
  var h = state.holdings || [];
  if (mode === 'ticker') {
    // unique tickers from non-fund holdings, merged with SET/US/crypto master list
    var seen = {};
    var out = h.filter(function(x){ return x.type !== 'fund'; }).map(function(x){
      var key = (x.ticker || '').toUpperCase();
      if (!key || seen[key]) return null;
      seen[key] = true;
      return { label: key, sub: x.broker || '', type: x.type };
    }).filter(Boolean);
    SET_STOCKS.forEach(function(t){ if (!seen[t]) { seen[t]=true; out.push({ label:t, sub:'SET50', type:'set', currency:'THB' }); } });
    US_STOCKS.forEach(function(t){ if (!seen[t]) { seen[t]=true; out.push({ label:t, sub:'US stock', type:'us', currency:'USD' }); } });
    CRYPTO_TICKERS.forEach(function(t){ if (!seen[t]) { seen[t]=true; out.push({ label:t, sub:'Crypto', type:'crypto', currency:'USD' }); } });
    return out;
  }
  if (mode === 'name') {
    var seen2 = {};
    var out2 = h.filter(function(x){ return x.type === 'fund'; }).map(function(x){
      var key = (x.name || x.ticker || '').toUpperCase();
      if (!key || seen2[key]) return null;
      seen2[key] = true;
      return { label: x.name || x.ticker, sub: x.broker || '', type: 'fund' };
    }).filter(Boolean);
    THAI_FUNDS.forEach(function(f){
      var key = f.name.toUpperCase();
      if (seen2[key]) return;
      seen2[key] = true;
      var tax = fundTaxTypeGuess(f.name);
      out2.push({ label: f.name, sub: (tax ? tax + ' · ' : '') + 'กองทุนไทย', type: 'fund', fundRegion: f.region, taxType: tax, currency: 'THB' });
    });
    return out2;
  }
  if (mode === 'trade' || mode === 'dca') {
    var seen3 = {};
    var out3 = h.map(function(x){
      var key = (x.ticker || x.name || '').toUpperCase();
      if (!key || seen3[key]) return null;
      seen3[key] = true;
      return { label: x.ticker || x.name, sub: x.broker || '', type: x.type };
    }).filter(Boolean);
    SET_STOCKS.forEach(function(t){ if (!seen3[t]) { seen3[t]=true; out3.push({ label:t, sub:'SET50', type:'set' }); } });
    US_STOCKS.forEach(function(t){ if (!seen3[t]) { seen3[t]=true; out3.push({ label:t, sub:'US stock', type:'us' }); } });
    CRYPTO_TICKERS.forEach(function(t){ if (!seen3[t]) { seen3[t]=true; out3.push({ label:t, sub:'Crypto', type:'crypto' }); } });
    THAI_FUNDS.forEach(function(f){ var key=f.name.toUpperCase(); if (!seen3[key]) { seen3[key]=true; out3.push({ label:f.name, sub:'กองทุนไทย', type:'fund' }); } });
    return out3;
  }
  if (mode === 'broker') {
    var bseen = {};
    var brokers = [];
    h.forEach(function(x){ if (x.broker && !bseen[x.broker]) { bseen[x.broker]=true; brokers.push({ label: x.broker, sub: '', type: x.type }); } });
    return brokers;
  }
  return [];
}

function acFilter(inputId, ddId, mode) {
  var inp = document.getElementById(inputId);
  var dd = document.getElementById(ddId);
  if (!inp || !dd) return;
  var q = inp.value.trim();
  var qUp = q.toUpperCase();
  var candidates = acGetCandidates(mode);
  var filtered = qUp
    ? candidates.filter(function(c){ return c.label.toUpperCase().includes(qUp); })
    : candidates;

  // Drop-up if near bottom of screen
  var rect = inp.getBoundingClientRect();
  if ((window.innerHeight - rect.bottom) < 250) {
    dd.classList.add('drop-up');
  } else {
    dd.classList.remove('drop-up');
  }

  if (!filtered.length) {
    if (q) {
      dd.innerHTML = '<div class="ac-empty">✏️ พิมพ์ใหม่: <strong>' + esc(q) + '</strong></div>';
      dd.classList.add('open');
    } else {
      dd.classList.remove('open');
    }
    return;
  }

  dd.innerHTML = filtered.slice(0, 15).map(function(c, i){
    var color = TYPE_COLORS[c.type] || 'var(--text3)';
    var bg = TYPE_BG[c.type] || 'var(--bg2)';
    var typeLabel = TYPE_LABELS[c.type] || '';
    // Highlight matched text — escape each piece before wrapping in <mark> to avoid HTML injection from a holding/broker name
    var display = esc(c.label);
    if (q) {
      var idx = c.label.toUpperCase().indexOf(qUp);
      if (idx >= 0) {
        display = esc(c.label.slice(0, idx)) +
          '<mark>' + esc(c.label.slice(idx, idx + q.length)) + '</mark>' +
          esc(c.label.slice(idx + q.length));
      }
    }
    // JS-string-escape first (for the single-quoted onmousedown arg), then HTML-escape (for the surrounding double-quoted attribute)
    var safeVal = esc(c.label.replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
    // onmousedown+preventDefault prevents blur closing dropdown before click fires
    return '<div class="ac-item" data-val="' + esc(c.label) + '" data-idx="' + i + '" onmousedown="event.preventDefault();acPick(\'' + inputId + '\',\'' + ddId + '\',\'' + safeVal + '\',\'' + mode + '\')">' +
      (typeLabel ? '<span class="ac-badge" style="background:' + bg + ';color:' + color + ';">' + typeLabel + '</span>' : '') +
      '<div><div class="ac-item-name">' + display + '</div>' +
      (c.sub ? '<div class="ac-item-sub">' + esc(c.sub) + '</div>' : '') +
      '</div></div>';
  }).join('');
  dd.classList.add('open');
}

// หาข้อมูล ticker จาก holdings เดิมก่อน ถ้าไม่เจอค่อยหาจาก security master (SET/US/Crypto)
function acLookupTicker(val) {
  var key = val.toUpperCase();
  var hh = (state.holdings || []).find(function(x){ return (x.ticker || '').toUpperCase() === key; });
  if (hh) return { type: hh.type, currency: hh.currency, broker: hh.broker };
  if (SET_STOCKS.indexOf(key) !== -1) return { type: 'set', currency: 'THB' };
  if (US_STOCKS.indexOf(key) !== -1) return { type: 'us', currency: 'USD' };
  if (CRYPTO_TICKERS.indexOf(key) !== -1) return { type: 'crypto', currency: 'USD' };
  return null;
}
// หาข้อมูลกองทุนจาก holdings เดิมก่อน ถ้าไม่เจอค่อยหาจาก THAI_FUNDS
function acLookupFund(val) {
  var key = val.toUpperCase();
  var hf = (state.holdings || []).find(function(x){ return (x.name || x.ticker || '').toUpperCase() === key; });
  if (hf) return { fundRegion: hf.fundRegion, broker: hf.broker, taxType: hf.taxType };
  var f = THAI_FUNDS.find(function(x){ return x.name.toUpperCase() === key; });
  if (f) return { fundRegion: f.region, taxType: fundTaxTypeGuess(f.name) };
  return null;
}

function acPick(inputId, ddId, val, mode) {
  var inp = document.getElementById(inputId);
  if (inp) { inp.value = val; inp.focus(); }
  var dd = document.getElementById(ddId);
  if (dd) dd.classList.remove('open');
  // auto-fill broker in trade modal when asset picked
  if (mode === 'trade') {
    var h = (state.holdings || []).find(function(x){ return (x.ticker || x.name || '').toUpperCase() === val.toUpperCase(); });
    if (h && h.broker) {
      var tb = document.getElementById('t-broker');
      if (tb && !tb.value) tb.value = h.broker;
    }
  }
  // auto-fill type + currency in holding modal when ticker picked (from holdings, or SET/US/Crypto master list)
  if (mode === 'ticker') {
    var hh = acLookupTicker(val);
    if (hh) {
      var ht = document.getElementById('h-type'); if (ht) ht.value = hh.type || 'set';
      var hc = document.getElementById('h-currency'); if (hc) hc.value = hh.currency || 'THB';
      var hb = document.getElementById('h-broker'); if (hb && hh.broker) hb.value = hh.broker;
      onHoldingTypeChange();
    }
  }
  // auto-fill fund region + SSF/RMF in holding modal when a fund name is picked (from holdings, or THAI_FUNDS master list)
  if (mode === 'name') {
    var hf = acLookupFund(val);
    if (hf) {
      var hfr = document.getElementById('h-fund-region'); if (hfr && hf.fundRegion) hfr.value = hf.fundRegion;
      var hfb = document.getElementById('h-broker'); if (hfb && hf.broker) hfb.value = hf.broker;
      var het = document.getElementById('h-tax-type');
      if (het && hf.taxType) { het.value = hf.taxType; onTaxTypeChange(); }
    }
  }
  // auto-fill type in DCA modal when ticker picked
  if (mode === 'dca') {
    var hd = acLookupTicker(val);
    if (hd) {
      var dt = document.getElementById('d-type'); if (dt && hd.type) dt.value = hd.type;
    } else {
      var hdf = acLookupFund(val);
      if (hdf) { var dtf = document.getElementById('d-type'); if (dtf) dtf.value = 'fund'; }
    }
  }
}

function acKeyNav(e, ddId) {
  var dd = document.getElementById(ddId);
  if (!dd || !dd.classList.contains('open')) return;
  var items = dd.querySelectorAll('.ac-item');
  var cur = dd.querySelector('.ac-item.active');
  var idx = cur ? parseInt(cur.dataset.idx) : -1;
  if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); }
  // รายการเลือกด้วย onmousedown (กัน blur ปิด dropdown ก่อน) — click() ไม่ยิง mousedown จึงต้องส่งเอง
  else if (e.key === 'Enter' && cur) { e.preventDefault(); cur.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); return; }
  // หยุดไม่ให้ไปถึงตัวปิด modal บน document — Escape ครั้งแรกปิดแค่ dropdown
  else if (e.key === 'Escape') { e.stopPropagation(); dd.classList.remove('open'); return; }
  items.forEach(function(it){ it.classList.remove('active'); });
  if (items[idx]) items[idx].classList.add('active');
}

// Close all dropdowns on outside click
document.addEventListener('click', function(e) {
  document.querySelectorAll('.ac-dropdown.open').forEach(function(dd) {
    if (!dd.closest('.ac-wrap').contains(e.target)) dd.classList.remove('open');
  });
});

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
});
// Escape closes any open modal (acKeyNav stops propagation when it closes a dropdown, so the first Escape only closes the dropdown)
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const openDD = document.querySelector('.ac-dropdown.open');
  if (openDD) return; // ให้ Escape แรกปิด dropdown ก่อน (acKeyNav จัดการเอง)
  document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
});

let _toastTimer = 0;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(_toastTimer); // toast ใหม่ต้องไม่ถูกตัวนับเวลาของ toast เก่าซ่อนก่อนเวลา
  _toastTimer = setTimeout(() => t.classList.remove('show'), 4500);
}



// --- Date ---
function setDate() {
  document.getElementById('dateDisplay').textContent =
    new Date().toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// --- Render Holdings ---
function renderHoldings() {
  var el = document.getElementById('holdingsList');
  if (!state.holdings.length) {
    el.innerHTML = '<div class="empty" style="padding:20px 0;"><div style="font-size:28px;margin-bottom:8px;">📭</div><div style="color:var(--text2);font-size:13px;margin-bottom:12px;">ยังไม่มีหลักทรัพย์</div><button onclick="openHoldingModal()" class="btn-primary" style="font-size:12px;padding:7px 16px;">+ เพิ่มหลักทรัพย์แรก</button></div>';
    return;
  }

  // Group same-name + broker holdings
  // มูลค่าคำนวณสดจาก valueThb() ทุกครั้ง — ฟิลด์ value ใน Firestore เป็นค่า ณ ตอนเพิ่ม/แก้ holding
  // (ไม่อัปเดตตอนซื้อขาย และไม่ได้แปลง USD ตอนใส่ราคาเอง) ถ้าใช้ตรง ๆ ตัวเลขจะเก่าหรือผิดสกุล
  var grouped = {};
  state.holdings.forEach(function(h, i) {
    var key = (h.name || h.ticker).toUpperCase() + '|' + (h.broker || '');
    if (!grouped[key]) {
      grouped[key] = Object.assign({}, h, { value: valueThb(h), _ids: [{ id: h.id, i: i }] });
    } else {
      var g = grouped[key];
      var totalShares = g.shares + h.shares;
      g.avgPrice = parseFloat(((g.avgPrice * g.shares + h.avgPrice * h.shares) / totalShares).toFixed(4));
      g.shares = parseFloat(totalShares.toFixed(4));
      var gVal = g.value || 0, hVal = valueThb(h);
      // Weight %change by value, not a flat average — a ฿10k lot moving -50% shouldn't cancel out a ฿1M lot at +2%
      g.change = (gVal + hVal) > 0 ? ((g.change || 0) * gVal + (h.change || 0) * hVal) / (gVal + hVal) : 0;
      g.value = gVal + hVal;
      g.dca = g.dca || h.dca;
      g._ids.push({ id: h.id, i: i });
    }
  });
  var groups = Object.values(grouped);
  window._holdingGroups = groups;

  // ─── Smart filter: 4-segment logic ───
  // Sort by value for ranking
  var byValue = groups.slice().sort(function(a,b) { return (b.value||b.shares*b.avgPrice) - (a.value||a.shares*a.avgPrice); });
  var top5ids = new Set(byValue.slice(0, 5).map(function(h) { return (h.name||h.ticker)+'|'+(h.broker||''); }));

  // BuyScore threshold: top 20% — use _p17SheetData if available
  var buyScoreMap = {};
  if (window._p17SheetData && window._p17SheetData.holdings) {
    window._p17SheetData.holdings.forEach(function(sh) {
      buyScoreMap[sh['Asset']] = Number(sh['Buy Priority Score'] || 0);
    });
  }
  var allScores = Object.values(buyScoreMap);
  var buyThreshold = allScores.length ? allScores.sort(function(a,b){return b-a;})[Math.floor(allScores.length*0.2)] || 5 : 5;

  // Bottom 3 by P/L%
  var byReturn = groups.filter(function(h) { return h.change !== undefined && h.livePrice; })
    .slice().sort(function(a,b) { return (a.change||0) - (b.change||0); });
  var bottom3ids = new Set(byReturn.slice(0, 3).map(function(h) { return (h.name||h.ticker)+'|'+(h.broker||''); }));

  // Assign tags
  function getTags(h) {
    var key = (h.name||h.ticker).toUpperCase() + '|' + (h.broker||'');
    var valueKey = (h.name||h.ticker) + '|' + (h.broker||'');
    var tags = [];
    var drift = 0;
    var score = 0;

    // Get drift and buyscore from Sheet data
    if (window._p17SheetData && window._p17SheetData.holdings) {
      var name = (h.name || h.ticker).toUpperCase().replace(/_/g,' ');
      var match = window._p17SheetData.holdings.find(function(sh) {
        return sh['Asset'].toUpperCase() === name || sh['Asset'].toUpperCase() === (h.ticker||'').toUpperCase();
      });
      if (match) {
        drift = Number(match['Drift %'] || 0) * 100;
        score = Number(match['Buy Priority Score'] || 0);
      }
    } else {
      drift = h.change || 0; // fallback to price change
    }

    if (top5ids.has(valueKey)) tags.push({ label: 'Top', color: '#1D4ED8', bg: '#EEF3FE' });
    if (Math.abs(drift) > 5) tags.push({ label: drift > 0 ? 'Drift+' : 'Drift-', color: '#B45309', bg: '#FEF3C7' });
    if (score >= buyThreshold && score > 0) tags.push({ label: 'Buy', color: '#16A34A', bg: '#DCFCE7' });
    if (bottom3ids.has(valueKey)) tags.push({ label: 'Risk', color: '#DC2626', bg: '#FEE2E2' });
    return tags;
  }

  // Filter: show if Top OR Drift > 5% OR BuyScore top 20% OR bottom 3 return
  // Limit to max 10 items
  var filtered = groups.filter(function(h) {
    h._cachedTags = getTags(h);
    return h._cachedTags.length > 0;
  });

  // If < 5 items shown, add remaining top by value up to 5 total
  if (filtered.length < 5) {
    var shownKeys = new Set(filtered.map(function(h){ return (h.name||h.ticker)+'|'+(h.broker||''); }));
    byValue.forEach(function(h) {
      var k = (h.name||h.ticker)+'|'+(h.broker||'');
      if (!shownKeys.has(k) && filtered.length < 5) { filtered.push(h); shownKeys.add(k); }
    });
  }

  // Cap at 10
  filtered = filtered.slice(0, 10);

  if (!filtered.length) { filtered = groups.slice(0, 5); }

  var gi_map = {};
  groups.forEach(function(h, i) { gi_map[(h.name||h.ticker)+'|'+(h.broker||'')] = i; });

  el.innerHTML = filtered.map(function(h) {
    var gi = gi_map[(h.name||h.ticker)+'|'+(h.broker||'')];
    var tags = h._cachedTags || getTags(h);
    var val = Math.round(h.value);
    var tagsHtml = tags.map(function(t) {
      return '<span style="background:'+t.bg+';color:'+t.color+';border-radius:4px;padding:1px 5px;font-size:9px;font-weight:600;margin-left:3px;">'+esc(t.label)+'</span>';
    }).join('');
    var fundLabel = h.type === 'fund' ? (
      h.fundRegion === 'us' ? 'กองทุนสหรัฐ' :
      h.fundRegion === 'global' ? 'กองทุนต่างประเทศ' :
      h.fundRegion === 'china' ? 'กองทุนจีน' :
      h.fundRegion === 'asia' ? 'กองทุนเอเชีย' :
      h.fundRegion === 'bond' ? 'กองทุนตราสารหนี้' :
      h.fundRegion === 'mixed' ? 'กองทุนผสม' : 'กองทุน') : esc(h.ticker);
    var merged = h._ids.length > 1;
    var mergedBadge = merged ? ' <span style="font-size:9px;background:var(--accent-light);color:var(--accent);border-radius:4px;padding:1px 4px;">x'+h._ids.length+'</span>' : '';
    var lockInfo = taxLockInfo(h.name || h.ticker);
    var lockBadge = lockInfo ? ' <span style="font-size:9px;background:var(--amber-bg);color:#B45309;border-radius:4px;padding:1px 5px;font-weight:600;">🔒 '+esc(lockInfo.label)+'</span>' : '';
    var subUnit = h.type === 'crypto' ? 'หน่วย' : h.type === 'fund' ? ('หน่วย' + (h.livePrice ? ' · NAV ฿'+h.livePrice+(h._navDate?' ('+esc(h._navDate)+')':'') : ' · avg ฿'+h.avgPrice)) : 'หุ้น';
    return '<div class="holding">' +
      '<div class="dca-dot" style="'+(h.dca?'':'opacity:0')+'"></div>' +
      '<div class="holding-info">' +
        '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:2px;">' +
          '<span class="dca-ticker '+typeClass[h.type]+'">'+ fundLabel + mergedBadge +'</span>' + lockBadge +
          tagsHtml +
        '</div>' +
        '<div class="holding-name">'+esc(h.name||h.ticker)+'</div>' +
        '<div class="holding-sub">'+(h.shares.toFixed(4))+' '+subUnit+(h.broker?' · <span style="background:var(--bg2);color:var(--text2);border-radius:4px;padding:1px 5px;font-size:10px;">'+esc(h.broker)+'</span>':'')+(h.dca?' · DCA active':'')+'</div>' +
      '</div>' +
      '<div class="holding-right">' +
        '<div class="holding-val">฿'+Number(val).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})+(h.livePrice?'':'<span style="font-size:9px;color:var(--text3);margin-left:3px;">cost</span>')+'</div>' +
        '<div class="holding-chg '+((h.change||0)>=0?'pos':'neg')+'">'+(((h.change||0)>=0)?'+':'')+((h.change||0).toFixed(2))+'%</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:4px;margin-left:6px;">' +
        '<button onclick="editHoldingGroup('+gi+')" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:13px;">✏️</button>' +
        '<button onclick="deleteHoldingGroup('+gi+')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:13px;">✕</button>' +
      '</div>' +
    '</div>';
  }).join('');

  // Show count indicator
  var hidden = groups.length - filtered.length;
  if (hidden > 0) {
    el.innerHTML += '<div style="text-align:center;padding:8px;font-size:11px;color:var(--accent);cursor:pointer;" onclick="renderAllHoldings()">+ ดูทั้งหมด '+groups.length+' รายการ</div>';
  }
}

function renderAllHoldings() {
  // Show all holdings without filter
  var el = document.getElementById('holdingsList');
  var groups = window._holdingGroups || [];
  if (!groups.length) return;
  var gi_map = {};
  groups.forEach(function(h, i) { gi_map[(h.name||h.ticker)+'|'+(h.broker||'')] = i; });
  el.innerHTML = groups.map(function(h) {
    var gi = gi_map[(h.name||h.ticker)+'|'+(h.broker||'')];
    var val = Math.round(h.value);
    var merged = h._ids.length > 1;
    var mergedBadge = merged ? ' x'+h._ids.length : '';
    var fundLabel = h.type === 'fund' ? 'กองทุน' : esc(h.ticker);
    var lockInfo = taxLockInfo(h.name || h.ticker);
    var lockBadge = lockInfo ? ' <span style="font-size:9px;background:var(--amber-bg);color:#B45309;border-radius:4px;padding:1px 5px;font-weight:600;">🔒 '+esc(lockInfo.label)+'</span>' : '';
    return '<div class="holding">' +
      '<div class="dca-dot" style="'+(h.dca?'':'opacity:0')+'"></div>' +
      '<div class="holding-info">' +
        '<span class="dca-ticker '+typeClass[h.type]+'">'+ fundLabel + mergedBadge +'</span>' + lockBadge +
        '<div class="holding-name">'+esc(h.name||h.ticker)+'</div>' +
        '<div class="holding-sub">'+(h.shares.toFixed(4))+' หน่วย'+(h.broker?' · '+esc(h.broker):'')+'</div>' +
      '</div>' +
      '<div class="holding-right">' +
        '<div class="holding-val">฿'+Number(val).toLocaleString(undefined,{maximumFractionDigits:0})+'</div>' +
        '<div class="holding-chg '+((h.change||0)>=0?'pos':'neg')+'">'+(((h.change||0)>=0)?'+':'')+((h.change||0).toFixed(2))+'%</div>' +
      '</div>' +
      '<div style="margin-left:6px;">' +
        '<button onclick="editHoldingGroup('+gi+')" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:13px;">✏️</button>' +
        '<button onclick="deleteHoldingGroup('+gi+')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:13px;">✕</button>' +
      '</div>' +
    '</div>';
  }).join('') + '<div style="text-align:center;padding:8px;font-size:11px;color:var(--accent);cursor:pointer;" onclick="renderHoldings()">ย่อกลับ (smart view)</div>';
}

async function deleteHoldingGroup(gi) {
  const group = (window._holdingGroups || [])[gi];
  if (!group) return;
  const name = group.name || group.ticker;
  if (!confirm('ลบ ' + name + (group._ids.length > 1 ? ' (' + group._ids.length + ' รายการ)' : '') + '?')) return;
  const toDelete = group._ids.slice();
  for (const { id } of toDelete) {
    if (window.FB && id) await window.FB.del('holdings', id);
  }
  // Remove from local state by ids
  const deleteIds = new Set(toDelete.map(x => x.id).filter(Boolean));
  const deleteIdxs = new Set(toDelete.filter(x => !x.id).map(x => x.i));
  state.holdings = state.holdings.filter((h, i) => !deleteIds.has(h.id) && !deleteIdxs.has(i));
  renderHoldings();
  updatePortfolioSummary();
  showToast('ลบ ' + name + ' แล้ว');
}

// --- Render DCA (card removed; function kept for DCA modal + Phase 11 alerts) ---
function renderDCA() {
  const total = Math.round(dcaMonthly());
  const el = document.getElementById('dcaTotal');
  if (el) el.textContent = total ? '฿' + total.toLocaleString() + ' / เดือน' : '';
  const list = document.getElementById('dcaPlanList');
  if (!list) return;
  if (!state.dcaSchedules.length) {
    list.innerHTML = '<div style="text-align:center;padding:14px;color:var(--text3);font-size:12px;">ยังไม่มีแผน DCA — กด + เพิ่มแผน เพื่อเริ่มต้น</div>';
    return;
  }
  const freqLabel = { monthly: 'รายเดือน', weekly: 'รายสัปดาห์', biweekly: 'ทุก 2 สัปดาห์' };
  list.innerHTML = state.dcaSchedules.map(function(d, i) {
    var overdueDays = dcaDueDays(d);
    var isDue = overdueDays !== null && overdueDays >= 0;
    var dueBadge = isDue
      ? '<span style="font-size:9px;background:var(--amber);color:#fff;border-radius:4px;padding:1px 6px;font-weight:700;">' +
        (overdueDays === 0 ? 'ครบกำหนดวันนี้' : 'เลยกำหนด ' + overdueDays + ' วัน') + '</span>'
      : '';
    var nextLabel = d.nextISO ? dcaDisplayDate(d.nextISO) : (d.next || 'ยังไม่ระบุ');
    var avgPrice = (d.boughtTotalQty > 0) ? (d.boughtTotalAmount / d.boughtTotalQty) : null;
    var avgLine = avgPrice
      ? ' · ซื้อแล้ว ' + d.boughtCount + ' ครั้ง เฉลี่ย ฿' + avgPrice.toLocaleString(undefined,{maximumFractionDigits:4})
      : '';
    return '<div class="holding" style="' + (isDue ? 'background:var(--amber-bg);border-radius:8px;' : '') + '">' +
      '<div class="holding-info">' +
        '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
          '<span class="dca-ticker ' + (d.type ? ('t-' + d.type) : '') + '" style="font-weight:600;">' + esc(d.ticker || '—') + '</span>' +
          dueBadge + (typeof sgDcaBadge === 'function' ? sgDcaBadge(d) : '') +
        '</div>' +
        '<div class="holding-sub">' + esc(freqLabel[d.freq] || d.freq || '') + ' · ครั้งถัดไป: ' + esc(nextLabel) + avgLine + '</div>' +
      '</div>' +
      '<div class="holding-right"><div class="holding-val">฿' + Number(d.amount).toLocaleString() + '</div></div>' +
      '<div style="display:flex;flex-direction:column;gap:4px;margin-left:6px;">' +
        (isDue ? '<button onclick="executeDCA(' + i + ')" title="บันทึกว่าซื้อแล้ว + เลื่อนวันถัดไป" style="background:var(--green-bg);border:none;color:var(--green);cursor:pointer;font-size:11px;border-radius:6px;padding:2px 6px;font-weight:600;">ซื้อ ✓</button>' : '') +
        '<button onclick="editDCA(' + i + ')" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:13px;">✏️</button>' +
        '<button onclick="deleteDCA(' + i + ')" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:13px;">✕</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

async function deleteDCA(i) {
  const d = state.dcaSchedules[i];
  if (window.FB && d.id) await window.FB.del('dca', d.id);
  state.dcaSchedules.splice(i, 1);
  renderDCA();
  showToast('ลบแผน DCA แล้ว');
}

function editDCA(i) {
  const d = state.dcaSchedules[i];
  // Fill modal with existing values
  document.getElementById('d-ticker').value = d.ticker;
  document.getElementById('d-type').value = d.type;
  document.getElementById('d-amount').value = d.amount;
  document.getElementById('d-freq').value = d.freq;
  const dNext = document.getElementById('d-next');
  if (dNext) dNext.value = d.nextISO || todayISO(); // เติมวันเดิม — ไม่งั้นแก้ไขแล้ววันถัดไปโดนรีเซ็ตเป็นวันนี้
  // Store index being edited
  document.getElementById('dca-modal').dataset.editIndex = i;
  openModal('dca-modal');
}

function openAddDcaModal() {
  const modal = document.getElementById('dca-modal');
  delete modal.dataset.editIndex;
  document.getElementById('d-ticker').value = '';
  document.getElementById('d-type').value = 'set';
  document.getElementById('d-amount').value = '';
  document.getElementById('d-freq').value = 'รายเดือน';
  const dNext = document.getElementById('d-next');
  if (dNext) dNext.value = todayISO();
  openModal('dca-modal');
}

async function saveDCA() {
  const ticker = document.getElementById('d-ticker').value.trim().toUpperCase();
  const type = document.getElementById('d-type').value;
  const amount = parseFloat(document.getElementById('d-amount').value);
  const freq = document.getElementById('d-freq').value;
  const nextRaw = document.getElementById('d-next').value;
  if (!ticker || !amount) { showToast('กรุณากรอกข้อมูลให้ครบ'); return; }
  const nextISO = nextRaw || '';

  const modal = document.getElementById('dca-modal');
  const editIndex = modal.dataset.editIndex;

  if (editIndex !== undefined && editIndex !== '') {
    // Edit mode - update in place (FB.update, not del+add, so the doc id/history stays intact)
    const i = parseInt(editIndex);
    const existing = state.dcaSchedules[i];
    const patch = { ticker, type, amount, freq, nextISO, anchorDay: nextISO ? +nextISO.slice(8, 10) : null };
    if (window.FB && existing.id) {
      await window.FB.update('dca', existing.id, patch);
    } else {
      state.dcaSchedules[i] = { ...existing, ...patch };
      renderDCA();
    }
    showToast('แก้ไขแผน DCA แล้ว: ' + ticker);
  } else {
    // Add mode
    const data = { ticker, type, amount, freq, nextISO, anchorDay: nextISO ? +nextISO.slice(8, 10) : null, boughtCount: 0, boughtTotalAmount: 0, boughtTotalQty: 0 };
    if (window.FB) {
      await window.FB.add('dca', data);
    } else {
      state.dcaSchedules.push(data);
      renderDCA();
    }
    showToast('เพิ่มแผน DCA แล้ว: ' + ticker);
  }

  // Reset modal state
  delete modal.dataset.editIndex;
  closeModal('dca-modal');
}

// --- Execute DCA in 1 click: log trade + update holding + roll next date forward ---
async function executeDCA(i) {
  const d = state.dcaSchedules[i];
  if (!d) return;
  if (!confirm('บันทึกว่าซื้อ ' + d.ticker + ' ฿' + Number(d.amount).toLocaleString() + ' ตามแผน DCA แล้ว?')) return;

  const h = findHoldingForTrade(d.ticker.toUpperCase(), '');
  const price = h ? (h.livePrice || h.avgPrice) : null;
  if (h && price) {
    const qty = d.amount / (h.currency === 'USD' ? price * fxRate(h) : price);
    const dateISOVal = todayISO();
    const trade = {
      type: 'BUY', asset: d.ticker.toUpperCase(), price, priceDisplay: h.currency === 'USD' ? `$${price}` : `฿${price}`,
      qty, currency: h.currency, totalThb: Math.round(d.amount), fee: 0,
      dateStr: new Date(dateISOVal).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
      dateISO: dateISOVal, broker: h.broker || '', dcaAuto: true
    };
    if (window.FB) await window.FB.add('trades', trade);
    else { state.trades.unshift(trade); renderTrades(); }
    await syncHoldingFromTrade('BUY', d.ticker.toUpperCase(), price, qty, 1, h.broker || '');
  } else {
    showToast('⚠️ ไม่พบราคาปัจจุบันของ ' + d.ticker + ' — บันทึกแค่การเลื่อนวันถัดไป');
  }

  // แผนเก่าไม่มี anchorDay → ใช้วันของ nextISO ปัจจุบันเป็นวันตั้งต้น
  const anchorDay = d.anchorDay || +(d.nextISO || todayISO()).slice(8, 10);
  const nextISO = dcaNextFrom(d.nextISO || todayISO(), d.freq, anchorDay);
  const patch = {
    nextISO, anchorDay,
    boughtCount: (d.boughtCount || 0) + 1,
    boughtTotalAmount: (d.boughtTotalAmount || 0) + Number(d.amount),
    boughtTotalQty: (d.boughtTotalQty || 0) + (h && price ? d.amount / (h.currency === 'USD' ? price * fxRate(h) : price) : 0)
  };
  if (window.FB && d.id) await window.FB.update('dca', d.id, patch);
  else { state.dcaSchedules[i] = { ...d, ...patch }; renderDCA(); }
  showToast('✅ ซื้อ ' + d.ticker + ' ตามแผนแล้ว — ครั้งถัดไป ' + dcaDisplayDate(nextISO));
}

// --- Fund News via AI ---

// --- Budget Render ---
const EXPENSE_COLORS = ['#D95070','#F59E0B','#1D4ED8','#7E22CE','#16A34A','#AAB0BB','#C2410C','#0F766E'];

// ─── งบประมาณ = "แผน" / 🧾 บิล = "ของจริง" — หน้านี้เทียบสองอย่างให้อัตโนมัติ ───
// รายการงบเก่าที่พิมพ์ชื่อหมวดเอง (เช่น "ค่าเช่า") จับคู่เข้าหมวดของบิลด้วยคำค้น จนกว่าจะเลือกหมวดเองในหน้าแก้ไข
const BUDGET_CAT_GUESS = [
  ['food', /อาหาร|ข้าว|กิน|กาแฟ|เครื่องดื่ม|ขนม|food|cafe|coffee/i],
  ['transport', /เดินทาง|รถ|น้ำมัน|bts|mrt|grab|bolt|แท็กซี่|ทางด่วน|จอดรถ|transport|taxi/i],
  ['housing', /เช่า|บ้าน|คอนโด|หอ|ที่พัก|ส่วนกลาง|rent|condo/i],
  ['bills', /ไฟ|น้ำ|เน็ต|อินเทอร์เน็ต|โทรศัพท์|มือถือ|บิล|internet|wifi|ais|true|dtac/i],
  ['health', /ยา|หมอ|โรงพยาบาล|สุขภาพ|ฟิตเนส|ยิม|gym|clinic/i],
  ['travel', /เที่ยว|ทริป|ตั๋วเครื่องบิน|โรงแรม|ทัวร์|travel|trip|hotel|flight/i],
  ['donation', /ทำบุญ|บริจาค|วัด|มูลนิธิ|donat/i],
  ['gamble', /หวย|ลอตเตอรี่|ล็อตเตอรี่|สลาก|เสี่ยงโชค|lotto|lottery/i],
  ['entertainment', /หนัง|เกม|netflix|spotify|youtube|บันเทิง|ปาร์ตี้|game/i],
  ['education', /เรียน|คอร์ส|หนังสือ|การศึกษา|course/i],
  ['family', /พ่อ|แม่|ครอบครัว|ให้|ลูก/i],
  ['insurance', /ประกัน|ภาษี|insurance|tax/i],
  ['business', /ธุรกิจ|กิจการ|business/i],
  ['shopping', /ช้อป|เสื้อ|ของใช้|shopping|shopee|lazada/i]
];
function budgetCatKey(e) {
  if (e.billCat) return e.billCat;
  const hit = BUDGET_CAT_GUESS.find(([, re]) => re.test(e.cat || ''));
  return hit ? hit[0] : 'other';
}
// หมวดที่ตั้งงบได้ = หมวดรายจ่ายของบิล ยกเว้นลงทุน (ใช้แผน DCA) และจ่ายบิลบัตร (ไม่ใช่รายจ่าย)
function budgetCats() {
  return typeof BILL_CATS === 'undefined' ? [] : BILL_CATS.expense.filter(c => c.key !== 'invest' && c.key !== 'cc_payment');
}

function renderBudget() {
  const now = new Date();
  const ym = isoFromDate(now).slice(0, 7);
  document.getElementById('budgetMonth').textContent = now.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }) + ' · แผน เทียบ ของจริงจาก 🧾 บิล';
  const linked = typeof billMonthTotals === 'function';
  const act = linked ? billMonthTotals(ym) : null;
  const hasAct = !!(act && act.count);

  const planExp = state.budgetExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  // DCA ต่อเดือนปรับตามความถี่ — ตัวเลขเดียวกับแท็บบิลและหน้าลงทุน
  const planDca = dcaMonthly();
  const planInc = state.budgetIncome || 0;
  const planLeft = planInc - planExp - planDca;
  const pctOf = (v, base) => base > 0 ? Math.round(v / base * 100) + '%' : '—';
  const f0 = v => '฿' + Math.round(v || 0).toLocaleString();
  const vsPlan = (actual, plan, lowerIsGood) => {
    if (!plan) return '';
    const p = Math.round(actual / plan * 100);
    const bad = lowerIsGood ? p > 100 : p < 100;
    return ` · <span style="color:${bad ? 'var(--red)' : 'var(--green)'};">${p}% ของแผน</span>`;
  };

  let html;
  if (hasAct) {
    const actLeft = act.income - act.consumption - act.invest; // เหลือในบัญชีจริง
    html = `
    <div class="metric" style="cursor:pointer;" onclick="editIncome()">
      <div class="metric-label">รายได้ <span style="color:var(--accent);font-size:9px;">✏️ แก้แผน</span></div>
      <div class="metric-value">${f0(act.income)}</div>
      <div class="metric-sub">แผน ${planInc ? f0(planInc) : '— แตะเพื่อตั้ง'}${vsPlan(act.income, planInc, false)}</div>
    </div>
    <div class="metric"><div class="metric-label">รายจ่าย (จริง)</div><div class="metric-value neg">${f0(act.consumption)}</div><div class="metric-sub">งบ ${f0(planExp)}${vsPlan(act.consumption, planExp, true)}</div></div>
    <div class="metric" style="cursor:pointer;" onclick="budgetGoBills('cat','invest')"><div class="metric-label">ลงทุน (จริง) <span style="color:var(--accent);">›</span></div><div class="metric-value pos">${f0(act.invest)}</div><div class="metric-sub">แผน DCA ${f0(planDca)}${vsPlan(act.invest, planDca, false)}</div></div>
    <div class="metric"><div class="metric-label">เหลือในบัญชี</div><div class="metric-value ${actLeft >= 0 ? 'pos' : 'neg'}">${f0(actLeft)}</div><div class="metric-sub">แผน ${f0(planLeft)} · รายได้ − จ่าย − ลงทุน</div></div>`;
  } else {
    html = `
    <div class="metric" style="cursor:pointer;" onclick="editIncome()">
      <div class="metric-label">รายได้ต่อเดือน <span style="color:var(--accent);font-size:9px;">✏️ แก้ไข</span></div>
      <div class="metric-value" id="incomeDisplay">${planInc ? f0(planInc) : 'กรอกรายได้'}</div>
      <div class="metric-sub">แผน · หลังหักภาษี</div>
    </div>
    <div class="metric"><div class="metric-label">งบรายจ่าย</div><div class="metric-value neg">${f0(planExp)}</div><div class="metric-sub">${pctOf(planExp, planInc)} ของรายได้</div></div>
    <div class="metric"><div class="metric-label">แผนลงทุน (DCA)</div><div class="metric-value pos">${f0(planDca)}</div><div class="metric-sub">${pctOf(planDca, planInc)} ของรายได้</div></div>
    <div class="metric"><div class="metric-label">คงเหลือตามแผน</div><div class="metric-value ${planLeft >= 0 ? 'pos' : 'neg'}">${f0(planLeft)}</div><div class="metric-sub">${linked ? 'ยังไม่มีรายการจริงเดือนนี้ใน 🧾 บิล' : pctOf(planLeft, planInc) + ' ของรายได้'}</div></div>`;
  }
  document.getElementById('budgetMetrics').innerHTML = html;
  renderBudgetCategories(act);
  renderBudgetSavings();
}

// งบแต่ละหมวด เทียบที่ใช้จริงเดือนนี้ — หลายรายการงบในหมวดเดียวกันรวมกันเป็นงบของหมวด
function renderBudgetCategories(act) {
  const el = document.getElementById('expenseList');
  const f0 = v => '฿' + Math.round(v || 0).toLocaleString();
  const groups = {};
  state.budgetExpenses.forEach((e, i) => {
    const k = budgetCatKey(e);
    (groups[k] = groups[k] || { plan: 0, items: [] }).plan += Number(e.amount || 0);
    groups[k].items.push({ e, i });
  });
  const spent = act ? act.byCat : {};
  const keys = Object.keys(groups).sort((a, b) => groups[b].plan - groups[a].plan);
  // หมวดที่ใช้จริงแต่ไม่ได้ตั้งงบ — โชว์แยกให้เห็นรายจ่ายนอกแผน
  const extra = Object.keys(spent).filter(k => !groups[k] && spent[k] > 0).sort((a, b) => spent[b] - spent[a]);
  if (!keys.length && !extra.length) {
    el.innerHTML = `<div style="text-align:center;padding:20px 0;color:var(--text3);font-size:12px;">ยังไม่ได้ตั้งงบ<br><button onclick="budgetOpenExpense()" class="btn-primary" style="margin-top:8px;font-size:11px;padding:5px 14px;">+ ตั้งงบหมวดแรก</button></div>`;
    return;
  }
  const catOf = k => (typeof billCat === 'function' ? billCat(k, 'expense') : { icon: '📦', label: k, color: '#AAB0BB' });
  let html = '';
  keys.forEach(k => {
    const g = groups[k], c = catOf(k), used = spent[k] || 0;
    const pct = g.plan > 0 ? used / g.plan * 100 : 0;
    const over = used > g.plan;
    const status = !act ? '' : over
      ? `<span style="color:var(--red);font-weight:600;">เกิน ${f0(used - g.plan)}</span>`
      : `<span style="color:var(--text3);">เหลือ ${f0(g.plan - used)}</span>`;
    html += `<div style="padding:9px 0;border-bottom:0.5px solid var(--bg2);">
      <div class="bill-tap" onclick="budgetGoBills('cat',${esc(JSON.stringify(k))})" title="แตะเพื่อดูรายการจริง" style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px;padding:2px 0;">
        <span>${c.icon} ${esc(c.label)} <span style="color:var(--text3);">›</span></span>
        <span><strong>${f0(used)}</strong> <span style="color:var(--text3);">/ ${f0(g.plan)}</span></span>
      </div>
      <div class="bar-track" style="margin:6px 0 4px;"><div class="bar-fill" style="width:${Math.min(100, pct).toFixed(1)}%;background:${over ? 'var(--red)' : pct > 85 ? 'var(--amber)' : c.color};"></div></div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11px;">
        <span style="display:flex;flex-wrap:wrap;gap:4px;">${g.items.map(({ e, i }) =>
          `<span class="bill-card-chip" style="font-size:10.5px;padding:2px 4px 2px 8px;cursor:pointer;" onclick="budgetOpenExpense(${i})" title="แตะเพื่อแก้">${esc(e.name || e.cat || c.label)} ${f0(e.amount)}${e.billCat ? '' : ' <span style="color:var(--amber);" title="จับคู่หมวดอัตโนมัติ — แตะเพื่อตรวจ">•</span>'}<button onclick="event.stopPropagation();deleteExpense(${i})">✕</button></span>`).join('')}</span>
        <span style="white-space:nowrap;">${status}</span>
      </div>
    </div>`;
  });
  if (extra.length) {
    html += `<div style="font-size:10.5px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.4px;margin:12px 0 4px;">ใช้จ่ายนอกงบ</div>`;
    extra.forEach(k => {
      const c = catOf(k);
      html += `<div class="bill-tap" onclick="budgetGoBills('cat',${esc(JSON.stringify(k))})" style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0;">
        <span>${c.icon} ${esc(c.label)} <span style="color:var(--text3);">›</span></span>
        <span><strong>${f0(spent[k])}</strong> <button class="action" style="font-size:10.5px;color:var(--accent);background:none;border:none;cursor:pointer;" onclick="event.stopPropagation();budgetOpenExpense(null,${esc(JSON.stringify(k))})">+ ตั้งงบ</button></span></div>`;
    });
  }
  if (state.budgetExpenses.some(e => !e.billCat)) html += '<div style="font-size:10.5px;color:var(--text3);margin-top:8px;"><span style="color:var(--amber);">•</span> = จับคู่หมวดให้อัตโนมัติจากชื่อเดิม แตะเพื่อตรวจ/เปลี่ยนหมวด</div>';
  el.innerHTML = html;
}

function renderBudgetSavings() {
  document.getElementById('savingsList').innerHTML = state.budgetSavings.map((s, i) => {
    const pct = Math.min(100, Math.round(s.current / s.target * 100));
    return `<div>
      <div class="progress-meta">
        <span>${esc(s.name)}</span>
        <div style="display:flex;align-items:center;gap:8px;">
          <strong style="color:${s.color}">฿${Number(s.current).toLocaleString()} / ฿${Number(s.target).toLocaleString()}</strong>
          <button onclick="deleteSaving(${i})" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:11px;">✕</button>
        </div>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${s.color};"></div></div>
      <div class="bar-note">${pct}% ของเป้าหมาย</div>
    </div>`;
  }).join('');
}

// จากหน้างบ → ไปแท็บบิล เดือนปัจจุบัน แล้วกรองให้เห็นรายการจริงของหมวดนั้น
function budgetGoBills(kind, value) {
  billState.view = 'month';
  billState.month = todayISO().slice(0, 7);
  billResetListDate();
  showPage('bills');
  billDrill(kind, value);
}

function editIncome() {
  const val = prompt('กรอกรายได้ต่อเดือน (฿)', state.budgetIncome || '');
  if (val === null) return;
  const num = parseFloat(val.replace(/,/g, ''));
  if (!isNaN(num) && num >= 0) {
    state.budgetIncome = num;
    localStorage.setItem('folio_budgetIncome', String(num));
    if (window.FB) window.FB.setDoc('settings', 'budget', { income: num }).catch(() => {});
    renderBudget();
    showToast('อัพเดทรายได้แล้ว');
  }
}

// เปิดฟอร์มงบ: idx = แก้รายการเดิม, presetCat = ตั้งงบให้หมวดที่ใช้จ่ายนอกงบ
function budgetOpenExpense(idx, presetCat) {
  const e = idx != null ? state.budgetExpenses[idx] : null;
  const cur = e ? budgetCatKey(e) : (presetCat || 'food');
  document.getElementById('exp-edit-idx').value = idx != null ? String(idx) : '';
  document.getElementById('exp-modal-title').textContent = e ? 'แก้ไขงบ' : 'ตั้งงบรายจ่าย';
  document.getElementById('exp-billcat').innerHTML = budgetCats().map(c => `<option value="${c.key}" ${c.key === cur ? 'selected' : ''}>${c.icon} ${esc(c.label)}</option>`).join('');
  document.getElementById('exp-cat').value = e ? (e.name || (e.billCat ? '' : e.cat) || '') : '';
  document.getElementById('exp-amount').value = e ? e.amount : '';
  openModal('expense-modal');
}

async function addExpense() {
  const billCatKey = document.getElementById('exp-billcat').value;
  const name = document.getElementById('exp-cat').value.trim();
  const amount = parseFloat(document.getElementById('exp-amount').value);
  if (!billCatKey || !(amount > 0)) { showToast('เลือกหมวดและใส่งบให้ครบ'); return; }
  const label = typeof billCat === 'function' ? billCat(billCatKey, 'expense').label : billCatKey;
  const idxStr = document.getElementById('exp-edit-idx').value;
  const data = { billCat: billCatKey, name, cat: name || label, amount };
  if (idxStr !== '') {
    const e = state.budgetExpenses[+idxStr];
    if (window.FB && e.id) await window.FB.update('budget_expenses', e.id, data);
    else { Object.assign(e, data); renderBudget(); }
  } else {
    data.color = EXPENSE_COLORS[state.budgetExpenses.length % EXPENSE_COLORS.length];
    if (window.FB) await window.FB.add('budget_expenses', data);
    else { state.budgetExpenses.push(data); renderBudget(); }
  }
  closeModal('expense-modal');
  showToast((idxStr !== '' ? 'แก้งบแล้ว: ' : 'ตั้งงบแล้ว: ') + (name || label));
}

async function deleteExpense(i) {
  const e = state.budgetExpenses[i];
  if (!e || !confirm('ลบงบ ' + (e.name || e.cat) + ' ฿' + Number(e.amount).toLocaleString() + ' ?')) return;
  if (window.FB && e.id) await window.FB.del('budget_expenses', e.id); // listener อัปเดต state + จอเอง — ห้าม splice ซ้ำ ไม่งั้นหายสองรายการ
  else { state.budgetExpenses.splice(i, 1); renderBudget(); }
}

async function addSaving() {
  const name = document.getElementById('sav-name').value.trim();
  const current = parseFloat(document.getElementById('sav-current').value) || 0;
  const target = parseFloat(document.getElementById('sav-target').value);
  if (!name || !target) { showToast('กรุณากรอกข้อมูลให้ครบ'); return; }
  const color = EXPENSE_COLORS[state.budgetSavings.length % EXPENSE_COLORS.length];
  const data = { name, current, target, color };
  if (window.FB) await window.FB.add('budget_savings', data);
  else { state.budgetSavings.push(data); renderBudget(); }
  closeModal('saving-modal');
  showToast('เพิ่มเป้าหมายออมแล้ว: ' + name);
}

async function deleteSaving(i) {
  const s = state.budgetSavings[i];
  if (window.FB && s.id) await window.FB.del('budget_savings', s.id);
  else { state.budgetSavings.splice(i, 1); renderBudget(); }
}

// --- Add Holding ---
document.getElementById('h-broker').addEventListener('change', function() {
  document.getElementById('h-broker-custom').style.display = this.value === 'other' ? '' : 'none';
});

function onHoldingTypeChange() {
  const type = document.getElementById('h-type').value;
  const isFund = type === 'fund';
  document.getElementById('h-ticker-group').style.display = isFund ? 'none' : '';
  document.getElementById('h-name-group').style.display = isFund ? '' : 'none';
  document.getElementById('h-fund-region-group').style.display = isFund ? '' : 'none';
  var taxGroup = document.getElementById('h-tax-group');
  if (taxGroup) taxGroup.style.display = isFund ? '' : 'none';
  document.getElementById('h-ticker-label').textContent = 'Ticker';
}

function onTaxTypeChange() {
  var t = document.getElementById('h-tax-type').value;
  var yearEl = document.getElementById('h-tax-year');
  var hintEl = document.getElementById('h-tax-hint');
  if (yearEl) yearEl.style.display = t === 'SSF' ? '' : 'none';
  if (hintEl) hintEl.style.display = t ? '' : 'none';
}

// ล้างฟอร์ม holding กลับเป็นโหมดเพิ่มใหม่ — กันค่าค้างจากการแก้ไขครั้งก่อน
function resetHoldingForm() {
  document.getElementById('h-edit-id').value = '';
  document.getElementById('h-ticker').value = '';
  document.getElementById('h-name-input').value = '';
  document.getElementById('h-shares').value = '';
  document.getElementById('h-price').value = '';
  document.getElementById('h-currency').value = 'THB';
  document.getElementById('h-type').value = 'set';
  document.getElementById('h-broker').value = '';
  document.getElementById('h-broker-custom').value = '';
  document.getElementById('h-broker-custom').style.display = 'none';
  document.getElementById('h-fund-region').value = 'thai';
  var _ht = document.getElementById('h-tax-type'); if (_ht) _ht.value = '';
  var _hy = document.getElementById('h-tax-year'); if (_hy) { _hy.value = ''; _hy.style.display = 'none'; }
  var _hh = document.getElementById('h-tax-hint'); if (_hh) _hh.style.display = 'none';
  onHoldingTypeChange();
}

function openHoldingModal(editId) {
  if (!editId) resetHoldingForm(); // โหมดแก้ไข: editHoldingGroup เติมฟอร์มไว้แล้วก่อนเรียก
  document.getElementById('h-edit-id').value = editId || '';
  const isEdit = !!editId;
  document.getElementById('h-modal-title').textContent = isEdit ? 'แก้ไขหลักทรัพย์' : 'เพิ่มหลักทรัพย์';
  document.getElementById('h-submit-btn').textContent = isEdit ? 'บันทึกการแก้ไข' : 'เพิ่มหลักทรัพย์';
  openModal('holding-modal');
}

function editHoldingGroup(gi) {
  const group = (window._holdingGroups || [])[gi];
  if (!group) return;
  // For grouped (merged) entries, edit the first one only
  const firstEntry = state.holdings.find(h => h.id === group._ids[0].id) || group;
  // Pre-fill form
  document.getElementById('h-type').value = firstEntry.type || 'set';
  onHoldingTypeChange();
  if (firstEntry.type === 'fund') {
    document.getElementById('h-name-input').value = firstEntry.name || '';
    document.getElementById('h-fund-region').value = firstEntry.fundRegion || 'thai';
    var _et = document.getElementById('h-tax-type');
    var _ey = document.getElementById('h-tax-year');
    if (_et) { _et.value = firstEntry.taxType || ''; onTaxTypeChange(); }
    if (_ey) _ey.value = firstEntry.taxYear || '';
  } else {
    document.getElementById('h-ticker').value = firstEntry.ticker || '';
  }
  document.getElementById('h-shares').value = firstEntry.shares || '';
  document.getElementById('h-price').value = firstEntry.avgPrice || '';
  document.getElementById('h-currency').value = firstEntry.currency || 'THB';
  const knownBrokers = ['KBANK','InnovestX','Settrade','KKPAM','SCB','Bualuang','Bitkub','Binance','OKX','Bybit','Coinbase','Interactive Brokers','Webull','Tastytrade'];
  const b = firstEntry.broker || '';
  if (knownBrokers.includes(b)) {
    document.getElementById('h-broker').value = b;
    document.getElementById('h-broker-custom').style.display = 'none';
  } else if (b) {
    document.getElementById('h-broker').value = 'other';
    document.getElementById('h-broker-custom').value = b;
    document.getElementById('h-broker-custom').style.display = '';
  } else {
    document.getElementById('h-broker').value = '';
  }
  openHoldingModal(firstEntry.id || '__local__' + group._ids[0].i);
}

async function addHolding() {
  const type = document.getElementById('h-type').value;
  const isFund = type === 'fund';
  const fundName = document.getElementById('h-name-input').value.trim();
  const tickerRaw = document.getElementById('h-ticker').value.trim().toUpperCase();
  // For funds: ticker = sanitized fund name (no spaces), name = full fund name
  const ticker = isFund ? fundName.replace(/\s+/g, '_').toUpperCase() : tickerRaw;
  const name = isFund ? fundName : tickerRaw;
  if (!ticker || !name) { showToast(isFund ? 'กรุณากรอกชื่อกองทุน' : 'กรุณากรอก Ticker'); return; }
  const shares = parseFloat(document.getElementById('h-shares').value);
  const price = parseFloat(document.getElementById('h-price').value);
  const currency = document.getElementById('h-currency').value;
  if (!shares || !price) { showToast('กรุณากรอกข้อมูลให้ครบ'); return; }
  const brokerSelect = document.getElementById('h-broker').value;
  const brokerCustom = document.getElementById('h-broker-custom').value.trim();
  const broker = brokerSelect === 'other' ? (brokerCustom || 'อื่นๆ') : brokerSelect;
  const fundRegion = type === 'fund' ? document.getElementById('h-fund-region').value : '';
  const taxTypeEl = document.getElementById('h-tax-type');
  const taxYearEl = document.getElementById('h-tax-year');
  const taxType = (type === 'fund' && taxTypeEl) ? taxTypeEl.value : '';
  const taxYear = (taxType === 'SSF' && taxYearEl && taxYearEl.value) ? parseInt(taxYearEl.value, 10) : null;
  const data = { ticker, name, type, shares, avgPrice: price, currency, broker, fundRegion, taxType, taxYear, value: Math.round(shares * price * (currency === 'USD' ? (state.usdThb || 33) : 1)) };
  const editId = document.getElementById('h-edit-id').value;
  const isEdit = editId && !editId.startsWith('__local__');
  // change/dca ไม่ได้อยู่ในฟอร์ม — ตั้งค่าเริ่มต้นเฉพาะตอนเพิ่มใหม่ ตอนแก้ไขห้ามทับค่าเดิม
  if (!isEdit) { data.change = 0; data.dca = false; }
  try {
    if (isEdit && window.FB) {
      await window.FB.update('holdings', editId, data);
    } else if (window.FB) {
      await window.FB.add('holdings', data);
    } else {
      if (isEdit) {
        const idx = state.holdings.findIndex((h,i) => (h.id === editId) || ('__local__'+i === editId));
        if (idx >= 0) state.holdings[idx] = { ...state.holdings[idx], ...data };
      } else {
        state.holdings.push(data);
      }
      renderHoldings();
    }
  } catch(err) {
    showToast('เกิดข้อผิดพลาด: ' + (err.message || 'ไม่สามารถบันทึกได้'));
    return;
  }
  closeModal('holding-modal');
  resetHoldingForm();
  showToast((isEdit ? 'อัพเดตแล้ว: ' : 'เพิ่มหลักทรัพย์แล้ว: ') + name);
  // Sync Qty + AvgCost back to Portfolio_NAV sheet
  const base = window._PORTFOLIO_SHEET_URL || localStorage.getItem('folio_PORTFOLIO_SHEET_URL') || '';
  if (base) {
    const params = new URLSearchParams({
      action: 'update_holding',
      asset: name,
      platform: broker,
      tradeType: 'SET',
      qty: String(shares),
      price: String(price)
    });
    fetch(base + '?' + params.toString()).catch(() => {});
  }
}

// --- Trade: save / edit / delete ---
// --- Holdings sync helper (direction: +1=apply, -1=reverse) ---
function findHoldingForTrade(asset, broker) {
  const nameMatched = state.holdings.filter(h => (h.ticker || h.name || '').toUpperCase() === asset);
  if (!nameMatched.length) return null;
  // Prefer broker-specific match when broker is provided; fall back to first name match only if no broker hit
  const matched = broker
    ? nameMatched.filter(h => (h.broker || '').toLowerCase() === broker.toLowerCase())
    : [];
  return (matched.length ? matched : nameMatched)[0];
}

async function syncHoldingFromTrade(type, asset, price, qty, direction, broker) {
  const h = findHoldingForTrade(asset, broker);
  if (!h) return false;
  if (!h.id || !window.FB) return false;
  if (type === 'BUY') {
    if (direction === 1) {
      // Apply BUY: add qty, recalc weighted avg
      const newShares = parseFloat((h.shares + qty).toFixed(4));
      const newAvg = parseFloat(((h.avgPrice * h.shares + price * qty) / (h.shares + qty)).toFixed(4));
      await window.FB.update('holdings', h.id, { shares: newShares, avgPrice: newAvg });
      const amountThb = h.currency === 'USD' ? price * qty * (state.usdThb || 33) : price * qty;
      yoyAddBuy(amountThb);
    } else {
      // Reverse BUY: remove qty, recalc avg (reverse weighted avg)
      const newShares = parseFloat((h.shares - qty).toFixed(4));
      if (newShares < 0) return false;
      const newAvg = newShares > 0
        ? parseFloat(((h.avgPrice * h.shares - price * qty) / newShares).toFixed(4))
        : h.avgPrice;
      await window.FB.update('holdings', h.id, { shares: newShares, avgPrice: Math.max(0, newAvg) });
      const amountThb = h.currency === 'USD' ? price * qty * (state.usdThb || 33) : price * qty;
      yoyAddSell(amountThb);
    }
  } else if (type === 'SELL') {
    if (direction === 1) {
      // Apply SELL: reduce qty
      const newShares = parseFloat((h.shares - qty).toFixed(4));
      if (newShares < 0) return false;
      await window.FB.update('holdings', h.id, { shares: newShares });
      const amountThb = h.currency === 'USD' ? price * qty * (state.usdThb || 33) : price * qty;
      yoyAddSell(amountThb);
    } else {
      // Reverse SELL: add qty back
      const newShares = parseFloat((h.shares + qty).toFixed(4));
      await window.FB.update('holdings', h.id, { shares: newShares });
      const amountThb = h.currency === 'USD' ? price * qty * (state.usdThb || 33) : price * qty;
      yoyAddBuy(amountThb);
    }
  }
  return true;
}

async function saveTrade() {
  const editId = document.getElementById('t-edit-id').value;
  const type = document.getElementById('t-type').value;
  const asset = document.getElementById('t-asset').value.trim().toUpperCase();
  const price = parseFloat(document.getElementById('t-price').value);
  const amountEl = document.getElementById('t-amount');
  const amount = amountEl ? parseFloat(amountEl.value) : NaN;
  const currency = document.getElementById('t-currency').value;
  // ช่อง "จำนวนเงิน" เป็น ฿ เสมอ — ถ้าราคาเป็น USD ต้องแปลงเป็น THB ก่อนหาร ไม่งั้น qty ผิด ~33 เท่า
  const priceThb = currency === 'USD' ? price * (state.usdThb || 33) : price;
  const qty = (price && amount) ? amount / priceThb : NaN;
  const dateRaw = document.getElementById('t-date').value;
  const broker = (document.getElementById('t-broker') ? document.getElementById('t-broker').value.trim() : '') || '';
  if (!asset || !price || !amount || isNaN(qty)) { showToast('กรุณากรอกข้อมูลให้ครบ'); return; }
  const feeEl = document.getElementById('t-fee');
  const fee = feeEl && feeEl.value ? parseFloat(feeEl.value) : 0;
  const dateISOVal = dateRaw || todayISO();
  const dateStr = new Date(dateISOVal).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  const totalThb = Math.round(amount);
  const priceDisplay = currency === 'USD' ? `$${price}` : `฿${price}`;
  const data = { type, asset, price, priceDisplay, qty, currency, totalThb, fee, dateStr, dateISO: dateISOVal, broker };
  // เก็บต้นทุนของจำนวนที่ขาย ณ ตอนบันทึก — ใช้คำนวณ realized P&L ที่ถูกต้อง
  if (type === 'SELL') {
    const hSell = findHoldingForTrade(asset, broker);
    if (hSell && hSell.avgPrice > 0) data.costBasisThb = Math.round(qty * hSell.avgPrice * fxRate(hSell));
  }

  if (editId) {
    // EDIT MODE: reverse old trade, apply new trade
    const old = state.trades.find(t => t.id === editId);
    if (old) await syncHoldingFromTrade(old.type, old.asset, old.price, old.qty, -1, old.broker);
    if (window.FB) await window.FB.update('trades', editId, data);
    await syncHoldingFromTrade(type, asset, price, qty, 1, broker);
    showToast(`✅ แก้ไข trade ${asset} แล้ว`);
    // Sheet: ย้อน trade เดิมก่อน แล้วค่อยส่งตัวใหม่ (ต้องเรียงลำดับ ไม่งั้น avg cost เพี้ยน)
    (async () => {
      if (old) await p17PostTradeToSheet(old, true);
      await p17PostTradeToSheet(data);
    })().catch(e => console.error('p17PostTradeToSheet:', e));
  } else {
    // ADD MODE
    if (window.FB) {
      await window.FB.add('trades', data);
    } else {
      state.trades.unshift(data);
      renderTrades();
    }
    const synced = await syncHoldingFromTrade(type, asset, price, qty, 1, broker);
    showToast(synced ? `✅ ${type==='BUY'?'ซื้อ':'ขาย'} ${asset} — อัพเดต port แล้ว` : `✅ บันทึก ${type} ${asset} (ไม่พบ holding — port ไม่เปลี่ยน)`);
    p17PostTradeToSheet(data).catch(e => console.error('p17PostTradeToSheet:', e));
  }
  closeModal('trade-modal');
  const _tfc = document.getElementById('t-fee'); if (_tfc) _tfc.value = '';
  const _tfa = document.getElementById('t-amount'); if (_tfa) _tfa.value = '';
  const _tfp = document.getElementById('t-qty-preview'); if (_tfp) _tfp.textContent = '';
}

function calcTradeQty() {
  const price = parseFloat(document.getElementById('t-price').value);
  const amountEl = document.getElementById('t-amount');
  const preview = document.getElementById('t-qty-preview');
  if (!preview) return;
  const amount = amountEl ? parseFloat(amountEl.value) : NaN;
  const currency = document.getElementById('t-currency') ? document.getElementById('t-currency').value : 'THB';
  const priceThb = currency === 'USD' ? price * (state.usdThb || 33) : price;
  if (price > 0 && amount > 0) {
    const qty = amount / priceThb;
    preview.textContent = '= ' + qty.toLocaleString('th-TH', { maximumFractionDigits: 6 }) + ' หน่วย'
      + (currency === 'USD' ? ' (rate ฿' + (state.usdThb || 33).toFixed(2) + '/$)' : '');
  } else {
    preview.textContent = '';
  }
}

function openEditTrade(id) {
  const t = state.trades.find(t => t.id === id);
  if (!t) return;
  document.getElementById('t-edit-id').value = id;
  document.getElementById('t-type').value = t.type;
  const _tfe = document.getElementById('t-fee'); if (_tfe) _tfe.value = t.fee || '';
  document.getElementById('t-asset').value = t.asset;
  document.getElementById('t-price').value = t.price;
  document.getElementById('t-currency').value = t.currency || 'THB';
  const amountEl = document.getElementById('t-amount');
  if (amountEl) { amountEl.value = t.totalThb || (t.price * t.qty) || ''; }
  calcTradeQty();
  document.getElementById('t-date').value = t.dateISO || '';
  const tb = document.getElementById('t-broker'); if (tb) tb.value = t.broker || '';
  document.getElementById('trade-modal-title').textContent = 'แก้ไขธุรกรรม';
  document.getElementById('trade-submit-btn').textContent = 'บันทึกการแก้ไข';
  openModal('trade-modal');
}

async function deleteTrade(id) {
  if (!confirm('ลบ trade นี้? holdings จะถูกปรับตาม')) return;
  const t = state.trades.find(t => t.id === id);
  if (t) await syncHoldingFromTrade(t.type, t.asset, t.price, t.qty, -1, t.broker);
  if (t) p17PostTradeToSheet(t, true).catch(e => console.error('p17PostTradeToSheet:', e));
  if (window.FB && id) {
    await window.FB.del('trades', id);
  } else {
    state.trades = state.trades.filter(t => t.id !== id);
    renderTrades();
  }
  showToast('🗑️ ลบ trade แล้ว — port อัพเดต');
}



// --- Render Trades ---
function renderTrades() {
  const tbody = document.getElementById('tradeLog');
  if (!state.trades.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text3);font-size:12px;">ยังไม่มีธุรกรรม -- กด + บันทึกธุรกรรม เพื่อเริ่มต้น</td></tr>';
  } else {
    tbody.innerHTML = state.trades.map(t => {
      const priceShow = t.priceDisplay || (t.currency === 'USD' ? `$${t.price}` : `฿${t.price}`);
      const totalShow = t.totalThb ? `฿${Number(t.totalThb).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}` : '--';
      return `<tr>
        <td>${esc(t.dateStr||'--')}</td>
        <td><span class="trade-type ${t.type==='BUY'?'buy':'sell'}">${t.type==='BUY'?'ซื้อ':'ขาย'}</span></td>
        <td>${esc(t.asset)}</td>
        <td>${esc(priceShow)}</td>
        <td>${esc(t.qty)}</td>
        <td style="color:var(--text2);font-size:11px;">${totalShow}${t.fee ? '<div style="font-size:9px;color:var(--text3);">fee ฿'+Number(t.fee).toLocaleString()+'</div>' : ''}</td>
        <td style="white-space:nowrap;">
          <button onclick="openEditTrade('${t.id}')" style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px 4px;" title="แก้ไข">✏️</button>
          <button onclick="deleteTrade('${t.id}')" style="background:none;border:none;cursor:pointer;font-size:14px;padding:2px 4px;" title="ลบ">🗑️</button>
        </td>
      </tr>`;
    }).join('');
  }
  const buys = state.trades.filter(t => t.type === 'BUY').length;
  const sells = state.trades.filter(t => t.type === 'SELL').length;
  const totalInv = state.trades
    .filter(t => t.type === 'BUY')
    .reduce((s, t) => s + (t.totalThb || 0), 0);
  const el = id => document.getElementById(id);
  if (el('tradeCount')) el('tradeCount').textContent = state.trades.length;
  if (el('buySellRatio')) el('buySellRatio').textContent = `${buys} / ${sells}`;
  if (el('totalInvested')) el('totalInvested').textContent = totalInv ? '฿' + Number(totalInv).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '฿0';
}

// --- Init ---
const ALLOC_LABELS = { set:'หุ้นไทย (SET)', us:'หุ้นสหรัฐ', crypto:'Crypto', tech:'Tech', fund:'กองทุน' };
const ALLOC_COLORS = { set:'#1D4ED8', us:'#C2410C', crypto:'#16A34A', tech:'#7C3AED', fund:'#B45309' };

function renderAllocation() {
  const el = document.getElementById('allocationChart');
  if (!el) return;
  if (!state.holdings.length) {
    el.innerHTML = '<div class="empty" style="padding:12px 0;">ยังไม่มีหลักทรัพย์</div>';
    return;
  }
  const totals = {};
  const total = state.holdings.reduce((s, h) => s + valueThb(h), 0);
  state.holdings.forEach(h => { totals[h.type] = (totals[h.type] || 0) + valueThb(h); });
  if (!total) { el.innerHTML = '<div class="empty" style="padding:12px 0;">ยังไม่มีมูลค่า — กด ✏️ ใส่ราคาก่อน</div>'; return; }
  el.innerHTML = Object.keys(totals)
    .sort((a, b) => totals[b] - totals[a])
    .map(type => {
      const pct = (totals[type] / total) * 100;
      return `<div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px;">
          <span style="color:var(--text2)">${esc(ALLOC_LABELS[type] || type)}</span><span style="font-weight:500">${pct.toFixed(1)}%</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct.toFixed(1)}%;background:${ALLOC_COLORS[type] || 'var(--accent)'};"></div></div>
      </div>`;
    }).join('');
}

function startApp() {
  setDate();
  restoreAiSection();
  p17RestoreExecTableState();
  renderHoldings();
  renderDCA();
  renderAllocation();
  renderTrades();
  const today = todayISO();
  const dNext = document.getElementById('d-next');
  const tDate = document.getElementById('t-date');
  if (dNext) dNext.value = today;
  if (tDate) tDate.value = today;
  window._folioReady = true;
  window.dispatchEvent(new Event('folio-ready'));
  if (loadPriceCache()) { updatePortfolioSummary(); renderHoldings(); renderAllocation(); initPhase9(); initPhase10(); initPhase11(); initPhase12(); }
}
