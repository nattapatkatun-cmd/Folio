// Folio — Bill Manager: หมวด, state, หน้า/แท็บ, ฟอร์มบันทึก, Gemini อ่านสลิป, ผ่อน/Subscription, สำรอง/นำเข้า CSV, แจ้งเตือน
// โหลดหลัง js/rewards.js
// แยกมาจาก index.html (เฟส 8) — เนื้อหาเดิมทุกบรรทัด ลำดับการโหลดต้องคงตาม <script src> ใน index.html

// ═══════════════════════════════════════════════════════════════════
// Bill Manager — บันทึกรายรับ/รายจ่ายจริง (users/nattapat/transactions)
// เก็บเฉพาะข้อมูลที่อ่านได้ ไม่เก็บรูป (Firestore จำกัดเอกสารละ 1MB)
// ═══════════════════════════════════════════════════════════════════

// key ภาษาอังกฤษเก็บลง Firestore (ไม่เปลี่ยน) — label/icon ใช้แสดงผลเท่านั้น
const BILL_CATS = {
  expense: [
    { key: 'food',          label: 'อาหาร/เครื่องดื่ม',  icon: '🍜', color: '#F59E0B' },
    { key: 'transport',     label: 'เดินทาง',            icon: '🚗', color: '#2563EB' },
    { key: 'shopping',      label: 'ช้อปปิ้ง',            icon: '🛍️', color: '#D95070' },
    { key: 'bills',         label: 'บิล/สาธารณูปโภค',     icon: '💡', color: '#0891B2' },
    { key: 'housing',       label: 'ที่พัก',              icon: '🏠', color: '#7C3AED' },
    { key: 'health',        label: 'สุขภาพ',              icon: '💊', color: '#16A34A' },
    { key: 'entertainment', label: 'บันเทิง',             icon: '🎬', color: '#C2410C' },
    { key: 'education',     label: 'การศึกษา',            icon: '📚', color: '#0F766E' },
    { key: 'family',        label: 'ครอบครัว/ให้',        icon: '🎁', color: '#BE185D' },
    { key: 'travel',        label: 'ท่องเที่ยว',          icon: '✈️', color: '#0EA5E9' },
    { key: 'donation',      label: 'บริจาค/ทำบุญ',        icon: '🙏', color: '#CA8A04' },
    { key: 'gamble',        label: 'เสี่ยงโชค',           icon: '🎰', color: '#DC2626' },
    { key: 'insurance',     label: 'ประกัน/ภาษี',         icon: '🛡️', color: '#475569' },
    { key: 'transfer',      label: 'โอนเงินทั่วไป',       icon: '🔁', color: '#94A3B8' },
    { key: 'business',      label: 'ธุรกิจส่วนตัว',        icon: '🏪', color: '#9333EA' },
    { key: 'invest',        label: 'ลงทุน/ออม',           icon: '📈', color: '#15803D' },
    { key: 'cc_payment',    label: 'จ่ายบิลบัตรเครดิต',   icon: '💳', color: '#64748B' },
    { key: 'other',         label: 'อื่น ๆ',              icon: '📦', color: '#AAB0BB' }
  ],
  income: [
    { key: 'salary',   label: 'เงินเดือน',        icon: '💼', color: '#16A34A' },
    { key: 'bonus',    label: 'โบนัส',            icon: '🎉', color: '#15803D' },
    { key: 'business_in', label: 'ธุรกิจส่วนตัว',   icon: '🏪', color: '#9333EA' },
    { key: 'side',     label: 'รายได้เสริม',      icon: '🧑‍💻', color: '#0891B2' },
    { key: 'dividend', label: 'ปันผล/ดอกเบี้ย',   icon: '🪙', color: '#B45309' },
    { key: 'refund',   label: 'เงินคืน (หาร/คืนสินค้า)', icon: '💸', color: '#7C3AED' },
    { key: 'other_in', label: 'อื่น ๆ',           icon: '📥', color: '#AAB0BB' }
  ]
};
// ─── หมวดรายจ่ายที่ผู้ใช้เพิ่มเอง (key ขึ้นต้น c_) — เก็บใน settings/bill + localStorage ───
// แทรกไว้ก่อน "ลงทุน/ออม" ให้อยู่กลุ่มเดียวกับหมวดรายจ่ายปกติ; ลบหมวดแล้วรายการเดิมจะแสดงเป็น "อื่น ๆ"
const BILL_CUSTOM_COLORS = ['#E11D48', '#0D9488', '#7C3AED', '#EA580C', '#2563EB', '#65A30D', '#DB2777', '#0891B2'];
function billCustomCats() {
  try { const a = JSON.parse(localStorage.getItem('folio_bill_custom_cats') || '[]'); return Array.isArray(a) ? a.filter(c => c && c.key && c.label) : []; } catch (e) { return []; }
}
function billApplyCustomCats() {
  const ex = BILL_CATS.expense;
  for (let i = ex.length - 1; i >= 0; i--) if (String(ex[i].key).startsWith('c_')) ex.splice(i, 1);
  const at = ex.findIndex(c => c.key === 'invest');
  ex.splice(at < 0 ? ex.length - 1 : at, 0, ...billCustomCats().map(c => ({ key: c.key, label: c.label, icon: c.icon || '🏷️', color: c.color || '#AAB0BB', custom: true })));
}
billApplyCustomCats();

// หมวดที่เงินคืนหักได้ = หมวดรายจ่าย ยกเว้นลงทุน/จ่ายบิลบัตร (ไม่ใช่ค่าใช้จ่าย)
function billOffsetCats() { return BILL_CATS.expense.filter(c => !BILL_NON_SPEND.includes(c.key)); }
// รายชื่อบัตรของผู้ใช้ (ช่วย AI จับคู่ชื่อบัตร + ใช้เป็นตัวเลือกในฟอร์ม)
function billCards() {
  return (localStorage.getItem('folio_bill_cards') || '').split(',').map(x => x.trim()).filter(Boolean);
}

// ─── เฟส 6d: แจ้งเตือนในแอป (ยังไม่ใช่ push — ต้องมี backend) ───
// แถบบนหน้าแรก: บัตรครบกำหนดใน 3 วัน (หรือเลยกำหนดยังไม่จ่าย) · งบหมวดใช้ไป ≥ 85% · Subscription จะตัดใน 3 วัน
// กด ✕ = ซ่อนเรื่องนั้นไปจนสิ้นวัน (เก็บที่ localStorage folio_alerts_dismissed) · ตั้งแถบไม่เกิน 5 รายการ
const ALERT_DAYS = 3, ALERT_BUDGET_PCT = 85, ALERT_MAX = 5;
function billAlerts() {
  const today = todayISO(), out = [];
  // 1) บัตรครบกำหนดชำระ
  try { billRwDues().forEach(x => {
    if (x.done || x.days > ALERT_DAYS) return;
    const due = Math.max(0, x.spent - x.paid);
    out.push({ key: 'due:' + x.prof.card + ':' + x.closed.end, level: x.days < 0 ? 'danger' : 'warn', sort: x.days, go: ['bills', 'cards'],
      text: `💳 ${x.prof.card} ${x.days < 0 ? 'เลยกำหนดชำระ ' + -x.days + ' วัน' : x.days === 0 ? 'ครบกำหนดชำระวันนี้' : 'ครบกำหนดชำระอีก ' + x.days + ' วัน'} · ยอด ${billFmt0(due)}` });
  }); } catch (e) {}
  // 2) งบหมวดเดือนนี้ใกล้เต็ม/เกิน (ยอดจริงหักเงินคืนแล้ว เทียบงบรวมของหมวดเดียวกัน)
  try {
    const ym = today.slice(0, 7), act = billMonthTotals(ym), bud = {};
    (state.budgetExpenses || []).forEach(e => { const k = budgetCatKey(e); bud[k] = (bud[k] || 0) + (Number(e.amount) || 0); });
    Object.keys(bud).forEach(k => {
      const b = bud[k], a = act.byCat[k] || 0;
      if (!(b > 0) || a / b * 100 < ALERT_BUDGET_PCT) return;
      const pct = Math.round(a / b * 100), c = billCat(k, 'expense');
      out.push({ key: 'bud:' + k + ':' + ym, level: a >= b ? 'danger' : 'warn', sort: 10 - Math.min(pct, 300) / 100, go: ['bills', 'budget'],
        text: `${c.icon} งบ${c.label} ${a >= b ? 'เกินงบแล้ว' : 'ใกล้เต็ม'} · ใช้ไป ${pct}% (${billFmt0(a)} / ${billFmt0(b)})` });
    });
  } catch (e) {}
  // 3) Subscription จะตัดใน 3 วัน (รอบถัดไป = รอบที่ lastNo+1)
  try { (state.subscriptions || []).forEach(s => {
    if (!s.active || !/^\d{4}-\d{2}-\d{2}$/.test(s.startDate || '')) return;
    const next = billSubDate(s, Number(s.lastNo) || 0), days = billRwDays(today, next);
    if (days < 0 || days > ALERT_DAYS) return;
    out.push({ key: 'sub:' + (s.id || s.name) + ':' + next, level: 'warn', sort: days + 0.5, go: ['bills', 'recur'],
      text: `🔁 ${s.name} จะตัด ${billFmt0(s.amountThb || s.amount)} ${days === 0 ? 'วันนี้' : 'อีก ' + days + ' วัน'}${s.card ? ' · ' + s.card : ''}` });
  }); } catch (e) {}
  const hid = billAlertsDismissed();
  return out.filter(a => hid[a.key] !== today).sort((a, b) => (a.level === b.level ? 0 : a.level === 'danger' ? -1 : 1) || a.sort - b.sort);
}
function billAlertsDismissed() { try { return JSON.parse(localStorage.getItem('folio_alerts_dismissed') || '{}') || {}; } catch (e) { return {}; } }
function billAlertDismiss(key, ev) {
  if (ev) ev.stopPropagation();
  const o = billAlertsDismissed(), today = todayISO();
  Object.keys(o).forEach(k => { if (o[k] !== today) delete o[k]; }); // ทิ้งของเก่า ไม่ให้โตไม่รู้จบ
  o[key] = today;
  try { localStorage.setItem('folio_alerts_dismissed', JSON.stringify(o)); } catch (e) {}
  renderAlerts();
}
function billAlertGo(page, tab) {
  if (page === 'bills') { billState.tab = tab; try { localStorage.setItem('folio_bill_tab', tab); } catch (e) {} }
  showPage(page);
}
function renderAlerts() {
  const el = document.getElementById('alertBar');
  if (!el || typeof billAlerts !== 'function') return;
  const list = billAlerts();
  if (!list.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
  const shown = list.slice(0, ALERT_MAX);
  el.style.display = 'flex';
  el.innerHTML = shown.map(a => `<div class="alert-item ${a.level === 'danger' ? 'danger' : ''}" data-key="${esc(a.key)}" onclick="billAlertGo('${a.go[0]}','${a.go[1]}')"><span class="al-txt">${esc(a.text)}</span><button class="al-x" aria-label="ซ่อนวันนี้" title="ซ่อนวันนี้" onclick='billAlertDismiss(${esc(JSON.stringify(a.key))},event)'>✕</button></div>`).join('') +
    (list.length > shown.length ? `<div style="font-size:11px;color:var(--text3);padding-left:4px;">และอีก ${list.length - shown.length} เรื่อง</div>` : '');
}
const BILL_SOURCES = { camera: '📷 ถ่ายรูป', upload: '🖼️ อัปโหลด', share: '📲 แชร์', text: '⌨️ พิมพ์', voice: '🎙️ พูด', manual: '✍️ กรอกเอง', subscription: '🔁 หักอัตโนมัติ', csv: '📄 นำเข้า CSV' };

const billState = {
  month: todayISO().slice(0, 7),
  view: 'month',
  listMode: 'month',    // รายการ: day | week | month
  listDate: todayISO(), // วันอ้างอิงของมุมมองวัน/สัปดาห์
  filter: 'all',
  catFilter: '',        // key หมวด หรือ '' = ทุกหมวด
  payFilter: '',        // 'card' | 'transfer' | ... | 'card:<ชื่อบัตร>' หรือ '' = ทุกช่องทาง
  drafts: [],
  editingId: null,
  catChart: null,
  trendChart: null,
  usedMic: false
};

function billCat(key, type) {
  const list = type ? BILL_CATS[type] : BILL_CATS.expense.concat(BILL_CATS.income);
  return list.find(c => c.key === key) || (type === 'income' ? BILL_CATS.income[BILL_CATS.income.length - 1] : BILL_CATS.expense[BILL_CATS.expense.length - 1]);
}
function billFmt(v) { return '฿' + Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
function billFmt0(v) { return '฿' + Math.round(v || 0).toLocaleString(); }
function billMonthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
}

// ─── มุมมองเดือน/ปี: period = 'YYYY-MM' (เดือน) หรือ 'YYYY' (ปีปฏิทิน) ───
function billPeriod() { return billState.view === 'year' ? billState.month.slice(0, 4) : billState.month; }
function billPeriodLabel(p) {
  return p.length === 4 ? 'ปี ' + new Date(+p, 0, 1).toLocaleDateString('th-TH', { year: 'numeric' }).replace(/\D/g, '') : billMonthLabel(p);
}
// จำนวนเดือนที่ใช้หาค่าเฉลี่ยของปี: ปีที่จบแล้ว = 12, ปีนี้ = เดือนที่ผ่านมาจนถึงเดือนนี้
function billYearMonths(y) {
  const now = new Date();
  return +y < now.getFullYear() ? 12 : +y === now.getFullYear() ? now.getMonth() + 1 : 0;
}

// ─── ยอดรวมต่อเดือน/ปี (จุดเดียว ทุกหน้าใช้ร่วมกัน) — ym รับได้ทั้ง 'YYYY-MM' และ 'YYYY' ───
function billMonthTotals(ym) {
  return billTotals(t => billInPeriod(t, ym));
}

// แผน DCA ต่อเดือน (ปรับตามความถี่) — ชื่อเดิมของแท็บบิล ใช้ dcaMonthly() ตัวเดียวกับหน้าอื่น
function billDcaMonthly() { return dcaMonthly(); }

// เฉลี่ยเงินเหลือจากเดือนที่จบแล้วและมีข้อมูล (สูงสุด 3 เดือนก่อนเดือนปัจจุบัน)
function billAvgSurplus() {
  const cur = todayISO().slice(0, 7);
  const months = [];
  for (let i = 1; i <= 3; i++) {
    const ym = billAddMonths(cur, -i);
    const t = billMonthTotals(ym);
    if (t.income > 0) months.push({ ym, ...t });
  }
  if (!months.length) return null;
  const avg = k => months.reduce((s, m) => s + m[k], 0) / months.length;
  return { months: months.length, surplus: avg('surplus'), income: avg('income'), consumption: avg('consumption'), invest: avg('invest') };
}

// ─── ข้อความสรุปกระแสเงินสดสำหรับ prompt ของ Gemini (ใช้ใน AI Fund Advisor / รีวิวเดือน) ───
function billCashflowContext() {
  if (!state.transactions || !state.transactions.length) return '';
  const cur = todayISO().slice(0, 7);
  const lines = [];
  const catSum = {};
  let catMonths = 0;
  for (let i = 3; i >= 0; i--) {
    const ym = billAddMonths(cur, -i);
    const t = billMonthTotals(ym);
    if (!t.count) continue;
    lines.push('- ' + ym + (i === 0 ? ' (เดือนนี้ ยังไม่จบ)' : '') + ': รายรับ ' + billFmt0(t.income) + ' | ใช้จ่าย ' + billFmt0(t.consumption) +
      (t.refund ? ' (หักเงินคืนแล้ว ' + billFmt0(t.refund) + ')' : '') + ' | โอนไปลงทุน/ออม ' + billFmt0(t.invest) + ' | เงินเหลือ ' + billFmt0(t.surplus) +
      ' | อัตราออม ' + (t.savingsRate === null ? 'n/a' : t.savingsRate.toFixed(0) + '%'));
    if (i > 0) { catMonths++; Object.keys(t.byCat).forEach(k => { catSum[k] = (catSum[k] || 0) + t.byCat[k]; }); }
  }
  if (!lines.length) return '';
  const top = Object.keys(catSum).sort((a, b) => catSum[b] - catSum[a]).slice(0, 4)
    .map(k => billCat(k, 'expense').label + ' ' + billFmt0(catSum[k] / catMonths) + '/เดือน');
  if (top.length) lines.push('- หมวดใช้จ่ายสูงสุด (เฉลี่ยเดือนที่จบแล้ว): ' + top.join(', '));
  const avg = billAvgSurplus();
  const dca = billDcaMonthly();
  const now = billMonthTotals(cur);
  const cardLines = Object.keys(now.cards).map(k => k + ' รูด ' + billFmt0(now.cards[k].spent) + ' / จ่ายบิล ' + billFmt0(now.cards[k].paid));
  if (cardLines.length) lines.push('- บัตรเครดิตเดือนนี้: ' + cardLines.join(', '));
  const payLines = Object.keys(now.byPay).filter(k => now.byPay[k] > 0).sort((a, b) => now.byPay[b] - now.byPay[a])
    .map(k => BILL_PAY[k].replace(/^\S+\s/, '') + ' ' + billFmt0(now.byPay[k]));
  if (payLines.length) lines.push('- รายจ่ายเดือนนี้แยกตามช่องทางจ่าย: ' + payLines.join(', '));
  if (now.bizIncome || now.bizExpense) lines.push('- ธุรกิจส่วนตัวเดือนนี้: รายได้ ' + billFmt0(now.bizIncome) + ' | ค่าใช้จ่าย ' + billFmt0(now.bizExpense) + ' | กำไร ' + billFmt0(now.bizIncome - now.bizExpense));
  if (avg) lines.push('- เงินเหลือเฉลี่ย ' + avg.months + ' เดือน: ' + billFmt0(avg.surplus) + '/เดือน เทียบแผน DCA ' + billFmt0(dca) + '/เดือน');
  return lines.join('\n');
}

// ═══ Render ═══
function billOnData() {
  if (typeof renderBudget === 'function') renderBudget();
  if (!window._billSettingsLoaded && window.FB) billLoadSettings(); // ล้มเหลวรอบก่อน → ลองใหม่เมื่อข้อมูลอัปเดตครั้งถัดไป
  window._billLoaded = true;
  renderAlerts();
  if (typeof initPhase12 === 'function') initPhase12();
  const page = document.getElementById('page-bills');
  if (page && page.classList.contains('active')) billRender();
}
window.billOnData = billOnData;

function billShiftMonth(n) { billState.month = billAddMonths(billState.month, billState.view === 'year' ? n * 12 : n); billResetListDate(); billRender(); }
function billSetView(v) {
  billState.view = v;
  document.querySelectorAll('#billViewToggle button').forEach(b => b.classList.toggle('active', b.dataset.v === v));
  try { localStorage.setItem('folio_bill_view', v); } catch (e) {}
  billRender();
}
// ─── ตัวกรองหมวด / ช่องทางจ่าย ───
function billMatchFilters(t) {
  if (billState.catFilter && t.category !== billState.catFilter &&
      !(t.category === 'refund' && billOffsetCat(t) === billState.catFilter)) return false; // เงินคืนที่หักหมวดนี้ ให้เห็นด้วย ยอดจะได้ตรงกับ dashboard
  const pf = billState.payFilter;
  if (pf) {
    if (pf.startsWith('card:')) {
      // บัตรรายใบ: ทั้งที่รูด และที่โอนจ่ายบิลของบัตรใบนั้น
      if (((t.card || '').trim() || 'ไม่ระบุบัตร') !== pf.slice(5) || !(t.payMethod === 'card' || t.category === 'cc_payment')) return false;
    } else if ((BILL_PAY[t.payMethod] ? t.payMethod : 'unknown') !== pf) return false;
  }
  return true;
}
function billSetCatFilter(v) { billState.catFilter = v; billRenderList(); }
function billSetPayFilter(v) { billState.payFilter = v; billRenderList(); }
function billClearFilters() {
  billState.catFilter = ''; billState.payFilter = ''; billState.listMode = 'month';
  billSetFilter('all');
}
// แตะจาก dashboard → กรองรายการให้ตรงกับยอดที่แตะ แล้วเลื่อนลงไปดู
function billDrill(kind, value) {
  billState.catFilter = kind === 'cat' ? value : '';
  billState.payFilter = kind === 'pay' ? value : '';
  billState.filter = 'all';
  document.querySelectorAll('#billFilterChips .bill-chip').forEach(b => b.classList.toggle('active', b.dataset.f === 'all'));
  document.getElementById('billSearch').value = '';
  if (billState.view === 'month') billState.listMode = 'month'; // ให้ช่วงของรายการตรงกับยอดบน dashboard
  billState.tab = 'list';
  billApplyTab();
  billRenderList();
  document.getElementById('billTabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function billFilterLabel(kind, v) {
  if (kind === 'cat') { const c = billCat(v); return c.icon + ' ' + c.label; }
  if (v.startsWith('card:')) return '💳 ' + v.slice(5);
  return v === 'unknown' ? '❔ ไม่ระบุช่องทาง' : BILL_PAY[v];
}
function billRenderFilterControls() {
  const catSel = document.getElementById('billCatFilter');
  const paySel = document.getElementById('billPayFilter');
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;
  catSel.innerHTML = opt('', 'ทุกหมวด', billState.catFilter) +
    '<optgroup label="รายจ่าย">' + BILL_CATS.expense.map(c => opt(c.key, c.icon + ' ' + c.label, billState.catFilter)).join('') + '</optgroup>' +
    '<optgroup label="รายรับ">' + BILL_CATS.income.map(c => opt(c.key, c.icon + ' ' + c.label, billState.catFilter)).join('') + '</optgroup>';
  // บัตร: รายชื่อที่ตั้งไว้ + ชื่อบัตรที่เคยใช้ในรายการ (เผื่อบัตรที่ลบออกจากรายชื่อแล้ว)
  const cards = billCards().slice();
  (state.transactions || []).forEach(t => { if (t.card && !cards.includes(t.card)) cards.push(t.card); });
  paySel.innerHTML = opt('', 'ทุกช่องทาง', billState.payFilter) +
    Object.keys(BILL_PAY).map(k => opt(k, k === 'unknown' ? '❔ ไม่ระบุ' : BILL_PAY[k], billState.payFilter)).join('') +
    (cards.length ? '<optgroup label="บัตรรายใบ">' + cards.map(c => opt('card:' + c, '💳 ' + c, billState.payFilter)).join('') + '</optgroup>' : '');
  const act = document.getElementById('billActiveFilters');
  const chips = [];
  if (billState.catFilter) chips.push(`<span class="bill-card-chip">${esc(billFilterLabel('cat', billState.catFilter))}<button onclick="billSetCatFilter('')">✕</button></span>`);
  if (billState.payFilter) chips.push(`<span class="bill-card-chip">${esc(billFilterLabel('pay', billState.payFilter))}<button onclick="billSetPayFilter('')">✕</button></span>`);
  if (billState.filter !== 'all') chips.unshift(`<span class="bill-card-chip">${billState.filter === 'expense' ? '− รายจ่าย' : '+ รายรับ'}<button onclick="billSetFilter('all')" aria-label="ล้าง">✕</button></span>`);
  if (billState.listMode !== 'month' && billState.view !== 'year') chips.unshift(`<span class="bill-card-chip">📅 ${billState.listMode === 'day' ? 'รายวัน' : 'รายสัปดาห์'}<button onclick="billSetListMode('month')" aria-label="ล้าง">✕</button></span>`);
  act.style.display = chips.length ? 'flex' : 'none';
  act.innerHTML = chips.join('') + (chips.length > 1 ? '<button class="bill-chip" onclick="billClearFilters()">ล้างทั้งหมด</button>' : '');
  const badge = document.getElementById('billFilterBadge');
  if (badge) { badge.textContent = chips.length; badge.style.display = chips.length ? 'inline-block' : 'none'; }
}

function billSetFilter(f) {
  billState.filter = f;
  document.querySelectorAll('#billFilterChips .bill-chip').forEach(b => b.classList.toggle('active', b.dataset.f === f));
  billRenderList();
}

function billRender() {
  billApplyTab();
  const ym = billPeriod();
  const isYear = ym.length === 4;
  const unit = isYear ? 'ทั้งปี' : 'เดือนนี้';
  document.getElementById('billMonthLabel').textContent = billPeriodLabel(ym);
  document.querySelectorAll('#billViewToggle button').forEach(b => b.classList.toggle('active', b.dataset.v === billState.view));
  document.getElementById('billCatPeriod').textContent = 'รายจ่าย' + unit;
  document.getElementById('billTrendTitle').textContent = isYear ? 'รายเดือนตลอด' + billPeriodLabel(ym) : 'แนวโน้ม 6 เดือน';
  const lt = document.getElementById('billListTitle'); if (lt) lt.textContent = isYear ? 'รายการทั้งปี' : 'รายการ';
  const ownerEl = document.getElementById('billOwnerNames');
  if (ownerEl && document.activeElement !== ownerEl) ownerEl.value = localStorage.getItem('folio_bill_owner') || '';
  billRenderCardChips();
  const feeEl = document.getElementById('billFxFeeDefault');
  if (feeEl && document.activeElement !== feeEl) feeEl.value = billDefaultFxFee();
  const t = billMonthTotals(ym);
  const sr = t.savingsRate;
  // มุมมองปี: บรรทัดย่อยเป็นค่าเฉลี่ยต่อเดือน + เทียบรายจ่ายปีก่อนในช่วงเดียวกัน
  const nM = isYear ? billYearMonths(ym) : 0;
  const avgSub = v => nM ? 'เฉลี่ย ' + billFmt0(v / nM) + '/เดือน' : '';
  let expSub = t.refund ? 'หักเงินคืนแล้ว ' + billFmt0(t.refund) : 'ไม่รวมเงินลงทุน/ออม';
  if (isYear) {
    expSub = avgSub(t.consumption) + (t.refund ? ' · หักเงินคืน ' + billFmt0(t.refund) : '');
    const yoy = billYearOverYear(ym, t);
    if (yoy) expSub += ` · <span style="color:${yoy.pct > 0 ? 'var(--red)' : 'var(--green)'};">${yoy.pct > 0 ? '▲' : '▼'} ${Math.abs(yoy.pct).toFixed(0)}% vs ปีก่อน</span>`;
  }
  // หัวสรุป: เงินเหลือเป็นตัวเลขหลัก + รับ/จ่าย/ออม/ลงทุน
  let heroSub = isYear ? avgSub(t.consumption) + ' (รายจ่าย)' : (t.refund ? 'รายจ่ายหักเงินคืนแล้ว ' + billFmt0(t.refund) : 'รายจ่ายไม่รวมเงินลงทุน/ออม');
  if (isYear) { const yoy = billYearOverYear(ym, t); if (yoy) heroSub += ` · รายจ่าย ${yoy.pct > 0 ? '▲' : '▼'} ${Math.abs(yoy.pct).toFixed(0)}% vs ปีก่อน`; }
  if (t.invest) heroSub += ' · เหลือในบัญชีหลังลงทุน ' + billFmt0(t.surplus - t.invest);
  document.getElementById('billMetrics').innerHTML = `
    <div class="bh-l">เงินเหลือ${isYear ? 'ทั้งปี' : 'เดือนนี้'} · ${billPeriodLabel(ym)}</div>
    <div class="bh-big">${t.surplus < 0 ? '−' : ''}${billFmt0(Math.abs(t.surplus))}</div>
    <div class="bh-row">
      <div><span>รับ</span><b>${billFmt0(t.income)}</b></div>
      <div><span>จ่าย</span><b>${billFmt0(t.consumption)}</b></div>
      <div><span>ออม</span><b>${sr === null ? '—' : sr.toFixed(0) + '%'}</b></div>
      <div class="bill-tap" onclick="billDrill('cat','invest')" title="แตะเพื่อดูรายการลงทุน/ออม"><span>ลงทุน ›</span><b>${billFmt0(t.invest)}</b></div>
    </div>
    <div class="bh-sub">${heroSub}</div>
    <div class="bh-compact">เงินเหลือ <b>${t.surplus < 0 ? '−' : ''}${billFmt0(Math.abs(t.surplus))}</b> · รับ <b>${billFmt0(t.income)}</b> · จ่าย <b>${billFmt0(t.consumption)}</b></div>`;
  // การ์ดเงินเหลือ↔DCA เป็นมุมมอง "ตอนนี้" เสมอ — มุมมองปีใช้ยอดเดือนปัจจุบันแทนยอดทั้งปี
  billRenderCashflow(isYear ? billMonthTotals(todayISO().slice(0, 7)) : t);
  billRenderRecur();
  billRenderCategories(t);
  billRenderPay(t);
  billRenderCards(t);
  billRwRender();
  billRenderOvTiles();
  billRenderTrend();
  billRenderList();
  if (billState.tab === 'budget' && typeof renderBudget === 'function') renderBudget();
  renderAlerts();
}

function billRenderCashflow(t) {
  const el = document.getElementById('billCashflow');
  const dca = billDcaMonthly();
  const avg = billAvgSurplus();
  // ซ่อนทั้งการ์ดเมื่อไม่มีแผน DCA และยังไม่มีเดือนที่จบแล้วให้เฉลี่ย
  document.getElementById('billCashflowCard').style.display = dca <= 0 && !avg ? 'none' : '';
  const isCurrent = billState.view === 'year' || billState.month === todayISO().slice(0, 7);
  // ฐานที่ใช้แนะนำงบ: เฉลี่ยเดือนที่จบแล้ว → ถ้ายังไม่มี ใช้เดือนที่เลือก
  const base = avg ? avg.surplus : t.surplus;
  const baseLabel = avg ? 'เฉลี่ย ' + avg.months + ' เดือนที่จบแล้ว' : (isCurrent ? 'เดือนนี้ (ยังไม่จบเดือน)' : billMonthLabel(billState.month));
  if (!t.count && !avg) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text3);">บันทึกรายรับและรายจ่ายสักเดือน แล้ว Folio จะคำนวณเงินเหลือจริงเทียบกับแผน DCA ให้</div>';
    return;
  }
  const gap = base - dca;
  const suggest = Math.max(0, Math.floor(base / 500) * 500);
  const row = (k, v, c) => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:0.5px solid var(--bg2);"><span style="color:var(--text2);">${k}</span><strong style="color:${c || 'var(--text)'};">${v}</strong></div>`;
  let html = '';
  html += row('เงินเหลือจริง (' + esc(baseLabel) + ')', billFmt0(base), base >= 0 ? 'var(--green)' : 'var(--red)');
  html += row('แผน DCA ต่อเดือน (ปรับตามความถี่)', billFmt0(dca));
  html += row('โอนไปลงทุน/ออมจริง (จากสลิป' + (avg ? ' เฉลี่ย' : '') + ')', billFmt0(avg ? avg.invest : t.invest));
  const ok = gap >= 0;
  html += `<div style="font-size:12px;border-radius:9px;padding:9px 12px;margin-top:10px;background:${ok ? 'var(--green-bg)' : 'var(--amber-bg)'};color:${ok ? 'var(--green)' : 'var(--amber)'};">` +
    (dca <= 0 ? 'ยังไม่มีแผน DCA — เงินเหลือจริงลงทุนได้ประมาณ ' + billFmt0(suggest) + '/เดือน'
      : ok ? '✅ แผน DCA อยู่ในงบ — ยังเหลือให้ลงทุนเพิ่ม/เก็บฉุกเฉินได้อีก ' + billFmt0(gap) + '/เดือน'
      : '⚠️ แผน DCA สูงกว่าเงินเหลือจริง ' + billFmt0(-gap) + '/เดือน — อาจต้องลด DCA หรือลดรายจ่าย') + '</div>';
  if (suggest > 0) {
    html += `<button class="btn-ghost" style="width:100%;margin-top:10px;font-size:12px;" onclick="billUseAsDcaBudget(${suggest})">💡 ใช้ ${billFmt0(suggest)} เป็นงบใน AI Fund Advisor</button>`;
  }
  el.innerHTML = html;
}

function billUseAsDcaBudget(amount) {
  showPage('overview');
  const body = document.getElementById('aiSectionBody');
  if (body && !body.classList.contains('open') && typeof toggleAiSection === 'function') toggleAiSection();
  if (typeof p17bSetBudget === 'function') p17bSetBudget(amount);
  const card = document.getElementById('p17bCard');
  if (card) setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  showToast('ตั้งงบ ' + billFmt0(amount) + ' จากเงินเหลือจริงแล้ว — กด 🤖 แนะนำเลย');
}

// รายจ่ายแยกตามช่องทางจ่าย — บัตรเครดิตแตกเป็นรายใบ (ไม่รวมลงทุน/ออม และยอดจ่ายบิลบัตร)
function billRenderPay(t) {
  const card = document.getElementById('billPayCard');
  const el = document.getElementById('billPay');
  if (!el) return;
  const order = ['card', 'transfer', 'cash', 'ewallet', 'unknown'];
  const keys = order.filter(k => t.byPay[k] > 0).sort((a, b) => t.byPay[b] - t.byPay[a]);
  card.style.display = keys.length ? '' : 'none';
  if (!keys.length) return;
  document.getElementById('billPayPeriod').textContent = 'รายจ่าย' + (billState.view === 'year' ? 'ทั้งปี' : 'เดือนนี้');
  const total = keys.reduce((a, k) => a + t.byPay[k], 0); // % ของยอดที่จ่ายออกจริง (ก่อนหักเงินคืน)
  const colors = { card: '#D95070', transfer: '#2563EB', cash: '#16A34A', ewallet: '#F59E0B', unknown: '#AAB0BB' };
  let html = '';
  keys.forEach(k => {
    const pct = total > 0 ? t.byPay[k] / total * 100 : 0;
    html += `<div class="bill-cat-row bill-tap" title="แตะเพื่อดูรายการ" onclick="billDrill('pay','${k}')"><span style="width:118px;flex-shrink:0;">${esc(BILL_PAY[k] === 'ไม่ระบุ' ? '❔ ไม่ระบุ' : BILL_PAY[k])} <span style="color:var(--text3);">›</span></span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct.toFixed(1)}%;background:${colors[k]};"></div></div>
      <span style="width:92px;text-align:right;font-weight:500;">${billFmt0(t.byPay[k])}</span>
      <span style="width:36px;text-align:right;color:var(--text3);font-size:11px;">${pct.toFixed(0)}%</span></div>`;
    if (k === 'card') {
      Object.keys(t.cards).filter(n => t.cards[n].spent > 0).sort((a, b) => t.cards[b].spent - t.cards[a].spent).forEach(n => {
        html += `<div class="bill-tap" onclick="billDrill('pay', ${esc(JSON.stringify('card:' + n))})" style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2);padding:2px 44px 6px 26px;"><span>└ ${esc(n)} ›</span><span>${billFmt0(t.cards[n].spent)}</span></div>`;
      });
    }
  });
  if (t.refund > 0) html += `<div class="bill-cat-row bill-tap" onclick="billDrill('cat','refund')" title="แตะเพื่อดูรายการเงินคืน"><span style="width:118px;flex-shrink:0;">💸 หักเงินคืน ›</span><div style="flex:1;"></div><span style="width:92px;text-align:right;font-weight:500;color:var(--green);">−${billFmt0(t.refund)}</span><span style="width:36px;"></span></div><div style="font-size:10.5px;color:var(--text3);margin-bottom:4px;">ยอดแต่ละช่องทางคือที่จ่ายออกไปจริง (ตรงกับสเตทเมนต์) · เงินคืนหักออกจากรายจ่ายรวม</div>`;
  if (t.byPay.unknown > 0) html += '<div style="font-size:10.5px;color:var(--text3);margin-top:4px;">❔ ไม่ระบุ = รายการที่ยังไม่ได้เลือก "จ่ายด้วย" — แตะรายการเพื่อแก้</div>';
  el.innerHTML = html;
}

// บัตรเครดิตแยกใบ + ธุรกิจส่วนตัว (นับตามเดือนปฏิทิน ไม่ใช่รอบบิลของบัตร)
function billRenderCards(t) {
  const el = document.getElementById('billCards');
  const card = document.getElementById('billCardsCard');
  if (!el) return;
  const names = Object.keys(t.cards).sort((a, b) => t.cards[b].spent - t.cards[a].spent);
  const hasBiz = t.bizIncome > 0 || t.bizExpense > 0;
  card.style.display = names.length || hasBiz ? '' : 'none';
  let html = '';
  if (names.length) {
    const th = 'font-size:10px;color:var(--text3);font-weight:600;padding:5px 6px;text-align:right;border-bottom:0.5px solid var(--border);';
    const td = 'font-size:12px;padding:6px;text-align:right;border-bottom:0.5px solid var(--bg2);white-space:nowrap;';
    html += '<table style="width:100%;border-collapse:collapse;"><tr><th style="' + th + 'text-align:left;">บัตร</th><th style="' + th + '">' + (billState.view === 'year' ? 'รูดทั้งปี' : 'รูดเดือนนี้') + '</th><th style="' + th + '">จ่ายบิลแล้ว</th></tr>';
    names.forEach(n => {
      html += '<tr class="bill-tap" onclick="billDrill(\'pay\', ' + esc(JSON.stringify('card:' + n)) + ')"><td style="' + td + 'text-align:left;font-weight:500;">💳 ' + esc(n) + ' <span style="color:var(--text3);">›</span></td><td style="' + td + '">' + billFmt0(t.cards[n].spent) + '</td><td style="' + td + 'color:var(--text2);">' + billFmt0(t.cards[n].paid) + '</td></tr>';
    });
    html += '</table><div style="font-size:10.5px;color:var(--text3);margin-top:6px;line-height:1.6;">ยอดรูดนับเป็นรายจ่ายตอนรูด · ยอดจ่ายบิลบัตรไม่นับซ้ำ · นับตามเดือนปฏิทิน ไม่ใช่รอบบิลของบัตร</div>';
  }
  if (hasBiz) {
    const profit = t.bizIncome - t.bizExpense;
    html += '<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;margin-top:' + (names.length ? '12px' : '0') + ';background:var(--purple-bg);border-radius:9px;padding:9px 12px;">' +
      '<span>🏪 ธุรกิจส่วนตัว: รายได้ ' + billFmt0(t.bizIncome) + ' − ค่าใช้จ่าย ' + billFmt0(t.bizExpense) + '</span>' +
      '<strong style="color:' + (profit >= 0 ? 'var(--green)' : 'var(--red)') + ';">' + (profit >= 0 ? 'กำไร ' : 'ขาดทุน ') + billFmt0(Math.abs(profit)) + '</strong></div>';
  }
  el.innerHTML = html;
}

// รายจ่ายปีนี้เทียบปีก่อน "ช่วงเดียวกัน" — ปีปัจจุบันตัดที่วันนี้ (ม.ค.–วันนี้) ให้เทียบแฟร์
function billYearOverYear(y, cur) {
  const prev = String(+y - 1);
  const isThisYear = +y === new Date().getFullYear();
  const cutoff = isThisYear ? todayISO().slice(5) : '12-31';
  const p = billTotals(t => t.date.slice(0, 4) === prev && t.date.slice(5) <= cutoff);
  if (!(p.consumption > 0)) return null;
  // ปีนี้ตัดที่วันนี้เหมือนกัน — ไม่นับงวดผ่อนล่วงหน้าที่ยังไม่ถึงวัน
  const c = isThisYear ? billTotals(t => t.date.slice(0, 4) === String(y) && t.date.slice(5) <= cutoff) : cur;
  return { prev: p.consumption, pct: (c.consumption - p.consumption) / p.consumption * 100 };
}

function billCssVar(n, fb) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  return v || fb;
}

function billRenderCategories(t) {
  const keys = Object.keys(t.byCat).filter(k => t.byCat[k] > 0.005).sort((a, b) => t.byCat[b] - t.byCat[a]); // หมวดที่ได้เงินคืนครบ/เกินจะไม่แสดง
  const listEl = document.getElementById('billCatList');
  const wrap = document.getElementById('billCatChartWrap');
  if (billState.catChart) { billState.catChart.destroy(); billState.catChart = null; }
  if (!keys.length) {
    wrap.style.display = 'none';
    listEl.innerHTML = '<div class="empty">ยังไม่มีรายจ่าย' + (billState.view === 'year' ? 'ทั้งปี' : 'เดือนนี้') + '</div>';
    return;
  }
  wrap.style.display = '';
  const total = keys.reduce((a, k) => a + t.byCat[k], 0); // สัดส่วนของหมวดที่ยังมียอดหลังหักเงินคืน
  const nM = billState.view === 'year' ? billYearMonths(billPeriod()) : 0;
  // งบต่อเดือนจากแท็บงบประมาณ (ใช้กับมุมมองเดือน)
  const budget = {};
  if (!nM && typeof budgetCatKey === 'function') state.budgetExpenses.forEach(e => { const bk = budgetCatKey(e); budget[bk] = (budget[bk] || 0) + Number(e.amount || 0); });
  const showKeys = billState.catAll ? keys : keys.slice(0, 5);
  listEl.innerHTML = showKeys.map(k => {
    const c = billCat(k, 'expense');
    const pct = total > 0 ? t.byCat[k] / total * 100 : 0;
    return `<div class="bill-cat-row bill-tap" title="แตะเพื่อดูรายการ" onclick="billDrill('cat',${esc(JSON.stringify(k))})"><span style="width:118px;flex-shrink:0;">${c.icon} ${esc(c.label)} <span style="color:var(--text3);">›</span></span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct.toFixed(1)}%;background:${c.color};"></div></div>
      <span style="width:92px;text-align:right;font-weight:500;" title="${nM ? 'เฉลี่ย ' + billFmt0(t.byCat[k] / nM) + '/เดือน' : ''}">${billFmt0(t.byCat[k])}${nM ? '<div style="font-size:9.5px;color:var(--text3);font-weight:400;">' + billFmt0(t.byCat[k] / nM) + '/ด.</div>' : (budget[k] ? '<div style="font-size:9.5px;font-weight:400;color:' + (t.byCat[k] > budget[k] ? 'var(--red)' : 'var(--text3)') + ';">งบ ' + billFmt0(budget[k]) + '</div>' : '')}</span>
      <span style="width:36px;text-align:right;color:var(--text3);font-size:11px;">${pct.toFixed(0)}%</span></div>`;
  }).join('') + (keys.length > 5 ? `<button class="bill-chip" id="billCatMore" style="margin-top:8px;min-height:36px;" onclick="billState.catAll=!billState.catAll;billRenderCategories(billMonthTotals(billPeriod()))">${billState.catAll ? 'แสดงเฉพาะ 5 อันดับ ▴' : 'ดูทั้งหมด (' + keys.length + ') ▾'}</button>` : '');
  if (typeof Chart === 'undefined' || !document.getElementById('page-bills').classList.contains('active')) return;
  billState.catChart = new Chart(document.getElementById('billCatChart').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: keys.map(k => billCat(k, 'expense').label),
      datasets: [{ data: keys.map(k => Math.round(t.byCat[k])), backgroundColor: keys.map(k => billCat(k, 'expense').color), borderWidth: 0 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '62%',
      onClick: (e, els) => { if (els.length) billDrill('cat', keys[els[0].index]); },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => c.label + ': ' + billFmt0(c.parsed) } }
      }
    }
  });
}

function billRenderTrend() {
  if (billState.trendChart) { billState.trendChart.destroy(); billState.trendChart = null; }
  if (typeof Chart === 'undefined' || !document.getElementById('page-bills').classList.contains('active')) return;
  const months = [];
  if (billState.view === 'year') { const y = billPeriod(); for (let m = 1; m <= 12; m++) months.push(y + '-' + String(m).padStart(2, '0')); }
  else for (let i = 5; i >= 0; i--) months.push(billAddMonths(billState.month, -i));
  const data = months.map(billMonthTotals);
  const textColor = billCssVar('--text3', '#9E9AAA');
  billState.trendChart = new Chart(document.getElementById('billTrendChart').getContext('2d'), {
    data: {
      labels: months.map(ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'short' }); }),
      datasets: [
        { type: 'bar', label: 'รายรับ', data: data.map(d => Math.round(d.income)), backgroundColor: '#16A34A', borderRadius: 4, order: 2 },
        { type: 'bar', label: 'รายจ่าย', data: data.map(d => Math.round(d.consumption)), backgroundColor: '#D95070', borderRadius: 4, order: 2 },
        { type: 'line', label: 'เงินเหลือ', data: data.map(d => Math.round(d.surplus)), borderColor: '#2563EB', backgroundColor: '#2563EB', tension: 0.3, pointRadius: 3, borderWidth: 2, order: 1 },
        { type: 'line', label: 'ลงทุน/ออม', data: data.map(d => Math.round(d.invest)), borderColor: '#7C3AED', backgroundColor: '#7C3AED', borderDash: [5, 4], tension: 0.3, pointRadius: 3, borderWidth: 2, order: 1 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { font: { size: 10 }, boxWidth: 12, padding: 10, color: textColor } },
        tooltip: { callbacks: { label: c => c.dataset.label + ': ' + billFmt0(c.parsed.y) } }
      },
      scales: {
        y: { ticks: { font: { size: 10 }, color: textColor, callback: v => Math.abs(v) >= 1000 ? (v / 1000) + 'k' : v }, grid: { color: 'rgba(128,128,128,0.12)' } },
        x: { ticks: { font: { size: 10 }, color: textColor }, grid: { display: false } }
      }
    }
  });
}

function billListRange() {
  const fmt = (iso, o) => new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', o);
  if (billState.listMode === 'day') {
    const d = billState.listDate;
    return { from: d, to: d, label: (d === todayISO() ? 'วันนี้ · ' : '') + fmt(d, { weekday: 'short', day: 'numeric', month: 'short' }), unit: 'วันนี้' };
  }
  if (billState.listMode === 'week') {
    const d = new Date(billState.listDate + 'T00:00:00');
    const from = billIsoAdd(billState.listDate, -((d.getDay() + 6) % 7)); // จันทร์
    const to = billIsoAdd(from, 6);
    const sameMonth = from.slice(0, 7) === to.slice(0, 7);
    return { from, to, label: fmt(from, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' }) + ' – ' + fmt(to, { day: 'numeric', month: 'short' }), unit: 'สัปดาห์นี้' };
  }
  const ym = billState.month;
  return { from: ym + '-01', to: billIsoAdd(billAddMonths(ym, 1) + '-01', -1), label: billMonthLabel(ym), unit: 'เดือนนี้' };
}
// เปลี่ยนเดือน → ให้วันอ้างอิงอยู่ในเดือนนั้น: เดือนนี้ = วันนี้, เดือนอื่น = วันล่าสุดที่มีรายการ (ไม่มีเลยใช้วันที่ 1)
function billResetListDate() {
  const ym = billState.month;
  if (ym === todayISO().slice(0, 7)) { billState.listDate = todayISO(); return; }
  const dates = (state.transactions || []).filter(t => billInPeriod(t, ym)).map(t => t.date).sort();
  billState.listDate = dates.length ? dates[dates.length - 1] : ym + '-01';
}
function billSetListMode(m) {
  billState.listMode = m;
  billRenderList();
}
function billListShift(n) {
  if (billState.listMode === 'month') { billShiftMonth(n); return; }
  billState.listDate = billIsoAdd(billState.listDate, n * (billState.listMode === 'week' ? 7 : 1));
  // ข้ามเดือน → ภาพรวมด้านบนเลื่อนตามไปเดือนนั้นด้วย
  if (billState.listDate.slice(0, 7) !== billState.month) { billState.month = billState.listDate.slice(0, 7); billRender(); }
  else billRenderList();
}

function billRenderList() {
  const el = document.getElementById('billList');
  if (!el) return;
  const q = (document.getElementById('billSearch').value || '').trim().toLowerCase();
  const isYear = billState.view === 'year';
  // ตัวเลื่อนวัน/สัปดาห์ แสดงเฉพาะเมื่อไม่ใช่โหมดเดือน (โหมดเดือนใช้ตัวเลือกเดือนบนหัวหน้า) — ตัวสลับโหมดย้ายเข้าแผ่นกรอง
  document.getElementById('billRangeBar').style.display = isYear || billState.listMode === 'month' ? 'none' : 'block';
  document.getElementById('billModeRow').style.display = isYear ? 'none' : '';
  document.querySelectorAll('#billListModeToggle button').forEach(b => b.classList.toggle('active', b.dataset.m === billState.listMode));
  const sumEl = document.getElementById('billRangeSummary');
  billRenderFilterControls();
  const filtered = !!(billState.catFilter || billState.payFilter || billState.filter !== 'all');
  // มุมมองปีที่ไม่ได้ค้นหา/กรอง → ตารางสรุปรายเดือน (แตะเพื่อเข้าไปดูเดือนนั้น) แทนรายการยาวทั้งปี
  if (isYear && !q && !filtered) { sumEl.style.display = 'none'; billRenderYearTable(el); return; }
  const y = billPeriod().slice(0, 4);
  const range = isYear ? { from: y + '-01-01', to: y + '-12-31', label: billPeriodLabel(y) } : billListRange();
  const matchQ = t => {
    if (!q) return true;
    const c = billCat(t.category, t.type);
    return [t.merchant, t.note, c.label, t.ref, t.card].some(x => String(x || '').toLowerCase().includes(q));
  };
  const match = t => t.date >= range.from && t.date <= range.to &&
    (billState.filter === 'all' || t.type === billState.filter) && billMatchFilters(t) && matchQ(t);
  {
    if (!isYear) document.getElementById('billRangeLabel').textContent = range.label;
    // ยอดสรุปคิดเฉพาะรายการที่ผ่านตัวกรอง — ตัวเลขเดียวกับที่แตะมาจาก dashboard
    const rt = billTotals(match);
    sumEl.style.display = '';
    const parts = [];
    if (rt.income) parts.push(`รับ <strong style="color:var(--green);">+${billFmt0(rt.income)}</strong>`);
    if (rt.consumption || !(rt.income || rt.invest || rt.ccPaid)) parts.push(`จ่าย <strong style="color:var(--red);">−${billFmt0(rt.consumption)}</strong>`);
    if (rt.invest) parts.push(`ลงทุน/ออม <strong style="color:#7C3AED;">${billFmt0(rt.invest)}</strong>`);
    if (rt.ccPaid) parts.push(`จ่ายบิลบัตร ${billFmt0(rt.ccPaid)}`);
    if (rt.refund) parts.push(`หักเงินคืนแล้ว <strong style="color:var(--green);">${billFmt0(rt.refund)}</strong>`);
    const est = (state.transactions || []).filter(t => match(t) && t.currency && t.currency !== 'THB' && !t.thbActual).length;
    if (est) parts.push(`<span style="color:var(--amber);" title="รายการต่างประเทศที่ยอดบาทยังเป็นค่าประมาณ — แตะรายการเพื่อใส่ยอดจริงจากสเตทเมนต์">⚠️ ${est} รายการยอดบาทประมาณ</span>`);
    sumEl.innerHTML = rt.count
      ? parts.join(' · ') + ` <span style="color:var(--text3);">· ${rt.count} รายการ</span>`
      : '<span style="color:var(--text3);">ไม่มีรายการ' + (filtered || q ? 'ที่ตรงกับตัวกรอง' : '') + 'ในช่วงนี้</span>';
    if (filtered || q) sumEl.innerHTML = '<span style="color:var(--text3);">ตามตัวกรอง · ' + esc(range.label) + ':</span> ' + sumEl.innerHTML;
  }
  const rows = (state.transactions || []).filter(match).sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')) || ((b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
  if (!rows.length) {
    el.innerHTML = '<div class="empty">' + (q || filtered ? 'ไม่พบรายการที่ตรงกับตัวกรอง' + (isYear ? '' : ' — ลองเปลี่ยนเป็นมุมมองเดือน หรือกด ‹ ดูย้อนหลัง') : 'ยังไม่มีรายการในช่วงนี้ — กด ‹ เพื่อดูย้อนหลัง หรือเริ่มจาก 📷 ถ่ายสลิป หรือ ✍️ กรอกเอง') + '</div>';
    return;
  }
  let html = '', lastDate = '';
  rows.forEach(t => {
    if (t.date !== lastDate) {
      lastDate = t.date;
      const dayNet = rows.filter(r => r.date === t.date).reduce((s, r) => s + (r.type === 'income' ? 1 : -1) * billAmtThb(r), 0);
      const d = new Date(t.date + 'T00:00:00');
      html += `<div class="bill-day"><span>${d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}</span><span>${dayNet >= 0 ? '+' : '−'}${billFmt0(Math.abs(dayNet))}</span></div>`;
    }
    const c = billCat(t.category, t.type);
    const inc = t.type === 'income';
    const foreign = t.currency && t.currency !== 'THB';
    const pay = t.payMethod === 'card' || t.category === 'cc_payment' ? '💳 ' + esc(t.card || 'บัตร') : (t.payMethod && t.payMethod !== 'unknown' ? esc(BILL_PAY[t.payMethod] || '') : '');
    const offLabel = t.category === 'refund' ? 'หักจาก ' + billCat(billOffsetCat(t), 'expense').label : '';
    const sub = [esc(offLabel || c.label), pay, t.installmentOf > 1 ? '🗓️ ผ่อน ' + t.installmentNo + '/' + t.installmentOf : '', t.subscriptionId ? '🔁 Subscription' : '', t.time ? esc(t.time) : '', t.subscriptionId || t.source === 'manual' ? '' : esc(BILL_SOURCES[t.source] || ''), t.ref ? 'อ้างอิง ' + esc(String(t.ref).slice(-8)) : ''].filter(Boolean).join(' · ');
    html += `<div class="bill-row" onclick="billEdit('${esc(t.id)}')">
      <div class="bill-ico" style="background:${c.color}22;">${c.icon}</div>
      <div class="bill-main"><div class="bill-merchant">${esc(t.merchant || c.label)}${t.note ? ' <span style="color:var(--text3);font-weight:400;">· ' + esc(t.note) + '</span>' : ''}</div><div class="bill-sub">${sub}</div></div>
      <div><div class="bill-amt" style="color:${inc ? 'var(--green)' : BILL_NON_SPEND.includes(t.category) ? 'var(--text2)' : 'var(--text)'};">${inc ? '+' : '−'}${billFmt(billAmtThb(t))}</div>
      ${foreign ? `<div style="font-size:10px;color:${t.thbActual ? 'var(--text3)' : 'var(--amber)'};text-align:right;" title="${t.thbActual ? 'ยอดบาทจริง' : 'ยอดบาทประมาณ (อัตรากลาง + ค่าธรรมเนียม ' + (t.fxFeePct || 0) + '%) — แตะเพื่อใส่ยอดจริงจากสเตทเมนต์'}">${esc(t.currency)} ${Number(t.amount).toLocaleString()}${t.thbActual ? ' ✓' : ' · ประมาณ'}</div>` : ''}</div>
    </div>`;
  });
  el.innerHTML = html;
}

function billRenderYearTable(el) {
  const y = billPeriod();
  const th = 'font-size:10px;color:var(--text3);font-weight:600;padding:6px;text-align:right;border-bottom:0.5px solid var(--border);white-space:nowrap;';
  const td = 'font-size:12px;padding:8px 6px;text-align:right;border-bottom:0.5px solid var(--bg2);white-space:nowrap;';
  let html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;min-width:330px;"><tr><th style="' + th + 'text-align:left;">เดือน</th><th style="' + th + '">รายรับ</th><th style="' + th + '">รายจ่าย</th><th style="' + th + '">เหลือ</th><th style="' + th + '">ออม</th></tr>';
  let any = false;
  for (let m = 1; m <= 12; m++) {
    const ym = y + '-' + String(m).padStart(2, '0');
    const t = billMonthTotals(ym);
    if (!t.count) continue;
    any = true;
    const sr = t.savingsRate;
    html += `<tr style="cursor:pointer;" onclick="billOpenMonth('${ym}')">
      <td style="${td}text-align:left;font-weight:500;">${new Date(+y, m - 1, 1).toLocaleDateString('th-TH', { month: 'short' })} <span style="color:var(--text3);font-size:10px;">${t.count} รายการ ›</span></td>
      <td style="${td}color:var(--green);">${billFmt0(t.income)}</td>
      <td style="${td}">${billFmt0(t.consumption)}</td>
      <td style="${td}color:${t.surplus >= 0 ? 'var(--green)' : 'var(--red)'};">${billFmt0(t.surplus)}</td>
      <td style="${td}color:${sr === null ? 'var(--text3)' : sr >= 20 ? 'var(--green)' : sr >= 10 ? 'var(--amber)' : 'var(--red)'};">${sr === null ? '—' : sr.toFixed(0) + '%'}</td></tr>`;
  }
  html += '</table></div><div style="font-size:10.5px;color:var(--text3);margin-top:6px;">แตะเดือนเพื่อดูรายการ · ค้นหาด้านบนเพื่อดูรายการทั้งปี</div>';
  el.innerHTML = any ? html : '<div class="empty">ยังไม่มีรายการในปีนี้ — เริ่มจาก 📷 ถ่ายสลิป หรือ ✍️ กรอกเอง</div>';
}
function billOpenMonth(ym) {
  billState.month = ym;
  billResetListDate();
  billState.tab = 'list';
  billSetView('month');
  document.getElementById('billTabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ลบทันที + แถบ "เลิกทำ" 6 วินาที (แทน confirm) — เก็บสำเนาเอกสารไว้เขียนกลับด้วย id เดิม (สำคัญกับ ref_… และ <subId>_<n>)
// งวดผ่อนยังถามว่าจะลบทั้งชุดไหม · คืน true เมื่อลบสำเร็จ
let _billUndo = null, _billUndoTimer = 0;
function billShowUndo(msg, docs) {
  clearTimeout(_billUndoTimer);
  _billUndo = docs;
  document.getElementById('billUndoMsg').textContent = msg;
  document.getElementById('billUndo').classList.add('show');
  _billUndoTimer = setTimeout(billHideUndo, 6000);
}
function billHideUndo() { clearTimeout(_billUndoTimer); _billUndo = null; document.getElementById('billUndo').classList.remove('show'); }
async function billUndoRun() {
  const docs = _billUndo;
  billHideUndo();
  if (!docs || !docs.length) return;
  try {
    for (const t of docs) {
      const { id, ...data } = t;
      if (window.FB) await window.FB.put('transactions', id, data);
      else if (!state.transactions.some(x => x.id === id)) state.transactions.push(t);
    }
    if (!window.FB) billRender();
    showToast('เลิกทำแล้ว — คืนรายการ ' + docs.length + ' รายการ');
  } catch (e) { showToast('เลิกทำไม่สำเร็จ: ' + e.message); }
}
async function billDelete(id) {
  const t = (state.transactions || []).find(x => x.id === id);
  if (!t) return false;
  const series = t.installmentId ? (state.transactions || []).filter(x => x.installmentId === t.installmentId) : [];
  let targets = [t];
  if (series.length > 1 && confirm('รายการนี้เป็นงวด ' + t.installmentNo + '/' + t.installmentOf + ' ของรายการผ่อน\n\nลบทั้งชุด ' + series.length + ' งวดด้วยไหม?\nตกลง = ลบทั้งชุด · ยกเลิก = ลบเฉพาะงวดนี้')) targets = series;
  const snap = targets.map(x => ({ ...x })); // สำเนาก่อนลบ
  try {
    if (window.FB) for (const x of targets) await window.FB.del('transactions', x.id);
    else { const ids = new Set(targets.map(x => x.id)); state.transactions = state.transactions.filter(x => !ids.has(x.id)); billRender(); }
    billShowUndo(targets.length > 1 ? 'ลบงวดผ่อน ' + targets.length + ' งวดแล้ว' : 'ลบแล้ว' + (t.subscriptionId ? ' (รอบนี้จะไม่ถูกสร้างซ้ำ)' : ''), snap);
    return true;
  } catch (e) { showToast('ลบไม่สำเร็จ: ' + e.message); return false; }
}
// ปุ่มลบในฟอร์มแก้ไข (แทนปุ่ม ✕ ที่เคยอยู่ทุกแถว) — ลบสำเร็จแล้วค่อยปิดฟอร์ม ถ้ายกเลิกที่ confirm ฟอร์มยังอยู่
async function billDeleteFromForm() {
  const id = billState.editingId;
  if (id && await billDelete(id)) billCloseConfirm();
}

// ═══ Drafts (หน้ายืนยันก่อนบันทึก) ═══
let _billUid = 0;
function billNewDraft(p) {
  p = p || {};
  const type = p.type === 'income' ? 'income' : 'expense';
  const cat = BILL_CATS[type].some(c => c.key === p.category) ? p.category : (type === 'income' ? 'other_in' : 'other');
  const cur = /^[A-Z]{3}$/.test(String(p.currency || '').toUpperCase()) ? String(p.currency).toUpperCase() : 'THB';
  return {
    uid: ++_billUid, include: true, type, category: cat,
    amount: p.amount > 0 ? Math.round(Number(p.amount) * 100) / 100 : '',
    currency: cur, fx: cur === 'THB' ? 1 : (Number(p.fx) || 0), fxSrc: p.fxSrc || '',
    fee: typeof p.fxFeePct === 'number' ? p.fxFeePct : null, feeManual: typeof p.fxFeePct === 'number',
    thbActual: Number(p.thbCharged) > 0 && cur !== 'THB' ? Number(p.thbCharged) : (p.thbActual && typeof p.amountThb === 'number' ? p.amountThb : ''),
    date: billNormDate(p.date), time: /^\d{1,2}:\d{2}$/.test(p.time || '') ? p.time.padStart(5, '0') : '',
    merchant: String(p.merchant || '').slice(0, 80), ref: String(p.ref || '').slice(0, 80),
    note: String(p.note || '').slice(0, 120), source: p.source || 'manual', aiRead: !!p.aiRead,
    payMethod: BILL_PAY[p.payMethod] ? p.payMethod : (cat === 'cc_payment' ? 'transfer' : 'unknown'),
    card: billMatchCard(p.card),
    rewardTag: BILL_RW_TAGS[p.rewardTag] ? p.rewardTag : '', // หมวดสิทธิ์บัตรที่เลือกเอง ('' = เดาอัตโนมัติ)
    // รายการเงินคืนเก่า (มี id แต่ไม่มี offsetCat) คงหมวด "อื่น ๆ" ไว้เหมือนที่เคยคำนวณ; รายการใหม่เริ่มที่อาหาร
    offsetCat: billOffsetCats().some(c => c.key === p.offsetCat) ? p.offsetCat : (p.id && p.category === 'refund' ? 'other' : 'food'),
    // รูปแบบ (เฉพาะรายจ่ายใหม่): plan = 'once' | 'inst' (ผ่อน) | 'sub' (Subscription)
    // ผ่อน: amount = ยอดต่อเดือน, instMonths = จำนวนงวดทั้งหมด, instPaid = จ่ายไปแล้วกี่งวด
    // Subscription: amount = ค่าสมาชิกต่อรอบ, subCycle = 'monthly' | 'yearly', date = วันตัดรอบแรก
    plan: 'once', instMonths: 10, instPaid: 0, subCycle: 'monthly',
    installmentId: p.installmentId || '', installmentNo: Number(p.installmentNo) || 0, installmentOf: Number(p.installmentOf) || 0,
    subscriptionId: p.subscriptionId || '', subscriptionNo: Number(p.subscriptionNo) || 0
  };
}
function billInstMonths(d) {
  const n = Math.floor(Number(d.instMonths));
  return n >= 2 && n <= 120 ? n : 0;
}
// จำนวนงวดที่จ่ายไปแล้ว (ว่าง = 0) — ต้องเหลืออย่างน้อย 1 งวด, คืน -1 ถ้าไม่ถูกต้อง
function billInstPaid(d) {
  const raw = String(d.instPaid ?? '').trim();
  if (!raw) return 0;
  const p = Number(raw), n = billInstMonths(d);
  return Number.isInteger(p) && p >= 0 && (!n || p < n) ? p : -1;
}
function billInstPreview(d) {
  const n = billInstMonths(d), paid = billInstPaid(d), per = billDraftThb(d);
  if (!n) return '<span style="color:var(--amber);">ผ่อนทั้งหมดต้องอยู่ระหว่าง 2–120 งวด</span>';
  if (paid < 0) return '<span style="color:var(--amber);">งวดที่จ่ายแล้วต้องเป็น 0–' + (n - 1) + ' (ต้องเหลืออย่างน้อย 1 งวด)</span>';
  if (!(per > 0)) return '<span style="color:var(--amber);">ใส่ยอดผ่อนต่อเดือน</span>';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) return '<span style="color:var(--amber);">เลือกวันที่งวดถัดไป</span>';
  const left = n - paid;
  const fmt = iso => new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  return (paid ? `ทั้งแผน ${billFmt(per)} × ${n} = ${billFmt(per * n)} · จ่ายแล้ว ${paid} งวด ${billFmt(per * paid)}<br>` +
      `คงเหลือ ${left} งวด = <strong>${billFmt(per * left)}</strong><br>`
    : `${billFmt(per)} × ${n} เดือน = <strong>${billFmt(per * n)}</strong><br>`) +
    `<span style="color:var(--text3);">งวด ${paid + 1}/${n} ${fmt(d.date)} → งวด ${n}/${n} ${fmt(billInstDate(d.date, left - 1))} · บันทึก ${left} รายการ เดือนละรายการ${paid ? ' (งวดที่จ่ายแล้วไม่บันทึกซ้ำ)' : ''}</span>`;
}
function billSubMonthly(s) { return (Number(s.amountThb) || 0) / billSubStep(s.cycle); }
function billFmtDate(iso) { return iso ? new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : ''; }
function billSubPreview(d) {
  const per = billDraftThb(d);
  if (!(per > 0)) return '<span style="color:var(--amber);">ใส่ค่าสมาชิกต่อรอบ</span>';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) return '<span style="color:var(--amber);">เลือกวันตัดรอบแรก</span>';
  const s = { startDate: d.date, cycle: d.subCycle };
  const yearly = d.subCycle === 'yearly';
  const due = billSubDueCount(s, todayISO());
  const day = +d.date.slice(8, 10);
  const when = yearly ? 'ทุกปี วันที่ ' + new Date(d.date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'long' }) : 'ทุกวันที่ ' + day + (day > 28 ? ' (เดือนที่ไม่มีวันนี้ใช้วันสิ้นเดือน)' : '');
  return `${billFmt(per)} / ${yearly ? 'ปี' : 'เดือน'}${yearly ? ` <span style="color:var(--text3);">(≈ ${billFmt(per / 12)}/เดือน)</span>` : ''} · ตัดรอบ${when}<br>` +
    (due ? `ตอนบันทึกจะลงรายการรอบที่ถึงแล้ว <strong>${due} รอบ</strong> (${billFmtDate(d.date)}${due > 1 ? ' → ' + billFmtDate(billSubDate(s, due - 1)) : ''})` +
        (due > 1 ? `<br><span style="color:var(--amber);">ถ้าไม่ต้องการลงย้อนหลัง ให้ตั้งวันตัดรอบแรกเป็นรอบล่าสุดหรือรอบถัดไป</span>` : '') + '<br>'
      : `รอบแรก ${billFmtDate(d.date)}<br>`) +
    `<span style="color:var(--text3);">รอบต่อไปลงรายจ่ายให้อัตโนมัติเมื่อถึงวัน (ถ้าไม่ได้เปิดแอป จะเติมรอบที่ค้างให้ตอนเปิด) · ยกเลิก/แก้ราคาได้ที่การ์ด 🔁 Subscription</span>`;
}
function billSubNewId() { return 'sub_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
// สร้าง Subscription จากฟอร์ม — รอบแรก (ถ้าถึงวันแล้ว) ใช้ข้อมูลในฟอร์มตรง ๆ (ยอดบาทจริง/เลขอ้างอิงที่กรอกไว้) รอบที่เหลือให้ billSubSync ลง
async function billSubCreate(d, data) {
  const id = billSubNewId();
  const first = d.date <= todayISO();
  const sub = {
    name: data.merchant || billCat(data.category, 'expense').label, amount: data.amount, currency: data.currency,
    fxToThb: data.fxToThb, fxFeePct: data.fxFeePct, amountThb: data.amountThb,
    category: data.category, payMethod: data.payMethod, card: data.card, note: data.note, time: data.time,
    cycle: d.subCycle === 'yearly' ? 'yearly' : 'monthly', startDate: d.date,
    active: true, cancelledAt: '', lastNo: first ? 1 : 0
  };
  const row = { ...data, merchant: sub.name, subscriptionId: id, subscriptionNo: 1 };
  if (!window.FB) {
    state.subscriptions.push({ id, ...sub });
    if (first) state.transactions.push({ id: id + '_1', ...row });
    return;
  }
  await window.FB.put('subscriptions', id, sub);
  if (first) await window.FB.put('transactions', id + '_1', row);
}
// รายการของรอบที่ no — สกุลต่างประเทศใช้อัตราของวันตัดรอบ (เป็นยอดประมาณ แก้เป็นยอดจริงทีหลังได้)
async function billSubCharge(s, no, date) {
  const cur = s.currency || 'THB';
  const fee = cur === 'THB' ? 0 : (Number(s.fxFeePct) || 0);
  let fx = 1;
  if (cur !== 'THB') fx = (await billFxRate(cur, date)).rate || Number(s.fxToThb) || 0;
  const amount = Number(s.amount) || 0;
  return {
    date, time: s.time || '', type: 'expense', category: s.category || 'other',
    amount, currency: cur, fxToThb: fx, fxFeePct: fee, thbActual: false,
    amountThb: Math.round(amount * fx * (1 + fee / 100) * 100) / 100,
    merchant: s.name || '', note: s.note || '', ref: '', refKey: '', source: 'subscription', aiRead: false,
    payMethod: s.payMethod || 'unknown', card: s.card || '', offsetCat: '',
    subscriptionId: s.id, subscriptionNo: no
  };
}
let _billSubBusy = false, _billSubAgain = false;
async function billSubSync() {
  if (_billSubBusy) { _billSubAgain = true; return; }
  _billSubBusy = true;
  let added = 0;
  try {
    const today = todayISO();
    for (const s of (state.subscriptions || []).slice()) {
      if (!s.active || !/^\d{4}-\d{2}-\d{2}$/.test(s.startDate || '')) continue;
      const from = Number(s.lastNo) || 0;
      let no = from, last = null;
      while (no < 600 && billSubDate(s, no) <= today) {
        const date = billSubDate(s, no);
        no++;
        const id = s.id + '_' + no;
        if ((state.transactions || []).some(t => t.id === id)) continue;
        const row = await billSubCharge(s, no, date);
        if (window.FB) {
          if (await window.FB.exists('transactions', id)) continue; // อีกเครื่องลงไปแล้ว — ไม่เขียนทับ (อาจแก้ยอดไว้)
          await window.FB.put('transactions', id, row);
        } else state.transactions.push({ id, ...row });
        last = row;
        added++;
      }
      if (no !== from) {
        const upd = { lastNo: no };
        if (last) upd.amountThb = last.amountThb; // ยอดบาทล่าสุด (สกุลต่างประเทศเปลี่ยนตามอัตรา) ใช้คำนวณภาระต่อเดือน
        if (window.FB) await window.FB.update('subscriptions', s.id, upd);
        else Object.assign(s, upd);
      }
    }
  } catch (e) {
    console.warn('subscription sync', e);
  } finally {
    _billSubBusy = false;
    if (added) {
      showToast('🔁 ลงรายจ่าย Subscription ตามรอบแล้ว ' + added + ' รายการ');
      if (!window.FB) billRender();
    }
    if (_billSubAgain) { _billSubAgain = false; billSubSync(); }
  }
}
window.billSubSync = billSubSync;

// ─── การ์ดสรุป: Subscription ที่สมัครอยู่ + รายการผ่อนที่ยังไม่ครบ ───
function billInstGroups() {
  const today = todayISO();
  const map = {};
  (state.transactions || []).forEach(t => { if (t.installmentId) (map[t.installmentId] = map[t.installmentId] || []).push(t); });
  return Object.values(map).map(rows => {
    rows.sort((a, b) => (a.installmentNo || 0) - (b.installmentNo || 0));
    const paid = rows.filter(t => t.date <= today), left = rows.filter(t => t.date > today);
    const of = Math.max(...rows.map(t => Number(t.installmentOf) || 0));
    // งวดที่จ่ายถึงแล้ว = งวดล่าสุดที่ถึงวัน (ถ้ายังไม่ถึงงวดไหนเลย = งวดก่อนงวดแรกที่บันทึกไว้ เช่น แผนที่จ่ายมาบ้างแล้ว)
    const paidNo = paid.length ? Number(paid[paid.length - 1].installmentNo) || 0 : (Number(rows[0].installmentNo) || 1) - 1;
    const next = left[0] || null, ref = next || rows[rows.length - 1];
    return {
      name: ref.merchant || billCat(ref.category, 'expense').label, cat: ref.category, of, paidNo,
      leftCount: left.length, leftAmt: left.reduce((s, t) => s + billAmtThb(t), 0),
      per: billAmtThb(ref), next, end: rows[rows.length - 1].date, pay: ref
    };
  });
}
function billPayLabel(t) {
  return t.payMethod === 'card' ? '💳 ' + esc(t.card || 'บัตร') : (t.payMethod && t.payMethod !== 'unknown' ? esc(BILL_PAY[t.payMethod] || '') : '');
}
function billRenderRecur() {
  const el = document.getElementById('billRecur');
  if (!el) return;
  const today = todayISO();
  const subs = (state.subscriptions || []).slice();
  const active = subs.filter(s => s.active).map(s => ({ s, next: billSubDate(s, Number(s.lastNo) || 0) })).sort((a, b) => a.next.localeCompare(b.next));
  const stopped = subs.filter(s => !s.active).sort((a, b) => String(b.cancelledAt || '').localeCompare(String(a.cancelledAt || '')));
  const groups = billInstGroups();
  const ongoing = groups.filter(g => g.leftCount).sort((a, b) => a.next.date.localeCompare(b.next.date));
  const done = groups.filter(g => !g.leftCount).sort((a, b) => b.end.localeCompare(a.end));
  if (!subs.length && !groups.length) {
    el.innerHTML = '<div class="empty">ยังไม่มี Subscription หรือรายการผ่อน — กด + เพิ่ม Subscription หรือเลือก "รูปแบบการจ่าย" ตอนกรอกรายจ่าย</div>';
    return;
  }
  const subM = active.reduce((s, x) => s + billSubMonthly(x.s), 0);
  const instM = ongoing.reduce((s, g) => s + g.per, 0);
  const instLeft = ongoing.reduce((s, g) => s + g.leftAmt, 0);
  let html = `<div class="bill-recur-sum">
    <span>ภาระต่อเดือน <strong style="color:var(--text);">${billFmt0(subM + instM)}</strong></span>
    <span>🔁 Subscription ${active.length} รายการ ${billFmt0(subM)}/เดือน${active.length ? ' · ' + billFmt0(subM * 12) + '/ปี' : ''}</span>
    <span>🗓️ ผ่อน ${ongoing.length} รายการ ${billFmt0(instM)}/เดือน${instLeft ? ' · คงเหลือ ' + billFmt0(instLeft) : ''}</span></div>`;
  const icon = key => { const c = billCat(key, 'expense'); return `<div class="bill-ico" style="background:${c.color}22;">${c.icon}</div>`; };
  if (active.length) {
    html += '<div class="bill-recur-head">🔁 Subscription ที่สมัครอยู่</div>';
    active.forEach(({ s, next }) => {
      const yearly = s.cycle === 'yearly';
      const foreign = s.currency && s.currency !== 'THB';
      const sub = [(yearly ? 'รายปี' : 'รายเดือน') + (foreign ? ' · ' + esc(s.currency) + ' ' + Number(s.amount).toLocaleString() : ''),
        (next <= today ? '<span style="color:var(--amber);">ถึงรอบ ' + billFmtDate(next) + '</span>' : 'รอบถัดไป ' + billFmtDate(next)), billPayLabel(s)].filter(Boolean).join(' · ');
      html += `<div class="bill-row" onclick="billSubOpen('${esc(s.id)}')">${icon(s.category)}
        <div class="bill-main"><div class="bill-merchant">${esc(s.name)}</div><div class="bill-sub">${sub}</div></div>
        <div><div class="bill-amt">${foreign ? '≈' : ''}${billFmt(s.amountThb)}<span style="font-size:10px;color:var(--text3);font-weight:400;">/${yearly ? 'ปี' : 'เดือน'}</span></div>
        ${yearly ? `<div style="font-size:10px;color:var(--text3);text-align:right;">≈ ${billFmt0(billSubMonthly(s))}/เดือน</div>` : ''}</div></div>`;
    });
  }
  if (ongoing.length) {
    html += '<div class="bill-recur-head">🗓️ กำลังผ่อน</div>';
    ongoing.forEach(g => {
      const pct = g.of ? Math.min(100, g.paidNo / g.of * 100) : 0;
      const sub = [`จ่ายแล้ว ${g.paidNo}/${g.of} งวด`, `เหลือ ${g.leftCount} งวด`, 'งวดถัดไป ' + billFmtDate(g.next.date), 'ครบ ' + billFmtDate(g.end), billPayLabel(g.pay)].filter(Boolean).join(' · ');
      html += `<div class="bill-row" onclick="billEdit('${esc(g.next.id)}')" title="แตะเพื่อแก้งวดถัดไป">${icon(g.cat)}
        <div class="bill-main"><div class="bill-merchant">${esc(g.name)}</div><div class="bill-sub">${sub}</div><div class="bill-progress"><div style="width:${pct.toFixed(1)}%;"></div></div></div>
        <div><div class="bill-amt">${billFmt(g.per)}<span style="font-size:10px;color:var(--text3);font-weight:400;">/เดือน</span></div>
        <div style="font-size:10px;color:var(--text3);text-align:right;">คงเหลือ ${billFmt0(g.leftAmt)}</div></div></div>`;
    });
  }
  if (stopped.length) {
    html += `<details><summary>Subscription ที่ยกเลิกแล้ว (${stopped.length})</summary>` + stopped.map(s =>
      `<div class="bill-row" onclick="billSubOpen('${esc(s.id)}')" style="opacity:.65;">${icon(s.category)}
        <div class="bill-main"><div class="bill-merchant">${esc(s.name)}</div><div class="bill-sub">ยกเลิกเมื่อ ${billFmtDate(s.cancelledAt) || '—'} · ลงไปแล้ว ${Number(s.lastNo) || 0} รอบ</div></div>
        <div class="bill-amt" style="color:var(--text3);">${billFmt(s.amountThb)}/${s.cycle === 'yearly' ? 'ปี' : 'เดือน'}</div></div>`).join('') + '</details>';
  }
  if (done.length) {
    html += `<details><summary>ผ่อนครบแล้ว (${done.length})</summary>` + done.map(g =>
      `<div class="bill-row" style="opacity:.65;cursor:default;">${icon(g.cat)}
        <div class="bill-main"><div class="bill-merchant">${esc(g.name)}</div><div class="bill-sub">ครบ ${g.of} งวด · งวดสุดท้าย ${billFmtDate(g.end)}</div></div>
        <div class="bill-amt" style="color:var(--text3);">${billFmt(g.per)}/เดือน</div></div>`).join('') + '</details>';
  }
  el.innerHTML = html;
}

// ─── แก้ไข / ยกเลิก / ลบ Subscription ───
let _billSubEditing = null;
function billSubOpen(id) {
  const s = (state.subscriptions || []).find(x => x.id === id);
  if (!s) return;
  _billSubEditing = id;
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;
  const cards = billCards().slice();
  if (s.card && !cards.includes(s.card)) cards.push(s.card);
  const next = billSubDate(s, Number(s.lastNo) || 0);
  const yearly = s.cycle === 'yearly';
  document.getElementById('billSubTitle').textContent = (s.active ? '🔁 ' : '⏸ ') + (s.name || 'Subscription');
  document.getElementById('billSubForm').innerHTML = `
    <div style="font-size:11.5px;color:var(--text2);background:var(--bg);border-radius:8px;padding:7px 10px;margin-bottom:10px;line-height:1.6;">
      ${yearly ? 'รายปี' : 'รายเดือน'} · เริ่ม ${billFmtDate(s.startDate)} · ลงรายการไปแล้ว ${Number(s.lastNo) || 0} รอบ<br>
      ${s.active ? 'รอบถัดไป <strong>' + billFmtDate(next) + '</strong>' : '<span style="color:var(--amber);">ยกเลิกแล้วเมื่อ ' + (billFmtDate(s.cancelledAt) || '—') + '</span>'}
      <br><span style="color:var(--text3);">แก้ไขที่นี่มีผลกับรอบถัดไปเท่านั้น — รายการที่ลงไปแล้วแก้ในรายการได้เลย</span></div>
    <div class="bill-draft-grid">
      <div class="form-group full"><label class="form-label">ชื่อ</label><input class="form-input" id="billSubName" value="${esc(s.name)}"></div>
      <div class="form-group"><label class="form-label">ค่าสมาชิกต่อ${yearly ? 'ปี' : 'เดือน'} (${esc(s.currency || 'THB')})</label><input class="form-input" id="billSubAmt" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(s.amount)}" style="font-weight:600;"></div>
      <div class="form-group"><label class="form-label">หมวด</label><select class="form-select" id="billSubCat">${BILL_CATS.expense.map(c => opt(c.key, c.icon + ' ' + c.label, s.category)).join('')}</select></div>
      <div class="form-group"><label class="form-label">จ่ายด้วย</label><select class="form-select" id="billSubPay">${Object.keys(BILL_PAY).map(k => opt(k, BILL_PAY[k], s.payMethod)).join('')}</select></div>
      <div class="form-group"><label class="form-label">บัตร (ถ้าจ่ายด้วยบัตร)</label><select class="form-select" id="billSubCard">${opt('', '— ไม่ระบุ —', s.card || '')}${cards.map(c => opt(c, '💳 ' + c, s.card)).join('')}</select></div>
      <div class="form-group full"><label class="form-label">โน้ต</label><input class="form-input" id="billSubNote" value="${esc(s.note || '')}"></div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
      ${s.active ? `<button class="btn-ghost" style="color:var(--amber);" onclick="billSubCancel()">⏸ ยกเลิก Subscription</button>`
        : `<button class="btn-ghost" style="color:var(--green);" onclick="billSubResume()">▶️ กลับมาสมัครต่อ</button>`}
      <button class="btn-ghost" style="color:var(--red);" onclick="billSubDelete()">🗑️ ลบ</button>
    </div>`;
  openModal('bill-sub-modal');
}
async function billSubWrite(id, data) {
  if (window.FB) await window.FB.update('subscriptions', id, data);
  else { Object.assign((state.subscriptions || []).find(x => x.id === id) || {}, data); billRender(); }
}
async function billSubSave() {
  const s = (state.subscriptions || []).find(x => x.id === _billSubEditing);
  if (!s) return;
  const amount = Math.round(Number(document.getElementById('billSubAmt').value) * 100) / 100;
  if (!(amount > 0)) { showToast('ใส่ค่าสมาชิกให้ถูกต้อง'); return; }
  const payMethod = document.getElementById('billSubPay').value;
  const card = payMethod === 'card' ? document.getElementById('billSubCard').value : '';
  const cur = s.currency || 'THB';
  const fee = cur === 'THB' ? 0 : (payMethod === 'card' ? billCardFee(card) : 0);
  const data = {
    name: document.getElementById('billSubName').value.trim() || s.name, amount,
    category: document.getElementById('billSubCat').value, payMethod, card,
    note: document.getElementById('billSubNote').value.trim(), fxFeePct: fee,
    amountThb: Math.round(amount * (cur === 'THB' ? 1 : (Number(s.fxToThb) || 0) * (1 + fee / 100)) * 100) / 100
  };
  const btn = document.getElementById('billSubSaveBtn');
  btn.disabled = true;
  try { await billSubWrite(s.id, data); closeModal('bill-sub-modal'); showToast('บันทึกแล้ว — มีผลตั้งแต่รอบถัดไป'); }
  catch (e) { showToast('บันทึกไม่สำเร็จ: ' + e.message); }
  btn.disabled = false;
}
async function billSubCancel() {
  const s = (state.subscriptions || []).find(x => x.id === _billSubEditing);
  if (!s || !confirm('ยกเลิก ' + s.name + ' ?\n\nรายการที่ลงไปแล้วยังอยู่ครบ · จะไม่ลงรายจ่ายรอบถัดไปอีก')) return;
  try { await billSubWrite(s.id, { active: false, cancelledAt: todayISO() }); closeModal('bill-sub-modal'); showToast('ยกเลิก ' + s.name + ' แล้ว'); }
  catch (e) { showToast('ไม่สำเร็จ: ' + e.message); }
}
async function billSubResume() {
  const s = (state.subscriptions || []).find(x => x.id === _billSubEditing);
  if (!s) return;
  // เริ่มนับต่อจากรอบที่วันตัดรอบ ≥ วันนี้ — รอบช่วงที่ยกเลิกไปไม่ลงย้อนหลัง
  const today = todayISO();
  let idx = Number(s.lastNo) || 0;
  while (idx < 600 && billSubDate(s, idx) < today) idx++;
  if (!confirm('สมัคร ' + s.name + ' ต่อ?\n\nรอบถัดไป ' + billFmtDate(billSubDate(s, idx)) + ' (ช่วงที่ยกเลิกไปจะไม่ลงย้อนหลัง)')) return;
  try {
    await billSubWrite(s.id, { active: true, cancelledAt: '', lastNo: idx });
    closeModal('bill-sub-modal');
    showToast('กลับมาสมัคร ' + s.name + ' แล้ว');
    billSubSync();
  } catch (e) { showToast('ไม่สำเร็จ: ' + e.message); }
}
async function billSubDelete() {
  const s = (state.subscriptions || []).find(x => x.id === _billSubEditing);
  if (!s || !confirm('ลบ ' + s.name + ' ออกจากรายการ Subscription?\n\nรายจ่ายที่ลงไปแล้ว ' + (Number(s.lastNo) || 0) + ' รอบยังอยู่ในรายการ (ลบแยกได้) · จะไม่ลงรอบถัดไปอีก')) return;
  try {
    if (window.FB) await window.FB.del('subscriptions', s.id);
    else { state.subscriptions = state.subscriptions.filter(x => x.id !== s.id); billRender(); }
    closeModal('bill-sub-modal');
    showToast('ลบแล้ว');
  } catch (e) { showToast('ลบไม่สำเร็จ: ' + e.message); }
}

// ค่าธรรมเนียมเริ่มต้นของรายการต่างประเทศ (หลังรู้ช่องทาง/บัตรแล้ว)
function billInitFee(d) { if (d.fee === null) d.fee = d.currency === 'THB' ? 0 : billAutoFee(d); return d; }
// จับคู่ชื่อบัตรที่ AI อ่านได้กับรายชื่อบัตรที่ตั้งไว้ (เช่น "KTC VISA ****1234" → "KTC 1234")
function billMatchCard(raw) {
  raw = String(raw || '').trim().slice(0, 40);
  if (!raw) return '';
  const norm = x => x.toUpperCase().replace(/[^0-9A-Zก-๙]/g, '');
  const digits = (raw.match(/\d{4}(?!.*\d)/) || [''])[0];
  const list = billCards();
  const hit = list.find(c => norm(c) === norm(raw))
    || (digits && list.find(c => c.includes(digits)))
    || list.find(c => norm(raw).includes(norm(c).replace(/\d+/g, '')) && norm(c).replace(/\d+/g, ''));
  return hit || raw;
}


// ─── อัตราแลกเปลี่ยน "ตามวันที่ใช้จ่าย" ───
// 1) Frankfurter (อัตราอ้างอิง ECB ย้อนหลังรายวัน วันหยุดใช้วันทำการก่อนหน้า) → 2) exchangerate-api (อัตราล่าสุด) → 3) USD จากราคาในแอป
// เป็นอัตรากลาง ไม่ใช่อัตราที่ธนาคาร/Visa/Mastercard ใช้จริง — ยอดบาทจริงให้ใส่จากแอปธนาคารหรือสเตทเมนต์ทับได้
const _billFx = {};
async function billFxRate(cur, date) {
  cur = (cur || 'THB').toUpperCase();
  if (cur === 'THB') return { rate: 1, src: '' };
  const day = date && date < todayISO() ? date : 'latest';
  const key = cur + '|' + day;
  if (_billFx[key]) return _billFx[key];
  try {
    const r = await fetch('https://api.frankfurter.dev/v1/' + day + '?base=' + encodeURIComponent(cur) + '&symbols=THB');
    const d = await r.json();
    if (d.rates && d.rates.THB) return (_billFx[key] = { rate: d.rates.THB, src: 'อัตรา ECB ' + (d.date || day) });
  } catch (e) {}
  try {
    const r = await fetch('https://api.exchangerate-api.com/v4/latest/' + encodeURIComponent(cur));
    const d = await r.json();
    if (d.rates && d.rates.THB) return (_billFx[key] = { rate: d.rates.THB, src: 'อัตราล่าสุด (ไม่ใช่ของวันนั้น)' });
  } catch (e) {}
  if (cur === 'USD' && state.usdThb) return { rate: state.usdThb, src: 'อัตรา USD ในแอป' };
  return { rate: 0, src: 'ดึงอัตราไม่ได้ — ใส่เอง' };
}
async function billFxToThb(cur) { return (await billFxRate(cur)).rate; }

// ค่าธรรมเนียมแปลงสกุลเงินของบัตรเครดิต (ธนาคารไทยส่วนใหญ่ 2–2.5%, Travel/Debit card บางใบ 0%)
function billDefaultFxFee() {
  const v = parseFloat(localStorage.getItem('folio_bill_fx_fee'));
  return isFinite(v) && v >= 0 ? v : 2.5;
}
function billCardFees() {
  try { return JSON.parse(localStorage.getItem('folio_bill_card_fees') || '{}') || {}; } catch (e) { return {}; }
}
function billCardFee(card) {
  const f = billCardFees()[card];
  if (typeof f === 'number' && f >= 0) return f;
  const pr = billRwProfile(card); // ค่าธรรมเนียมตามโปรไฟล์บัตร (เช่น ttb absolute 1%) ถ้ายังไม่ได้ตั้งเอง
  return pr && typeof pr.p.fxFee === 'number' ? pr.p.fxFee : billDefaultFxFee();
}
// ค่าธรรมเนียมที่ควรใช้กับรายการ: จ่ายด้วยบัตร = ตามบัตร, อย่างอื่น = 0 (เงินสดแลกมาแล้ว/โอน ให้ใส่อัตราที่ได้จริงแทน)
function billAutoFee(d) { return d.payMethod === 'card' ? billCardFee(d.card) : 0; }
// ยอดบาทของรายการในฟอร์ม: ยอดบาทจริง (ถ้าใส่) > ยอด × อัตรา × (1 + ค่าธรรมเนียม)
function billDraftThb(d) {
  if (d.currency === 'THB') return Number(d.amount) || 0;
  if (Number(d.thbActual) > 0) return Number(d.thbActual);
  return (Number(d.amount) || 0) * (Number(d.fx) || 0) * (1 + (Number(d.fee) || 0) / 100);
}
function billFxPreview(d) {
  if (d.currency === 'THB') return '';
  const amt = Number(d.amount) || 0, fx = Number(d.fx) || 0, fee = Number(d.fee) || 0;
  const base = amt * fx;
  if (Number(d.thbActual) > 0) {
    const diff = base > 0 ? (Number(d.thbActual) / base - 1) * 100 : 0;
    return `✅ ใช้ยอดบาทจริง <strong>${billFmt(d.thbActual)}</strong>` + (base > 0 ? ` <span style="color:var(--text3);">(ส่วนต่างจากอัตรากลาง ${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%)</span>` : '');
  }
  if (!(amt > 0 && fx > 0)) return '<span style="color:var(--amber);">ใส่ยอดและอัตราให้ครบ</span>';
  return `${esc(d.currency)} ${amt.toLocaleString()} × ${fx.toFixed(4)} = ${billFmt(base)}` +
    (fee ? ` + ค่าธรรมเนียม ${fee}% ${billFmt(base * fee / 100)}` : '') +
    ` → <strong>≈ ${billFmt(base * (1 + fee / 100))}</strong> <span style="color:var(--text3);">(ประมาณการ)</span>`;
}
// เปลี่ยนสกุลเงิน/วันที่ → ดึงอัตราของวันนั้นใหม่; เปลี่ยนช่องทาง/บัตร → ค่าธรรมเนียมตามบัตร (ถ้ายังไม่ได้แก้เอง)
async function billDraftRefreshFx(i) {
  const d = billState.drafts[i];
  if (!d || d.currency === 'THB') return;
  const r = await billFxRate(d.currency, d.date);
  d.fx = r.rate ? Math.round(r.rate * 1e6) / 1e6 : d.fx;
  d.fxSrc = r.src;
  if (!d.feeManual) d.fee = billAutoFee(d);
  billMarkDuplicates();
  billRenderDrafts();
}

// ทำเครื่องหมายรายการซ้ำ: เลขอ้างอิงเดียวกัน = ซ้ำแน่นอน (ไม่ติ๊กให้), วัน+ยอด+ประเภทตรงกัน = อาจซ้ำ (เตือนเฉย ๆ)
function billMarkDuplicates() {
  const seen = {};
  billState.drafts.forEach(d => {
    d.dup = null;
    const rk = billRefKey(d.ref);
    const others = (state.transactions || []).filter(t => t.id !== billState.editingId);
    const thb = billDraftThb(d);
    if (rk) {
      // เลขอ้างอิงเดียวกัน + ยอดเท่ากัน = สลิปซ้ำแน่นอน; เลขเดียวกันแต่ยอดต่างกัน (เช่นเลขใบเสร็จ POS ซ้ำข้ามร้าน) = เตือนเฉย ๆ
      // เทียบด้วยยอด+สกุลเดิมในสลิป (ไม่ผูกวันที่/ยอดบาทที่แก้ทีหลังได้)
      const cur = d.currency || 'THB', amt = Number(d.amount) || 0;
      const same = x => x.cur === cur && Math.abs(x.amt - amt) < 0.01;
      const prior = others.filter(t => t.refKey === rk).map(t => ({ cur: t.currency || 'THB', amt: Number(t.amount) || 0, who: t.merchant || billCat(t.category, t.type).label }))
        .concat(seen[rk] || []);
      if (prior.some(same)) d.dup = 'ref';
      else if (prior.length) d.dup = 'refdiff:' + prior[0].who;
      (seen[rk] = seen[rk] || []).push({ cur, amt, who: d.merchant || '' });
    }
    if (!d.dup && Number(d.amount) > 0) {
      const hit = others.find(t => t.date === d.date && t.type === d.type && Math.abs(billAmtThb(t) - thb) < 0.01);
      if (hit) d.dup = 'maybe:' + (hit.merchant || billCat(hit.category, hit.type).label);
    }
  });
}

// blur ช่องที่โฟกัสอยู่ก่อนเปลี่ยนชุด draft — ไม่งั้น onchange ที่ค้างจะยิงใส่ draft ชุดใหม่ตอนช่องเดิมถูกลบ
function billBlurForm() { const a = document.activeElement, box = document.getElementById('billDrafts'); if (a && box && box.contains(a)) a.blur(); }
function billOpenConfirm(drafts, note) {
  billBlurForm();
  billState.drafts = drafts;
  billMarkDuplicates();
  billState.drafts.forEach(d => { if (d.dup === 'ref' && !billState.editingId) d.include = false; });
  document.getElementById('billConfirmNote').textContent = note || '';
  billRenderDrafts();
  openModal('bill-confirm-modal');
}
function billCloseConfirm() { billBlurForm(); closeModal('bill-confirm-modal'); billState.drafts = []; billState.editingId = null; }

function billRenderDrafts() {
  billBlurForm(); // ช่องที่โฟกัสอยู่จะถูกลบตอนวาดใหม่ → ให้ blur/change ทำงานก่อน ไม่ให้ซ้อนกลางการวาด
  const ds = billState.drafts;
  const editing = !!billState.editingId;
  document.getElementById('billConfirmTitle').textContent = editing ? 'แก้ไขรายการ' : (ds.length === 1 && ds[0].source === 'manual' ? 'เพิ่มรายการ' : ds.length > 1 ? 'ตรวจสอบ ' + ds.length + ' รายการก่อนบันทึก' : 'ตรวจสอบก่อนบันทึก');
  const n = ds.filter(d => d.include).length;
  const btn = document.getElementById('billSaveBtn');
  btn.textContent = editing ? 'บันทึกการแก้ไข' : 'บันทึก ' + n + ' รายการ';
  btn.disabled = !n;
  if (!ds.length) { document.getElementById('billDrafts').innerHTML = '<div class="empty">AI ไม่พบรายการเงินในข้อมูลนี้</div>'; btn.disabled = true; return; }
  document.getElementById('billDrafts').innerHTML = ds.map((d, i) => {
    const catOpts = BILL_CATS[d.type].map(c => `<option value="${c.key}" ${c.key === d.category ? 'selected' : ''}>${c.icon} ${esc(c.label)}</option>`).join('');
    const curs = ['THB', 'USD', 'EUR', 'JPY', 'KRW', 'CNY', 'TWD', 'HKD', 'SGD', 'MYR', 'VND', 'LAK', 'GBP', 'AUD', 'CHF'];
    if (!curs.includes(d.currency)) curs.push(d.currency);
    const showCard = d.payMethod === 'card' || d.category === 'cc_payment';
    const inst = !editing && d.plan === 'inst' && d.type === 'expense';
    const sub = !editing && d.plan === 'sub' && d.type === 'expense';
    const payOpts = Object.keys(BILL_PAY).map(k => `<option value="${k}" ${k === d.payMethod ? 'selected' : ''}>${BILL_PAY[k]}</option>`).join('');
    const curOpts = curs.map(c => `<option ${c === d.currency ? 'selected' : ''}>${c}</option>`).join('');
    let warn = '';
    if (d.dup === 'ref') warn = `<div class="bill-warn" style="background:var(--red-bg);color:var(--red);">⛔ เลขอ้างอิงนี้บันทึกไปแล้ว — น่าจะเป็นสลิปซ้ำ</div>`;
    else if (d.dup && d.dup.startsWith('refdiff:')) warn = `<div class="bill-warn" style="background:var(--amber-bg);color:var(--amber);">⚠️ เลขอ้างอิงนี้เคยใช้กับรายการอื่น (${esc(d.dup.slice(8))}) แต่ยอดต่างกัน — น่าจะไม่ซ้ำ ตรวจดูก่อนบันทึก</div>`;
    else if (d.dup) warn = `<div class="bill-warn" style="background:var(--amber-bg);color:var(--amber);">⚠️ วันเดียวกันมียอดเท่ากันแล้ว (${esc(d.dup.slice(6))}) — ตรวจว่าไม่ซ้ำ</div>`;
    if (editing && d.subscriptionId) warn += `<div class="bill-warn" style="background:var(--accent-bg, var(--bg2));color:var(--text2);">🔁 รอบที่ ${d.subscriptionNo} ของ Subscription — แก้ไขเฉพาะรอบนี้ (เปลี่ยนราคารอบถัดไปที่การ์ด 🔁 Subscription)</div>`;
    if (editing && d.installmentOf > 1) warn += `<div class="bill-warn" style="background:var(--accent-bg, var(--bg2));color:var(--text2);">🗓️ งวด ${d.installmentNo}/${d.installmentOf} ของรายการผ่อน — แก้ไขเฉพาะงวดนี้</div>`;
    if (d.aiRead && !(Number(d.amount) > 0)) warn += `<div class="bill-warn" style="background:var(--amber-bg);color:var(--amber);">AI อ่านยอดไม่ได้ — กรอกยอดเอง</div>`;
    const moreOpen = !!(d.moreOpen || d.currency !== 'THB' || d.time || d.ref || d.note || d.rewardTag || d.thbActual || (!editing && d.plan !== 'once'));
    return `<div class="bill-draft ${d.include ? '' : 'off'}">
      ${warn}
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        ${editing || ds.length === 1 ? '' : `<input type="checkbox" ${d.include ? 'checked' : ''} onchange="billDraftSet(${i},'include',this.checked,true)" style="width:16px;height:16px;accent-color:var(--accent);">`}
        <div class="bill-type-toggle" style="flex:1;">
          <button class="${d.type === 'expense' ? 'on-expense' : ''}" onclick="billDraftSet(${i},'type','expense',true)">− รายจ่าย</button>
          <button class="${d.type === 'income' ? 'on-income' : ''}" onclick="billDraftSet(${i},'type','income',true)">+ รายรับ</button>
        </div>
      </div>
      <div class="bill-draft-grid">
        <div class="form-group full"><label class="form-label">${inst ? 'ผ่อนเดือนละ' : sub ? (d.subCycle === 'yearly' ? 'ค่าสมาชิกต่อปี' : 'ค่าสมาชิกต่อเดือน') : 'ยอด'}</label><input class="form-input" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(d.amount)}" oninput="billDraftSet(${i},'amount',this.value)" id="billAmt${i}" style="font-weight:700;font-size:22px;padding:6px 12px;min-height:46px;"></div>
        ${inst ? `<div class="form-group"><label class="form-label">ผ่อนทั้งหมด (งวด)</label><input class="form-input" type="number" inputmode="numeric" step="1" min="2" max="120" value="${esc(d.instMonths)}" oninput="billDraftSet(${i},'instMonths',this.value)" style="font-weight:600;font-size:15px;"></div>
        <div class="form-group full"><label class="form-label">จ่ายไปแล้วกี่งวด (แผนใหม่ใส่ 0)</label><input class="form-input" type="number" inputmode="numeric" step="1" min="0" value="${esc(d.instPaid)}" oninput="billDraftSet(${i},'instPaid',this.value)"></div>
        <div class="form-group full"><div id="billInstPrev${i}" style="font-size:11.5px;background:var(--surface);border:0.5px dashed var(--border2);border-radius:8px;padding:7px 10px;line-height:1.6;">${billInstPreview(d)}</div></div>` : ''}
        ${sub ? `<div class="form-group"><label class="form-label">รอบบิล</label><select class="form-select" onchange="billDraftSet(${i},'subCycle',this.value,true)"><option value="monthly" ${d.subCycle !== 'yearly' ? 'selected' : ''}>รายเดือน</option><option value="yearly" ${d.subCycle === 'yearly' ? 'selected' : ''}>รายปี</option></select></div>
        <div class="form-group full"><div id="billSubPrev${i}" style="font-size:11.5px;background:var(--surface);border:0.5px dashed var(--border2);border-radius:8px;padding:7px 10px;line-height:1.6;">${billSubPreview(d)}</div></div>` : ''}
        ${billCatField(d, i)}
        ${d.type === 'income' && d.category === 'refund' ? `<div class="form-group full"><label class="form-label">หักออกจากค่าใช้จ่ายหมวด</label><select class="form-select" onchange="billDraftSet(${i},'offsetCat',this.value)">${billOffsetCats().map(c => `<option value="${c.key}" ${c.key === d.offsetCat ? 'selected' : ''}>${c.icon} ${esc(c.label)}</option>`).join('')}</select><span style="font-size:10px;color:var(--text3);line-height:1.5;">ไม่นับเป็นรายรับ — หักจากรายจ่ายของเดือนที่บันทึก (ถ้าคืนข้ามเดือน ตั้งวันที่เป็นวันที่จ่ายเดิมได้)</span></div>` : ''}
        ${billPayField(d, i)}
        ${showCard && d.category === 'cc_payment' ? billCardField(d, i) : ''}
        ${billRwRecBox(d, i)}
        <div class="form-group full"><label class="form-label">${d.type === 'income' ? 'จาก' : 'ร้าน / ผู้รับเงิน'}</label><input class="form-input" value="${esc(d.merchant)}" list="billMerch${i}" autocomplete="off" oninput="billDraftMerchant(${i},this.value,event)" onchange="billDraftMerchant(${i},this.value)"><datalist id="billMerch${i}">${billMerchantOptions()}</datalist></div>
        <div class="form-group full"><label class="form-label" id="billDateLbl${i}">${inst ? (Number(d.instPaid) > 0 ? 'วันที่งวดถัดไป' : 'วันที่งวดแรก') : sub ? 'วันตัดรอบแรก' : 'วันที่'}</label><div style="display:flex;gap:6px;align-items:center;"><input class="form-input" type="date" value="${esc(d.date)}" onchange="billDraftSet(${i},'date',this.value,true)" style="flex:1;min-width:0;">${!inst && !sub ? `<button type="button" class="bill-chip bill-quick ${d.date === todayISO() ? 'on' : ''}" onclick="billDraftSet(${i},'date',todayISO(),true)">วันนี้</button><button type="button" class="bill-chip bill-quick ${d.date === billIsoAdd(todayISO(), -1) ? 'on' : ''}" onclick="billDraftSet(${i},'date',billIsoAdd(todayISO(), -1),true)">เมื่อวาน</button>` : ''}</div></div>
        <details class="full bill-more" ${moreOpen ? 'open' : ''} ontoggle="if(billState.drafts[${i}])billState.drafts[${i}].moreOpen=this.open">
          <summary>เพิ่มเติม ▾ <span style="color:var(--text3);font-size:11px;margin-left:6px;white-space:nowrap;">ผ่อน · สกุลเงิน · เวลา · โน้ต</span></summary>
          <div class="bill-draft-grid" style="margin-top:8px;">
            ${!editing && d.type === 'expense' ? `<div class="form-group full"><label class="form-label">รูปแบบการจ่าย</label><select class="form-select" onchange="billDraftSet(${i},'plan',this.value,true)">${[['once', 'จ่ายครั้งเดียว'], ['inst', '🗓️ ผ่อนชำระรายเดือน (มีจำนวนงวด)'], ['sub', '🔁 Subscription (หักอัตโนมัติทุกรอบ)']].map(([k, l]) => `<option value="${k}" ${d.plan === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : ''}
            <div class="form-group"><label class="form-label">สกุลเงิน</label><select class="form-select" onchange="billDraftCurrency(${i},this.value)">${curOpts}</select></div>
        ${d.currency !== 'THB' ? `<div class="form-group"><label class="form-label">อัตรา 1 ${esc(d.currency)} = ? บาท</label><input class="form-input" type="number" step="0.0001" min="0" value="${esc(d.fx || '')}" oninput="billDraftSet(${i},'fx',this.value)"><span style="font-size:10px;color:var(--text3);">${esc(d.fxSrc || '')}</span></div>
        <div class="form-group"><label class="form-label">ค่าธรรมเนียมแปลงสกุล %</label><input class="form-input" type="number" step="0.1" min="0" value="${esc(d.fee == null ? '' : d.fee)}" oninput="billDraftSet(${i},'fee',this.value)"><span style="font-size:10px;color:var(--text3);">${d.payMethod === 'card' ? 'ตามบัตร ' + esc(d.card || '(ค่าเริ่มต้น)') : 'ไม่ใช่บัตร = 0%'}</span></div>
        <div class="form-group full"><div id="billFxPrev${i}" style="font-size:11.5px;background:var(--surface);border:0.5px dashed var(--border2);border-radius:8px;padding:7px 10px;line-height:1.6;">${billFxPreview(d)}</div></div>
        <div class="form-group full"><label class="form-label">ยอดบาทจริง (จากแอปธนาคาร/สเตทเมนต์ — ถ้ามี ใช้แทนยอดประมาณ)</label><input class="form-input" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(d.thbActual)}" placeholder="เว้นว่างได้ แก้ทีหลังได้" oninput="billDraftSet(${i},'thbActual',this.value)"></div>` : ''}
            <div class="form-group full"><label class="form-label">เวลา</label><input class="form-input" type="time" value="${esc(d.time)}" onchange="billDraftSet(${i},'time',this.value)"></div>
            <div class="form-group full"><label class="form-label">เลขอ้างอิงสลิป (กันบันทึกซ้ำ)</label><input class="form-input" value="${esc(d.ref)}" placeholder="ถ้ามี" onchange="billDraftSet(${i},'ref',this.value,true)"></div>
            <div class="form-group full"><label class="form-label">โน้ต</label><input class="form-input" value="${esc(d.note)}" oninput="billDraftSet(${i},'note',this.value)"></div>
            ${billRwTagField(d, i)}
          </div>
        </details>
      </div>
      ${editing ? `<button class="btn-ghost" style="width:100%;margin-top:10px;min-height:44px;" onclick="billDraftRepeat(${i})">🔁 บันทึกอีกครั้งวันนี้</button>` : ''}
      ${editing ? `<button class="btn-ghost" style="width:100%;margin-top:8px;min-height:44px;color:var(--red);" onclick="billDeleteFromForm()">🗑️ ลบรายการนี้</button>` : ''}
      <div style="font-size:10px;color:var(--text3);margin-top:6px;">${esc(BILL_SOURCES[d.source] || '')}${d.aiRead ? ' · อ่านโดย Gemini — ตรวจยอดและหมวดก่อนบันทึก' : ''}</div>
    </div>`;
  }).join('');
}

// ช่อง "บัตรใบไหน": dropdown จากรายชื่อบัตร + เพิ่มบัตรใหม่ได้ในที่เดียว
function billCardField(d, i) {
  const list = billCards();
  if (d.addingCard) {
    return `<div class="form-group"><label class="form-label">ชื่อบัตรใหม่</label>
      <div style="display:flex;gap:4px;"><input class="form-input" id="billNewCard${i}" placeholder="เช่น KTC 1234" style="min-width:0;" onkeydown="if(event.key==='Enter')billDraftAddCard(${i})">
      <button class="btn-primary" style="flex:none;padding:6px 10px;font-size:12px;" onclick="billDraftAddCard(${i})">บันทึก</button></div>
      <button class="bill-del" style="text-align:left;font-size:11px;" onclick="billDraftSet(${i},'addingCard',false,true)">← เลือกจากรายชื่อ</button></div>`;
  }
  const unknown = d.card && !list.includes(d.card);
  const opts = ['<option value="">— เลือกบัตร —</option>']
    .concat(list.map(c => `<option value="${esc(c)}" ${c === d.card ? 'selected' : ''}>💳 ${esc(c)}</option>`))
    .concat(unknown ? [`<option value="${esc(d.card)}" selected>🆕 ${esc(d.card)} (ยังไม่อยู่ในรายชื่อ)</option>`] : [])
    .concat(['<option value="__new">➕ เพิ่มบัตรใหม่...</option>']).join('');
  return `<div class="form-group"><label class="form-label">บัตรใบไหน</label>
    <select class="form-select" onchange="billDraftPickCard(${i},this.value)">${opts}</select>
    ${unknown ? `<button class="bill-del" style="text-align:left;font-size:11px;color:var(--accent);" onclick="billDraftSaveUnknownCard(${i})">💾 บันทึก "${esc(d.card)}" ลง dropdown</button>` : ''}</div>`;
}
function billDraftPickCard(i, v) {
  const d = billState.drafts[i];
  if (!d) return;
  if (v === '__new') { d.addingCard = true; billRenderDrafts(); setTimeout(() => { const el = document.getElementById('billNewCard' + i); if (el) el.focus(); }, 30); return; }
  d.card = v;
  if (d.currency !== 'THB' && !d.feeManual) { d.fee = billAutoFee(d); billRenderDrafts(); }
}
function billDraftAddCard(i) {
  const d = billState.drafts[i];
  const el = document.getElementById('billNewCard' + i);
  if (!d || !el || !el.value.trim()) { showToast('พิมพ์ชื่อบัตรก่อน'); return; }
  d.card = billAddCard(el.value);
  d.addingCard = false;
  billRenderDrafts();
}
function billDraftSaveUnknownCard(i) {
  const d = billState.drafts[i];
  if (!d || !d.card) return;
  d.card = billAddCard(d.card);
  billRenderDrafts();
}

// rerender = true เฉพาะช่องที่เปลี่ยนหน้าตาฟอร์ม (ไม่ rerender ตอนพิมพ์ ไม่งั้น focus หลุด)
// ─── ฟอร์มบันทึกแบบเร็ว: ตารางหมวด / ชิปช่องทางจ่าย / จำร้าน / บันทึกซ้ำ ───
// หมวดที่ใช้บ่อยสุดใน 90 วันล่าสุด (ตามประเภท) เติมให้ครบ 8 ด้วยลำดับเริ่มต้น — หมวดที่เลือกอยู่ต้องมองเห็นเสมอ
function billTopCats(type, selected) {
  const since = billIsoAdd(todayISO(), -90), cnt = {};
  (state.transactions || []).forEach(t => { if (t.type === type && t.date >= since && !BILL_NON_SPEND.includes(t.category) && t.category !== 'refund') cnt[t.category] = (cnt[t.category] || 0) + 1; });
  const all = BILL_CATS[type].map(c => c.key), skip = k => BILL_NON_SPEND.includes(k) || k === 'refund';
  const top = Object.keys(cnt).filter(k => all.includes(k)).sort((a, b) => cnt[b] - cnt[a] || all.indexOf(a) - all.indexOf(b)).slice(0, 8);
  all.forEach(k => { if (top.length < 8 && !top.includes(k) && !skip(k)) top.push(k); });
  if (selected && all.includes(selected) && !top.includes(selected)) top[top.length - 1] = selected;
  return top;
}
function billCatField(d, i) {
  const keys = d.catAll ? BILL_CATS[d.type].map(c => c.key) : billTopCats(d.type, d.category);
  const tiles = keys.map(k => { const c = billCat(k, d.type); return `<button type="button" class="bill-cat-tile ${k === d.category ? 'on' : ''}" onclick="billDraftSet(${i},'category','${k}',true)"><span class="ic">${c.icon}</span><span class="lb">${esc(c.label)}</span></button>`; }).join('');
  return `<div class="form-group full"><label class="form-label" style="display:flex;justify-content:space-between;">หมวด<button type="button" class="bill-del" style="font-size:11px;color:var(--accent);" onclick="billDraftSet(${i},'catAll',${!d.catAll},true)">${d.catAll ? 'แสดงเฉพาะที่ใช้บ่อย ▴' : 'ทั้งหมด ▾'}</button></label><div class="bill-cat-grid">${tiles}</div></div>`;
}
// จ่ายด้วย: เงินสด / โอน / e-Wallet / บัตรแต่ละใบ — แตะเดียวตั้ง payMethod (+ card)
function billPayField(d, i) {
  const chip = (on, label, click) => `<button type="button" class="bill-pay-chip ${on ? 'on' : ''}" onclick="${click}">${label}</button>`;
  const list = billCards();
  let html = ['cash', 'transfer', 'ewallet'].map(k => chip(d.payMethod === k, BILL_PAY[k], `billDraftSet(${i},'payMethod','${k}',true)`)).join('');
  if (d.category !== 'cc_payment') {
    const cards = list.slice();
    if (d.payMethod === 'card' && d.card && !cards.includes(d.card)) cards.push(d.card);
    html += cards.map(c => chip(d.payMethod === 'card' && d.card === c, '💳 ' + esc(c), `billDraftUseCard(${i},this.dataset.c)" data-c="${esc(c)}`)).join('');
    html += chip(d.addingCard, '＋ บัตรใหม่', `billDraftPickCard(${i},'__new')`);
    if (d.payMethod === 'card' && !d.card && !d.addingCard) html += '';
  }
  return `<div class="form-group full"><label class="form-label">${d.type === 'income' ? 'รับเงินทาง' : 'จ่ายด้วย'}</label><div class="bill-pay-chips">${html}</div>${d.addingCard && d.category !== 'cc_payment' ? billCardField(d, i) : ''}</div>`;
}
function billLastByMerchant(name, type) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return null;
  let best = null;
  (state.transactions || []).forEach(t => {
    if (t.type !== type || String(t.merchant || '').trim().toLowerCase() !== key) return;
    if (!best || (t.date + (t.time || '')) > (best.date + (best.time || ''))) best = t;
  });
  return best;
}
function billMerchantOptions() {
  const seen = new Set(), out = [];
  (state.transactions || []).slice().sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''))).forEach(t => {
    const m = String(t.merchant || '').trim(), k = m.toLowerCase();
    if (m && !seen.has(k) && out.length < 60) { seen.add(k); out.push(`<option value="${esc(m)}"></option>`); }
  });
  return out.join('');
}
// พิมพ์/เลือกชื่อร้าน → ถ้าเป็นฟอร์มเพิ่มใหม่ที่ยังไม่ได้เลือกหมวด/ช่องทางเอง เติมจากรายการล่าสุดของร้านนั้น (เติมเฉพาะตอนเลือกจากรายการเสนอหรือออกจากช่อง — ไม่รบกวนระหว่างพิมพ์)
function billDraftMerchant(i, v, ev) {
  const d = billState.drafts[i];
  if (!d) return;
  d.merchant = v;
  if (ev && ev.inputType && ev.inputType !== 'insertReplacementText') return;
  if (billState.editingId || d._touched || d.aiRead || d.source !== 'manual' || d.plan !== 'once' || d.currency !== 'THB') return;
  const last = billLastByMerchant(v, d.type);
  if (!last || (last.category === d.category && last.payMethod === d.payMethod && (last.card || '') === (d.card || ''))) return;
  if (BILL_CATS[d.type].some(c => c.key === last.category)) d.category = last.category;
  d.payMethod = BILL_PAY[last.payMethod] ? last.payMethod : 'unknown';
  d.card = d.payMethod === 'card' ? billMatchCard(last.card) : '';
  billMarkDuplicates(); billRenderDrafts();
}
// บันทึกซ้ำ: สร้างรายการใหม่วันนี้จากรายการเดิม — ไม่คัดลอก ref / งวดผ่อน / Subscription / ยอดบาทจริง
function billDraftRepeat(i) {
  const s = billState.drafts[i];
  if (!s) return;
  const n = billNewDraft({ type: s.type, category: s.category, amount: Number(s.amount) || 0, currency: s.currency, fx: s.currency === 'THB' ? 1 : Number(s.fx) || 0,
    fxFeePct: s.fee == null || s.fee === '' ? undefined : Number(s.fee), payMethod: s.payMethod, card: s.card, merchant: s.merchant, note: s.note, rewardTag: s.rewardTag, offsetCat: s.offsetCat, source: 'manual' });
  billState.editingId = null;
  billOpenConfirm([n], '');
  showToast('สร้างรายการใหม่จากรายการเดิม — ตรวจยอดแล้วบันทึก');
}

function billDraftSet(i, field, value, rerender) {
  const d = billState.drafts[i];
  if (!d) return;
  d[field] = value;
  if (field === 'type') d.category = d.type === 'income' ? 'other_in' : 'other';
  if (field === 'plan' && value === 'sub' && d.category === 'other') d.category = 'entertainment';
  if (field === 'category' && value === 'cc_payment' && d.payMethod === 'unknown') d.payMethod = 'transfer';
  if (field === 'fee') d.feeManual = true;
  if (field === 'category' || field === 'payMethod') d._touched = true; // ผู้ใช้เลือกเองแล้ว → จำร้านต้องไม่เติมทับ
  if (field === 'amount' || field === 'fx' || field === 'fee' || field === 'thbActual' || field === 'instMonths' || field === 'instPaid') {
    billMarkDuplicates();
    const prev = document.getElementById('billFxPrev' + i);
    if (prev) prev.innerHTML = billFxPreview(d);
    const ip = document.getElementById('billInstPrev' + i);
    if (ip) ip.innerHTML = billInstPreview(d);
    const sp = document.getElementById('billSubPrev' + i);
    if (sp) sp.innerHTML = billSubPreview(d);
    const dl = document.getElementById('billDateLbl' + i);
    if (dl && field === 'instPaid') dl.textContent = Number(d.instPaid) > 0 ? 'วันที่งวดถัดไป' : 'วันที่งวดแรก';
  }
  // ช่องทาง/บัตรเปลี่ยน → ค่าธรรมเนียมตามบัตรใหม่; วันที่เปลี่ยน → อัตราของวันใหม่
  if ((field === 'payMethod' || field === 'card') && d.currency !== 'THB' && !d.feeManual) d.fee = billAutoFee(d);
  if (field === 'date' && d.currency !== 'THB') { billDraftRefreshFx(i); return; }
  if (rerender) { billMarkDuplicates(); billRenderDrafts(); }
  else if (field === 'include') billRenderDrafts();
  else { const rw = document.getElementById('billRwRec' + i); if (rw) rw.innerHTML = billRwRecHtml(d, i); }
}
async function billDraftCurrency(i, cur) {
  const d = billState.drafts[i];
  if (!d) return;
  d.currency = cur;
  d.thbActual = '';
  if (cur === 'THB') { d.fx = 1; d.fee = 0; d.fxSrc = ''; billMarkDuplicates(); billRenderDrafts(); return; }
  d.fx = 0;
  await billDraftRefreshFx(i);
}

// บันทึกด้วย id ผูกเลขอ้างอิง: ถ้ามี id นี้อยู่แล้วและยอด+สกุลเท่ากัน = สลิปเดิม (ข้าม, คืน false);
// ถ้ายอดต่างกัน (เลขอ้างอิงซ้ำโดยบังเอิญ) = รายการใหม่จริง บันทึกด้วย id สุ่ม
async function billPutByRef(refKey, row) {
  const id = 'ref_' + refKey;
  // ดูในข้อมูลที่ listener โหลดไว้ก่อน (รวมรายการที่เพิ่งเขียนตอนออฟไลน์ที่ยังไม่ขึ้นเซิร์ฟเวอร์) แล้วค่อยถามเซิร์ฟเวอร์/cache
  const ex = (state.transactions || []).find(t => t.id === id) || await window.FB.get('transactions', id);
  if (!ex) { await window.FB.put('transactions', id, row); return true; }
  if ((ex.currency || 'THB') === (row.currency || 'THB') && Math.abs((Number(ex.amount) || 0) - (Number(row.amount) || 0)) < 0.01) return false;
  await window.FB.add('transactions', row);
  return true;
}

async function billSaveDrafts() {
  const btn = document.getElementById('billSaveBtn');
  const items = billState.drafts.filter(d => d.include);
  for (const d of items) {
    if (!(Number(d.amount) > 0)) { showToast('กรอกยอดให้ครบทุกรายการ'); return; }
    if (d.currency !== 'THB' && !(Number(d.fx) > 0) && !(Number(d.thbActual) > 0)) { showToast('ใส่อัตราแลกเปลี่ยนหรือยอดบาทจริงของ ' + d.currency); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) { showToast('วันที่ไม่ถูกต้อง'); return; }
    if (!billState.editingId && d.plan === 'inst' && d.type === 'expense' && !billInstMonths(d)) { showToast('ผ่อนทั้งหมดต้องอยู่ระหว่าง 2–120 งวด'); return; }
    if (!billState.editingId && d.plan === 'inst' && d.type === 'expense' && billInstPaid(d) < 0) { showToast('งวดที่จ่ายแล้วต้องน้อยกว่าจำนวนงวดทั้งหมด'); return; }
  }
  billMarkDuplicates();
  if (items.some(d => d.dup === 'ref') && !confirm('มีรายการที่เลขอ้างอิงซ้ำกับที่บันทึกไว้แล้ว — รายการนั้นจะถูกข้าม ดำเนินการต่อ?')) return;
  btn.disabled = true;
  let saved = 0, skipped = 0;
  try {
    for (const d of items) {
      const fx = d.currency === 'THB' ? 1 : Number(d.fx);
      const refKey = billRefKey(d.ref);
      const data = {
        date: d.date, time: d.time || '', type: d.type, category: d.category,
        amount: Math.round(Number(d.amount) * 100) / 100, currency: d.currency, fxToThb: fx || 0,
        fxFeePct: d.currency === 'THB' ? 0 : (Number(d.fee) || 0),
        thbActual: d.currency !== 'THB' && Number(d.thbActual) > 0, // false = ยอดบาทประมาณ รอใส่ยอดจริง
        amountThb: Math.round(billDraftThb(d) * 100) / 100,
        merchant: d.merchant.trim(), note: d.note.trim(), ref: d.ref.trim(), refKey,
        source: d.source, aiRead: !!d.aiRead,
        payMethod: d.payMethod || 'unknown',
        card: (d.payMethod === 'card' || d.category === 'cc_payment') ? (d.card || '').trim() : '',
        offsetCat: d.type === 'income' && d.category === 'refund' ? (d.offsetCat || 'other') : '',
        rewardTag: d.type === 'expense' ? (d.rewardTag || '') : ''
      };
      if (billState.editingId) {
        if (d.dup === 'ref') { skipped++; continue; }
        if (window.FB) await window.FB.update('transactions', billState.editingId, data);
        else Object.assign(state.transactions.find(t => t.id === billState.editingId) || {}, data);
        saved++;
        continue;
      }
      if (d.dup === 'ref') { skipped++; continue; }
      if (d.plan === 'sub' && d.type === 'expense') { await billSubCreate(d, data); saved++; continue; }
      const n = d.plan === 'inst' && d.type === 'expense' ? billInstMonths(d) : 0;
      if (n) {
        // ผ่อน: สร้างรายการเดือนละงวด ผูกกันด้วย installmentId — เลขอ้างอิงสลิปติดไว้ที่งวดแรกเท่านั้น (กันชน id/เตือนซ้ำ)
        const instId = 'inst_' + Date.now().toString(36) + '_' + d.uid;
        const paid = billInstPaid(d);
        let instSkipped = false;
        for (let k = 0; k < n - paid; k++) {
          const row = { ...data, date: billInstDate(d.date, k), time: k ? '' : data.time,
            ref: k ? '' : data.ref, refKey: k ? '' : refKey,
            installmentId: instId, installmentNo: paid + k + 1, installmentOf: n };
          if (!window.FB) state.transactions.push({ id: 'local_' + d.uid + '_' + k, ...row });
          else if (!k && refKey) {
            if (!(await billPutByRef(refKey, row))) { instSkipped = true; break; }
          } else await window.FB.add('transactions', row);
        }
        if (instSkipped) skipped++; else saved++;
        continue;
      }
      if (!window.FB) { state.transactions.push({ id: 'local_' + d.uid, ...data }); saved++; continue; }
      if (refKey) {
        // id ผูกกับเลขอ้างอิง — แชร์สลิปเดิมซ้ำ (แม้จากอีกเครื่อง) จะไม่ได้เอกสารใหม่
        if (!(await billPutByRef(refKey, data))) { skipped++; continue; }
      } else {
        await window.FB.add('transactions', data);
      }
      saved++;
    }
  } catch (e) {
    showToast('บันทึกไม่สำเร็จ: ' + e.message);
    btn.disabled = false;
    return;
  }
  btn.disabled = false;
  const lastDate = items.length ? items[items.length - 1].date : '';
  billCloseConfirm();
  if (lastDate) { billState.month = lastDate.slice(0, 7); billState.listDate = lastDate; } // ให้เห็นรายการที่เพิ่งบันทึกทุกมุมมอง
  if (!window.FB) billRender();
  if (items.some(d => d.plan === 'sub')) billSubSync(); // ลงรอบที่ถึงแล้วที่เหลือ (รอบแรกบันทึกไปพร้อมกันแล้ว)
  showToast('✅ บันทึก ' + saved + ' รายการ' + (skipped ? ' · ข้ามรายการซ้ำ ' + skipped : ''));
}

function billOpenManual() {
  billState.editingId = null;
  const d = billNewDraft({ source: 'manual' }); // วันที่เริ่มต้น = วันนี้เสมอ (ไม่ตามเดือนที่กำลังดูอยู่)
  billOpenConfirm([d], '');
  setTimeout(() => { const el = document.getElementById('billAmt0'); if (el) el.focus(); }, 60); // ยอดโฟกัสทันที (แป้นตัวเลข)
}
function billOpenManualSub() {
  billState.editingId = null;
  const d = billNewDraft({ source: 'manual', category: 'entertainment' });
  d.plan = 'sub';
  billOpenConfirm([d], 'เช่น Netflix, Spotify, iCloud, ฟิตเนส — ระบบจะลงรายจ่ายให้อัตโนมัติทุกรอบจนกว่าจะกดยกเลิก');
}
function billEdit(id) {
  const t = (state.transactions || []).find(x => x.id === id);
  if (!t) return;
  billState.editingId = id;
  const d = billInitFee(billNewDraft({ ...t, fx: t.fxToThb }));
  d.aiRead = false;
  billOpenConfirm([d], '');
}

// ═══ Gemini: อ่านรูป / ข้อความ → JSON ═══
function billSchema() {
  const allCats = BILL_CATS.expense.concat(BILL_CATS.income).map(c => c.key);
  return {
    type: 'OBJECT',
    properties: {
      items: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            date: { type: 'STRING', description: 'YYYY-MM-DD ปี ค.ศ.' },
            time: { type: 'STRING', description: 'HH:MM 24 ชั่วโมง หรือ ""' },
            amount: { type: 'NUMBER' },
            currency: { type: 'STRING', description: 'ISO 4217 เช่น THB' },
            type: { type: 'STRING', enum: ['expense', 'income'] },
            category: { type: 'STRING', enum: allCats },
            merchant: { type: 'STRING' },
            ref: { type: 'STRING' },
            note: { type: 'STRING' },
            payMethod: { type: 'STRING', enum: Object.keys(BILL_PAY) },
            offsetCat: { type: 'STRING', enum: BILL_CATS.expense.filter(c => !BILL_NON_SPEND.includes(c.key)).map(c => c.key), description: 'เฉพาะ category=refund: หมวดรายจ่ายที่เงินคืนนี้หักออก' },
            card: { type: 'STRING', description: 'ชื่อบัตร/ธนาคาร + เลข 4 ตัวท้าย หรือ ""' },
            thbCharged: { type: 'NUMBER', description: 'ยอดเงินบาทที่ถูกเรียกเก็บจริง ถ้าเอกสารแสดงไว้คู่กับยอดสกุลต่างประเทศ ไม่มีใส่ 0' }
          },
          required: ['date', 'amount', 'currency', 'type', 'category', 'merchant', 'ref', 'payMethod', 'card']
        }
      }
    },
    required: ['items']
  };
}

function billRules() {
  const owner = (localStorage.getItem('folio_bill_owner') || '').trim();
  const catDesc = BILL_CATS.expense.map(c => c.key + '=' + c.label).join(', ');
  const incDesc = BILL_CATS.income.map(c => c.key + '=' + c.label).join(', ');
  return [
    'วันนี้คือ ' + todayISO() + ' (ค.ศ.)',
    'กฎ:',
    '- date: YYYY-MM-DD ปี ค.ศ. ถ้าเอกสารใช้ พ.ศ. (เช่น 2568 หรือ "68") ให้ลบ 543 ก่อน; ถ้าไม่มีวันที่ ใช้วันนี้; คำว่า "เมื่อวาน/วันจันทร์ที่แล้ว" ให้คำนวณจากวันนี้',
    '- amount: ตัวเลขบวก ไม่มีคอมมา เป็นยอดสุทธิที่จ่าย/ได้รับจริง (หลังส่วนลด รวม VAT/ค่าบริการ) ไม่ใช่ราคาสินค้าย่อย ไม่ใช่ยอดเงินคงเหลือในบัญชี',
    '- currency: ISO 4217 (฿ หรือ บาท = THB, ¥/円 = JPY, ₩ = KRW ฯลฯ); ใบเสร็จต่างประเทศให้ amount เป็นยอดในสกุลนั้น',
    '- thbCharged: ถ้าเป็นรายการสกุลต่างประเทศ และเอกสาร (เช่น แจ้งเตือนบัตร/แอปธนาคาร) แสดงยอดบาทที่ถูกเรียกเก็บด้วย ให้ใส่ยอดบาทนั้น; ไม่มีให้ใส่ 0',
    '- type: expense ถ้าเงินออกจากเจ้าของ, income ถ้าเงินเข้าเจ้าของ' + (owner ? ' — ชื่อเจ้าของบัญชีคือ "' + owner + '" (ถ้าเจ้าของเป็นผู้โอน = expense, เป็นผู้รับ = income)' : '') + '; ไม่แน่ใจให้ใช้ expense',
    '- category (expense): ' + catDesc + ' — โอนเข้าบัญชีหลักทรัพย์/กองทุน/บัญชีออมของตัวเอง = invest; โอน/ชำระยอดบัตรเครดิต = cc_payment; ต้นทุน/ค่าใช้จ่ายของกิจการตัวเอง = business; ทำบุญ/บริจาค/วัด/มูลนิธิ = donation; หวย/ลอตเตอรี่/สลาก = gamble; ตั๋วเครื่องบิน/โรงแรม/ทัวร์/ค่าใช้จ่ายระหว่างทริป = travel' + (billCustomCats().length ? '; หมวดที่ผู้ใช้ตั้งเอง: ' + billCustomCats().map(c => c.key + '=' + c.label).join(', ') + ' (ใช้เมื่อเข้ากับชื่อหมวดชัดเจน)' : '') + '',
    '- payMethod: card ถ้าจ่ายด้วยบัตรเครดิต (เห็น VISA/Mastercard/JCB/เลขบัตร ****), transfer ถ้าเป็นสลิปโอน/สแกน QR พร้อมเพย์, ewallet ถ้าจ่ายผ่าน TrueMoney/ShopeePay/LINE Pay ฯลฯ, cash ถ้าเป็นเงินสด, ไม่ทราบใช้ unknown',
    '- card: เมื่อ payMethod=card หรือ category=cc_payment ให้ใส่ชื่อบัตร/ธนาคาร + เลข 4 ตัวท้ายถ้ามี' + (billCards().length ? ' — ถ้าตรงกับบัตรของผู้ใช้ ให้ใช้ชื่อนี้ตรงตัว: ' + billCards().join(', ') : '') + '; ไม่ใช่บัตรใช้ ""',
    '- category (income): ' + incDesc,
    '- refund = เงินที่ได้คืน ไม่ใช่รายได้ เช่น เพื่อนโอนคืนค่าอาหาร/ค่าของที่หารกัน ร้านคืนเงิน คืนค่าสินค้า; ให้ใส่ offsetCat เป็นหมวดรายจ่ายที่เงินนี้หักออก (หารค่าข้าว = food, ค่าแท็กซี่ = transport, คืนสินค้า = shopping); เงินโอนจากเพื่อนยอดเล็ก ๆ ที่ไม่ใช่เงินเดือนมักเป็น refund',
    '- merchant: ชื่อร้าน/ผู้รับเงิน (expense) หรือผู้โอน/แหล่งเงิน (income) สั้น ๆ',
    '- ref: เลขที่รายการ/เลขอ้างอิง/Transaction ID/เลขที่ใบเสร็จ ที่ระบุเอกสารนี้ได้ ถ้าไม่มีใช้ ""',
    '- note: รายละเอียดสั้น ไม่เกิน 60 ตัวอักษร หรือ ""',
    '- ใบเสร็จ/สลิป 1 ใบ = 1 รายการ (ไม่แยกสินค้าทีละชิ้น); หน้าประวัติธุรกรรมหรือแจ้งเตือนหลายอัน = หลายรายการ',
    '- อย่าเดาตัวเลขที่มองไม่เห็น; ถ้าไม่ใช่ข้อมูลการเงิน ให้ items เป็น []'
  ].join('\n');
}

async function billAskGemini(parts) {
  const d = await callGemini({
    contents: [{ parts }],
    generationConfig: {
      temperature: 0, maxOutputTokens: 4096,
      responseMimeType: 'application/json', responseSchema: billSchema(),
      thinkingConfig: { thinkingBudget: 0 }
    }
  });
  const txt = (d.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  const parsed = safeParseJSON(txt);
  if (!parsed) throw new Error('อ่านคำตอบ AI ไม่ได้');
  return Array.isArray(parsed) ? parsed : (parsed.items || []);
}

function billGeminiErr(e) {
  return e.message === 'no_key' ? 'ใส่ Gemini Key ในหน้า ⚙️ ตั้งค่าก่อน' : e.message === 'all_quota' ? 'Gemini ทุก key หมด quota' : 'อ่านไม่สำเร็จ: ' + e.message;
}
function billBusy(on, text) {
  const el = document.getElementById('billBusy');
  el.style.display = on ? '' : 'none';
  if (text) document.getElementById('billBusyText').textContent = text;
}

// ย่อรูปก่อนส่ง: ลด token/เวลาอัปโหลด — กว้างไม่เกิน 1280px, สูงไม่เกิน 4000px (screenshot ยาวยังอ่านออก)
function billCompressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(1, 1280 / img.width, 4000 / img.height);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve({ mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.85).split(',')[1] });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      // decode ไม่ได้ (เช่น HEIC) → ส่งไฟล์ดิบถ้าไม่ใหญ่เกิน
      if (file.size > 15 * 1024 * 1024) { reject(new Error('ไฟล์ใหญ่เกินไป')); return; }
      const fr = new FileReader();
      fr.onload = () => resolve({ mime: file.type || 'image/jpeg', data: String(fr.result).split(',')[1] });
      fr.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'));
      fr.readAsDataURL(file);
    };
    img.src = url;
  });
}

function billOnFiles(input, source) {
  const files = Array.from(input.files || []);
  input.value = '';
  if (files.length) billProcessImages(files, source);
}

async function billProcessImages(files, source) {
  billState.editingId = null;
  const drafts = [];
  let failed = 0;
  for (let i = 0; i < files.length; i++) {
    billBusy(true, 'Gemini กำลังอ่านบิล ' + (files.length > 1 ? (i + 1) + '/' + files.length : '') + '...');
    try {
      const img = await billCompressImage(files[i]);
      const items = await billAskGemini([
        { text: 'คุณคือผู้ช่วยอ่านสลิปโอนเงิน/ใบเสร็จ/บิล/แจ้งเตือนธนาคารของไทย ดึงทุกรายการเงินเข้า-ออกในรูป ตอบเป็น JSON ตาม schema\n' + billRules() },
        { inline_data: { mime_type: img.mime, data: img.data } }
      ]);
      items.forEach(it => drafts.push(billNewDraft({ ...it, source, aiRead: true })));
    } catch (e) {
      failed++;
      showToast(billGeminiErr(e));
      if (e.message === 'no_key' || e.message === 'all_quota') break;
    }
  }
  billBusy(false);
  await billFillFx(drafts);
  if (!drafts.length && failed) return;
  billOpenConfirm(drafts, 'อ่านจาก ' + files.length + ' รูป' + (failed ? ' (อ่านไม่สำเร็จ ' + failed + ')' : '') + ' — รูปไม่ถูกเก็บ');
}

async function billProcessText(text, source) {
  billState.editingId = null;
  billBusy(true, 'Gemini กำลังแยกรายการ...');
  try {
    const items = await billAskGemini([{ text: 'แยกรายการรายรับ/รายจ่ายจากข้อความที่ผู้ใช้พิมพ์หรือพูด (หรือข้อความ SMS/แจ้งเตือนธนาคาร) ตอบเป็น JSON ตาม schema\n' + billRules() + '\n\nข้อความ:\n"""' + text.slice(0, 4000) + '"""' }]);
    const drafts = items.map(it => billNewDraft({ ...it, source, aiRead: true }));
    await billFillFx(drafts);
    billBusy(false);
    billOpenConfirm(drafts, '');
  } catch (e) {
    billBusy(false);
    showToast(billGeminiErr(e));
  }
}

async function billFillFx(drafts) {
  for (const d of drafts) {
    billInitFee(d);
    if (d.currency !== 'THB' && !(d.fx > 0)) { const r = await billFxRate(d.currency, d.date); d.fx = r.rate; d.fxSrc = r.src; }
  }
}

// ─── พิมพ์ / พูด ───
let _billRec = null;
function billOpenText() {
  billState.usedMic = false;
  document.getElementById('billTextInput').value = '';
  openModal('bill-text-modal');
  setTimeout(() => document.getElementById('billTextInput').focus(), 60);
}
function billToggleMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = document.getElementById('billMicBtn');
  if (!SR) { showToast('เบราว์เซอร์นี้ไม่รองรับการฟังเสียง — ใช้ปุ่มไมค์บนคีย์บอร์ดแทน'); return; }
  if (_billRec) { _billRec.stop(); return; }
  _billRec = new SR();
  _billRec.lang = 'th-TH';
  _billRec.interimResults = false;
  _billRec.continuous = false;
  _billRec.onresult = e => {
    const said = Array.from(e.results).map(r => r[0].transcript).join(' ');
    const ta = document.getElementById('billTextInput');
    ta.value = (ta.value ? ta.value + ' ' : '') + said;
    billState.usedMic = true;
  };
  _billRec.onerror = e => { if (e.error !== 'no-speech' && e.error !== 'aborted') showToast('ไมค์: ' + e.error); };
  _billRec.onend = () => { _billRec = null; btn.textContent = '🎤 กดเพื่อพูด'; };
  _billRec.start();
  btn.textContent = '⏹️ กำลังฟัง... กดเพื่อหยุด';
}
function billSubmitText() {
  const text = document.getElementById('billTextInput').value.trim();
  if (!text) { showToast('พิมพ์หรือพูดรายการก่อน'); return; }
  if (_billRec) _billRec.stop();
  closeModal('bill-text-modal');
  billProcessText(text, billState.usedMic ? 'voice' : 'text');
}

function billSaveOwner(v) {
  localStorage.setItem('folio_bill_owner', String(v || '').trim());
  billSyncSettings();
  showToast('บันทึกชื่อบัญชีแล้ว');
}
// ─── รายชื่อบัตร (dropdown) — เก็บใน localStorage + Firestore settings/bill ───
function billSetCards(list) {
  // ชื่อบัตรห้ามมี , เพราะ localStorage เก็บแบบคั่นด้วย ,
  localStorage.setItem('folio_bill_cards', list.map(c => c.replace(/,/g, ' ').trim()).filter(Boolean).join(', '));
  billSyncSettings();
  billRenderCardChips();
  if (document.getElementById('bill-confirm-modal').classList.contains('open')) billRenderDrafts();
}
// เพิ่มบัตรใหม่ (ไม่สนตัวพิมพ์เล็ก/ใหญ่ถ้าซ้ำ) — คืนชื่อที่ใช้จริงใน dropdown
function billAddCard(name) {
  name = String(name || '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) return '';
  const list = billCards();
  const same = list.find(c => c.toUpperCase() === name.toUpperCase());
  if (same) return same;
  billSetCards(list.concat(name));
  showToast('เพิ่มบัตร ' + name + ' แล้ว');
  return name;
}
function billAddCardFromInput() {
  const el = document.getElementById('billCardNew');
  if (!el.value.trim()) { showToast('พิมพ์ชื่อบัตรก่อน'); return; }
  billAddCard(el.value);
  el.value = '';
}
function billRemoveCard(i) {
  const list = billCards();
  if (!list[i] || !confirm('ลบบัตร ' + list[i] + ' ออกจากรายชื่อ? (รายการที่บันทึกไปแล้วยังอยู่ครบ)')) return;
  list.splice(i, 1);
  billSetCards(list);
}
function billRenderCardChips() {
  const el = document.getElementById('billCardChips');
  if (!el) return;
  const list = billCards();
  el.innerHTML = list.length
    ? list.map((c, i) => `<span class="bill-card-chip"><span style="cursor:pointer;" title="แตะเพื่อตั้งค่าธรรมเนียมแปลงสกุลเงินของบัตรนี้" onclick="billEditCardFee(${i})">💳 ${esc(c)} <span style="color:var(--text3);font-size:10.5px;">· FX ${billCardFee(c)}%</span></span><button title="ลบ" onclick="billRemoveCard(${i})">✕</button></span>`).join('')
    : '<span style="font-size:11px;color:var(--text3);">ยังไม่มีบัตร — เพิ่มด้านล่าง หรือเพิ่มจากหน้าบันทึกรายการก็ได้</span>';
}
function billEditCardFee(i) {
  const c = billCards()[i];
  if (!c) return;
  const v = prompt('ค่าธรรมเนียมแปลงสกุลเงินของบัตร ' + c + ' (%)\nบัตรเครดิตไทยส่วนใหญ่ 2–2.5%, Travel card/บัตรเดบิตบางใบ 0%', billCardFee(c));
  if (v === null) return;
  const n = parseFloat(String(v).replace('%', ''));
  if (!(n >= 0 && n <= 10)) { showToast('ใส่ตัวเลข 0–10'); return; }
  const fees = billCardFees(); fees[c] = n;
  localStorage.setItem('folio_bill_card_fees', JSON.stringify(fees));
  billSyncSettings(); billRenderCardChips();
  showToast(c + ': ค่าธรรมเนียม FX ' + n + '%');
}
function billSaveDefaultFee(v) {
  const n = parseFloat(v);
  if (!(n >= 0 && n <= 10)) { showToast('ใส่ตัวเลข 0–10'); return; }
  localStorage.setItem('folio_bill_fx_fee', String(n));
  billSyncSettings(); billRenderCardChips();
  showToast('ค่าธรรมเนียม FX เริ่มต้น ' + n + '%');
}
// เก็บชื่อบัญชี/บัตร/ค่าธรรมเนียมใน Firestore settings/bill ด้วย ให้ใช้ได้ทุกเครื่อง
// ไม่ sync จนกว่าจะโหลดค่าจาก cloud สำเร็จ (กันค่าว่างของเครื่องไปทับรายชื่อบัตร/หมวดบน cloud) และเขียนทับทั้งก้อนเพื่อให้การลบมีผล
function billSyncSettings() {
  if (!window.FB) return;
  try { localStorage.setItem('folio_bill_settings_dirty', '1'); } catch (e) {} // มีการแก้ที่ยังไม่ขึ้น cloud — ถ้าโหลดตอนเปิดแอปรอบหน้า ต้องส่งขึ้นไป ไม่ใช่ดึงลงมาทับ
  if (!window._billSettingsLoaded) return;
  window.FB.replace('settings', 'bill', {
    owner: localStorage.getItem('folio_bill_owner') || '', cards: billCards(), customCats: billCustomCats(),
    fxFee: billDefaultFxFee(), cardFees: billCardFees(), cardProfiles: billRwSaved(),
    rwMode2: localStorage.getItem('folio_bill_rw_mode2') || 'baht', rwMileBaht: billRwMileBaht(),
    statements: billStatements() // เฟส 6b — replace เขียนทับทั้งเอกสาร ต้องส่งทุกคีย์ไปด้วยเสมอ
  }).then(() => { try { localStorage.removeItem('folio_bill_settings_dirty'); } catch (e) {} }).catch(() => {});
}
// ─── จัดการหมวดที่เพิ่มเอง ───
function billOpenCatModal() { billRenderCustomCats(); openModal('billCatModal'); setTimeout(() => { const n = document.getElementById('billCatName'); if (n) n.focus(); }, 80); }
function billRenderCustomCats() {
  const el = document.getElementById('billCatCustomList'); if (!el) return;
  const list = billCustomCats();
  el.innerHTML = list.length
    ? '<div style="font-size:11px;font-weight:600;color:var(--text2);margin-bottom:6px;">หมวดที่เพิ่มไว้</div>' + list.map(c =>
        '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:0.5px solid var(--border);font-size:13px;">' +
        '<span class="bill-ico" style="background:' + esc(c.color) + '22;width:26px;height:26px;font-size:14px;">' + esc(c.icon || '🏷️') + '</span>' +
        '<span style="flex:1;">' + esc(c.label) + '</span>' +
        '<button data-k="' + esc(c.key) + '" onclick="billDeleteCustomCat(this.dataset.k)" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:13px;">✕</button></div>').join('')
    : '<div style="font-size:12px;color:var(--text3);">ยังไม่มีหมวดที่เพิ่มเอง</div>';
}
function billAddCustomCat() {
  const nameEl = document.getElementById('billCatName'), iconEl = document.getElementById('billCatIcon');
  const label = (nameEl.value || '').trim().replace(/\s+/g, ' ');
  if (!label) { showToast('ใส่ชื่อหมวดก่อน'); nameEl.focus(); return; }
  if (BILL_CATS.expense.some(c => c.label.toLowerCase() === label.toLowerCase())) { showToast('มีหมวด "' + label + '" อยู่แล้ว'); return; }
  const list = billCustomCats();
  if (list.length >= 20) { showToast('เพิ่มได้สูงสุด 20 หมวด'); return; }
  const icon = (iconEl.value || '').trim() || '🏷️';
  list.push({ key: 'c_' + Date.now().toString(36), label, icon, color: BILL_CUSTOM_COLORS[list.length % BILL_CUSTOM_COLORS.length] });
  localStorage.setItem('folio_bill_custom_cats', JSON.stringify(list));
  billApplyCustomCats(); billSyncSettings();
  nameEl.value = ''; iconEl.value = '';
  billRenderCustomCats();
  if (typeof billRender === 'function') billRender();
  showToast('เพิ่มหมวด ' + icon + ' ' + label + ' แล้ว');
}
function billDeleteCustomCat(key) {
  const c = billCustomCats().find(x => x.key === key); if (!c) return;
  const used = (state.transactions || []).filter(t => t.category === key || t.offsetCat === key).length;
  if (!confirm('ลบหมวด "' + c.label + '"?' + (used ? '\nมี ' + used + ' รายการที่ใช้หมวดนี้ — จะแสดงเป็น "อื่น ๆ" แทน (ข้อมูลไม่หาย ถ้าเพิ่มหมวดชื่อเดิมกลับมาจะไม่ผูกคืนอัตโนมัติ)' : ''))) return;
  localStorage.setItem('folio_bill_custom_cats', JSON.stringify(billCustomCats().filter(x => x.key !== key)));
  billApplyCustomCats(); billSyncSettings();
  billRenderCustomCats();
  if (typeof billRender === 'function') billRender();
}

async function billLoadSettings() {
  if (window._billSettingsLoaded || window._billSettingsLoading) return;
  window._billSettingsLoading = true;
  try {
    const doc = await window.FB.get('settings', 'bill');
    window._billSettingsLoaded = true; // โหลดสำเร็จ (ไม่มีเอกสาร = ยังไม่เคยตั้งค่า) → เริ่ม sync ได้
    let dirty = false;
    try { dirty = localStorage.getItem('folio_bill_settings_dirty') === '1'; } catch (e) {}
    if (dirty || !doc) { // มีการแก้ค้างในเครื่อง (เช่นแก้ตอนออฟไลน์) → ส่งขึ้น cloud ไม่ใช่ดึงลงมาทับ
      if (dirty || billCards().length || billCustomCats().length) billSyncSettings();
      return;
    }
    if (typeof doc.owner === 'string') localStorage.setItem('folio_bill_owner', doc.owner);
    if (Array.isArray(doc.cards)) localStorage.setItem('folio_bill_cards', doc.cards.join(', '));
    if (typeof doc.fxFee === 'number') localStorage.setItem('folio_bill_fx_fee', String(doc.fxFee));
    if (doc.cardFees && typeof doc.cardFees === 'object') localStorage.setItem('folio_bill_card_fees', JSON.stringify(doc.cardFees));
    if (doc.cardProfiles && typeof doc.cardProfiles === 'object') localStorage.setItem('folio_bill_card_profiles', JSON.stringify(doc.cardProfiles));
    if (doc.rwMode2 === 'rop' || doc.rwMode2 === 'baht' || doc.rwMode2 === 'raw') localStorage.setItem('folio_bill_rw_mode2', doc.rwMode2);
    if (typeof doc.rwMileBaht === 'number' && doc.rwMileBaht > 0) localStorage.setItem('folio_bill_rw_milebaht', String(doc.rwMileBaht));
    if (doc.statements && typeof doc.statements === 'object') localStorage.setItem('folio_bill_statements', JSON.stringify(doc.statements));
    if (Array.isArray(doc.customCats)) { localStorage.setItem('folio_bill_custom_cats', JSON.stringify(doc.customCats)); billApplyCustomCats(); }
    const page = document.getElementById('page-bills');
    if (page && page.classList.contains('active')) billRender();
  } catch (e) { console.warn('bill settings load', e); }
  window._billSettingsLoading = false;
}

// ═══ สำรองข้อมูล ═══
function billRowsForExport(list) {
  return list.slice().sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).map(t => [
    t.date, t.time || '', t.type === 'income' ? 'รายรับ' : 'รายจ่าย', billCat(t.category, t.type).label,
    t.merchant || '', t.amount, t.currency || 'THB', billAmtThb(t), BILL_PAY[t.payMethod] || '', t.card || '', BILL_SOURCES[t.source] || t.source || '', t.ref || '', t.note || ''
  ]);
}
const BILL_EXPORT_HEADERS = ['วันที่', 'เวลา', 'ประเภท', 'หมวด', 'ร้าน/ผู้รับ', 'ยอด', 'สกุลเงิน', 'ยอด(THB)', 'จ่ายด้วย', 'บัตร', 'ช่องทางบันทึก', 'เลขอ้างอิง', 'โน้ต'];

// ใช้ Apps Script webhook เดิม (action=clear_append) — ส่งทีละเดือน แยกแท็บ Bills_YYYY-MM ให้ URL ไม่ยาวเกิน
async function billBackupSheet() {
  const ym = billPeriod(); // มุมมองปี → ส่งทีละเดือน (แท็บ Bills_YYYY-MM) ไม่รวมทั้งปีใน URL เดียว
  const list = (state.transactions || []).filter(t => billInPeriod(t, ym));
  if (!list.length) { showToast('ไม่มีรายการในช่วงนี้'); return; }
  const byMonth = {};
  list.forEach(t => { (byMonth[t.date.slice(0, 7)] = byMonth[t.date.slice(0, 7)] || []).push(t); });
  const months = Object.keys(byMonth).sort();
  const base = window._PORTFOLIO_SHEET_URL || localStorage.getItem('folio_PORTFOLIO_SHEET_URL') || window._SHEETS_URL || SHEETS_URL;
  showToast('กำลังส่งไป Google Sheet...');
  let ok = 0, unsupported = false, unsure = 0;
  try {
    for (const m of months) {
      const params = new URLSearchParams({ action: 'clear_append', tab: 'Bills_' + m, data: JSON.stringify({ headers: BILL_EXPORT_HEADERS, rows: billRowsForExport(byMonth[m]) }) });
      const url = base + '?' + params.toString();
      const res = await fetch(url, { redirect: 'follow', mode: 'cors' });
      let j = null;
      try { j = await res.json(); } catch (_) {}
      if (j && j.ok) ok++;
      else if (j && (j.holdings || j.timestamp)) { unsupported = true; break; }
      else unsure++;
    }
  } catch (e) {
    showToast('ส่งไป Sheet ไม่สำเร็จ (' + e.message + ') — ใช้ ⬇️ CSV แทน' + (ok ? ' · ส่งสำเร็จแล้ว ' + ok + ' เดือน' : ''));
    return;
  }
  if (unsupported) showToast('⚠️ Apps Script ยังไม่รองรับ action clear_append — ใช้ ⬇️ CSV แทน');
  else if (unsure) showToast('ส่งแล้ว — ตรวจแท็บ Bills_YYYY-MM ใน Sheet (' + ok + ' เดือนยืนยันแล้ว)');
  else showToast('✅ สำรอง ' + list.length + ' รายการไป ' + ok + ' แท็บ (Bills_' + months[0] + (months.length > 1 ? ' … ' + months[months.length - 1] : '') + ') แล้ว');
}

function billCsvText(list) {
  const cell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [BILL_EXPORT_HEADERS].concat(billRowsForExport(list)).map(r => r.map(cell).join(',')).join('\n');
}
function billExportCsv() {
  const list = state.transactions || [];
  if (!list.length) { showToast('ยังไม่มีรายการ'); return; }
  const csv = billCsvText(list);
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }); // BOM ให้ Excel อ่านภาษาไทยถูก
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'folio-bills-' + todayISO() + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ─── เฟส 6c: นำเข้า CSV (รูปแบบเดียวกับที่ส่งออก) → หน้าตรวจสอบ (billOpenConfirm) ใช้ระบบกันซ้ำเดิมทั้งหมด ───
const BILL_CSV_MAX = 100; // ต่อครั้ง — แต่ละรายการในหน้าตรวจสอบเป็นฟอร์มเต็ม เยอะกว่านี้หน้าจอหนักบนมือถือ (ที่เหลือนำเข้ารอบถัดไป รายการที่เข้าไปแล้วจะถูกข้ามเองเพราะกันซ้ำ)
const billPlain = s => String(s || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();           // ตัดอีโมจิหน้าข้อความ: "💵 เงินสด" → "เงินสด"
function billCsvDraft(r) {
  const type = r.type, cats = BILL_CATS[type];
  const cat = (cats.find(c => c.label === r.category) || cats.find(c => c.label.toLowerCase() === r.category.toLowerCase()) || {}).key;
  const payKey = Object.keys(BILL_PAY).find(k => billPlain(BILL_PAY[k]) === billPlain(r.pay)) || 'unknown';
  const foreign = r.currency !== 'THB';
  return billNewDraft({
    type, category: cat, amount: r.amount, currency: r.currency, date: r.date, time: r.time, merchant: r.merchant, ref: r.ref, note: r.note,
    payMethod: r.card && payKey === 'unknown' ? 'card' : payKey, card: r.card, source: 'csv',
    // ต่างประเทศ: ยอดบาทในไฟล์ถือเป็นยอดจริง (ไฟล์ส่งออกไม่บอกว่าเป็นค่าประมาณหรือไม่) → คงยอดบาทเดิมไว้ ไม่คำนวณใหม่
    fx: foreign && r.thb ? Math.round(r.thb / r.amount * 1e6) / 1e6 : 0, thbCharged: foreign && r.thb ? r.thb : 0, fxFeePct: foreign ? 0 : undefined,
    offsetCat: 'other'
  });
}
// คืน { shown, dupRef, beyondCap, skipped, error } — ถ้าไม่มีอะไรให้ตรวจสอบจะไม่เปิดหน้าตรวจสอบ
function billImportCsvText(text) {
  const parsed = billCsvRecords(billParseCsv(text));
  if (parsed.error) { showToast(parsed.error); return { error: parsed.error }; }
  if (!parsed.records.length) { showToast('ไม่พบรายการที่อ่านได้ในไฟล์' + (parsed.skipped ? ' (ข้าม ' + parsed.skipped + ' แถวที่ข้อมูลไม่ครบ)' : '')); return { error: 'empty', skipped: parsed.skipped }; }
  billState.editingId = null;
  billState.drafts = parsed.records.map(billCsvDraft);
  billMarkDuplicates();
  const all = billState.drafts;
  const dupRef = all.filter(d => d.dup === 'ref'); // เลขอ้างอิง+ยอดตรงกับที่มีอยู่ = ซ้ำแน่นอน ไม่ต้องเอามาแสดง
  const fresh = all.filter(d => d.dup !== 'ref');
  const maybe = fresh.filter(d => d.dup && d.dup.startsWith('maybe')); // วัน+ยอดเท่ากับรายการเดิม: อาจซ้ำจริงหรือซื้อซ้ำจริงก็ได้ → แสดงไว้แต่ไม่ติ๊กให้
  const rest = fresh.filter(d => !(d.dup && d.dup.startsWith('maybe')));
  const queue = rest.concat(maybe), shown = queue.slice(0, BILL_CSV_MAX);
  if (!shown.length) { billState.drafts = []; showToast('ไม่มีรายการใหม่ — ทุกรายการในไฟล์มีอยู่แล้ว (ข้ามซ้ำ ' + dupRef.length + ' รายการ)'); return { shown: 0, dupRef: dupRef.length, beyondCap: 0, skipped: parsed.skipped }; }
  const beyond = queue.length - shown.length;
  const note = 'นำเข้าจาก CSV · แสดง ' + shown.length + ' รายการ' + (dupRef.length ? ' · ข้ามที่ซ้ำแน่นอน ' + dupRef.length : '') +
    (maybe.length ? ' · ' + maybe.filter(d => shown.includes(d)).length + ' รายการวัน+ยอดตรงกับของเดิม (ไม่ติ๊กให้ — ติ๊กเองถ้าเป็นรายการใหม่จริง)' : '') +
    (parsed.skipped ? ' · ข้ามแถวที่ข้อมูลไม่ครบ ' + parsed.skipped : '') + (beyond ? ' · ยังเหลืออีก ' + beyond + ' รายการ — นำเข้าไฟล์เดิมซ้ำหลังบันทึกเพื่อรับส่วนที่เหลือ' : '');
  billOpenConfirm(shown, note);
  billState.drafts.forEach(d => { if (d.dup && d.dup.startsWith('maybe')) d.include = false; });
  billRenderDrafts();
  return { shown: shown.length, dupRef: dupRef.length, beyondCap: beyond, skipped: parsed.skipped };
}
async function billImportCsvFile(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast('ไฟล์ใหญ่เกิน 5 MB'); return; }
  billImportCsvText(await file.text());
}

// ═══ AI วิเคราะห์การใช้จ่าย + การลงทุน ═══
// ปุ่มลัด: เปิดแชตผู้ช่วย AI (หน้าแรก) พร้อมคำถามตั้งต้น — บริบทรายรับ-รายจ่าย/DCA/พอร์ตมากับ aihContext() อยู่แล้ว
function billRunAi() {
  if (!billCashflowContext()) { showToast('บันทึกรายการก่อน แล้ว AI ถึงจะวิเคราะห์ได้'); return; }
  aihOpenWith('🤖 วิเคราะห์การใช้จ่าย + การลงทุนของฉัน', 'bills', [
    'งาน: วิเคราะห์จากข้อมูลรายรับ-รายจ่ายจริง แผน DCA และพอร์ตในข้อมูลด้านบนเท่านั้น ห้ามแต่งตัวเลข',
    'ตอบภาษาไทย กระชับ ใช้หัวข้อ:',
    '## สุขภาพการเงิน (อัตราออม, เงินเหลือ, ความสม่ำเสมอ)',
    '## จุดรั่วไหล (หมวดที่สูงเกินควร พร้อมตัวเลข และวิธีลดที่ทำได้จริง)',
    '## งบลงทุนที่ยั่งยืน (DCA ต่อเดือนที่แนะนำเป็นตัวเลข เทียบแผนปัจจุบัน และเงินสำรองฉุกเฉินที่ควรมี ≈ 6 เท่าของรายจ่ายต่อเดือน)',
    'ถ้าข้อมูลมีไม่ถึงเดือนเต็ม ให้บอกว่าข้อสรุปยังไม่แน่น'
  ].join('\n'));
}

// ═══ Share Target (Android): sw.js เก็บไฟล์ที่แชร์ไว้ใน cache 'folio-share' แล้ว redirect มา ?share-target=1 ═══
async function billHandleShareLaunch() {
  const params = new URLSearchParams(location.search);
  if (!params.has('share-target')) return;
  history.replaceState(null, '', location.pathname);
  showPage('bills');
  if (params.get('share-target') === 'error') { showToast('รับไฟล์ที่แชร์ไม่สำเร็จ ลองอีกครั้ง'); return; }
  const files = [];
  let text = '';
  try {
    const c = await caches.open('folio-share');
    for (const req of await c.keys()) {
      const res = await c.match(req);
      if (res) {
        if (req.url.endsWith('/text')) text = await res.text();
        else { const b = await res.blob(); files.push(new File([b], 'shared', { type: b.type || 'image/jpeg' })); }
      }
      await c.delete(req);
    }
  } catch (e) {}
  // รอ Firestore โหลดรายการเดิมก่อน เพื่อให้ตรวจสลิปซ้ำได้
  for (let i = 0; i < 40 && !window._billLoaded; i++) await new Promise(r => setTimeout(r, 150));
  if (files.length) billProcessImages(files, 'share');
  else if (text.trim()) billProcessText(text, 'share');
  else showToast('ไม่พบรูปหรือข้อความที่แชร์มา');
}
try {
  if (localStorage.getItem('folio_bill_view') === 'year') billState.view = 'year';
} catch (e) {}
billHandleShareLaunch();
