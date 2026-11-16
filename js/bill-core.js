// ฟังก์ชันคำนวณล้วนของหน้าบิล/สิทธิ์บัตร — ห้ามแตะ DOM/localStorage/Firebase ในไฟล์นี้
// โหลดด้วย <script src> ก่อน script หลักใน index.html (ฟังก์ชัน/ค่าคงที่จึงเป็น global เหมือนเดิม) และเรียกจาก Node ได้ผ่าน require() เพื่อเทสต์ (tests/)

function isoFromDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function todayISO() { return isoFromDate(new Date()); } // local date — ไม่ใช้ toISOString ที่เพี้ยนข้ามวันตาม UTC

const BILL_PAY = { unknown: 'ไม่ระบุ', cash: '💵 เงินสด', transfer: '🏦 โอน/QR', card: '💳 บัตรเครดิต', ewallet: '📱 e-Wallet' };
// ไม่นับเป็นรายจ่าย/ไม่กระทบอัตราออม:
// 'invest' = เงินที่โอนไปลงทุน/ออมเอง
// 'cc_payment' = โอนจ่ายบิลบัตรเครดิต — ของที่รูดบัตรถูกนับเป็นรายจ่ายไปแล้วตอนรูด ถ้านับตอนจ่ายบิลอีกจะซ้ำ
const BILL_NON_SPEND = ['invest', 'cc_payment'];

// 'refund' (ฝั่งรับ) = เงินคืน เช่น เพื่อนโอนคืนค่าหาร/ร้านคืนเงิน — ไม่นับเป็นรายรับ แต่หักออกจากรายจ่ายหมวด offsetCat
// รายการเดิมก่อนมีช่องนี้ (ไม่มี offsetCat) หักจากหมวด "อื่น ๆ"
function billOffsetCat(t) { return t.offsetCat || 'other'; }

// ═══════════════════════════════════════════════════════════════════
// 🎯 สิทธิ์บัตรเครดิต — โปรไฟล์บัตร, รอบบิล, เพดานโปรรายหมวด, แนะนำบัตรที่คุ้มสุด
// ข้อมูลสิทธิ์ค้นจากเว็บธนาคาร/เว็บรีวิว ณ พ.ย. 2569 — verified:false = ยังยืนยันไม่ได้ (แก้/ปิดกฎได้ในหน้าตั้งค่า)
// อัตรา: pts คะแนนต่อทุก per บาท (ปัดเศษลงต่อรายการ) · มูลค่าเป็นบาท = คะแนน × pointValue
// เพดานทุกตัวนับตาม "รอบบิล" ของบัตร (โปรที่ธนาคารเขียนว่า "ต่อเดือน" ก็นับตามรอบบิลแบบประมาณ)
// ═══════════════════════════════════════════════════════════════════
// หมวดสิทธิ์ (เลือกเองในฟอร์มได้ ไม่เลือก = เดาจากชื่อร้าน + หมวด) — ต่างประเทศดูจากสกุลเงินอัตโนมัติ
const BILL_RW_TAGS = {
  dining: '🍽️ ร้านอาหาร', online: '🛒 ช้อป/จ่ายออนไลน์', ewallet: '📱 e-Wallet', dept: '🏬 ห้างสรรพสินค้า',
  central: '🏷️ เครือ Central', supermarket: '🧺 ซูเปอร์มาร์เก็ต', dutyfree: '🛍️ Duty Free', fuel: '⛽ น้ำมัน',
  airhotel: '✈️ ตั๋วเครื่องบิน/โรงแรม', sia: '🇸🇬 Singapore Airlines/Scoot/KrisShop', travel: '🧳 ท่องเที่ยวอื่น ๆ',
  utility: '💡 ค่าน้ำ/ไฟ/บิล', general: '📦 ทั่วไป'
};

const BILL_RW_RX = [
  ['sia', /singapore ?air|\bscoot\b|krisshop|สิงคโปร์แอร์/i],
  ['airhotel', /airways|airlines?\b|air ?asia|thai ?air|bangkok ?air|nok ?air|lion ?air|vietjet|emirates|cathay|eva ?air|qatar|hotel|resort|marriott|hilton|hyatt|accor|\bihg\b|agoda|booking\.com|expedia|trip\.com|โรงแรม|รีสอร์ท|การบินไทย|แอร์เอเชีย|นกแอร์/i],
  ['dutyfree', /king ?power|duty ?free|คิงเพาเวอร์/i],
  ['fuel', /\bptt\b|pt station|\bshell\b|bangchak|\besso\b|caltex|susco|ปตท|บางจาก|เชลล์|เอสโซ่|คาลเท็กซ์|ปั๊มน้ำมัน|เติมน้ำมัน/i],
  ['supermarket', /\btops\b|lotus'?s?\b|big ?c\b|villa ?market|gourmet ?market|foodland|max ?valu|makro|ท็อปส์|โลตัส|บิ๊กซี|แม็คโคร|ฟู้ดแลนด์|วิลล่า มาร์เก็ต|กูร์เมต์/i],
  ['dept', /central|robinson|the ?mall|emporium|emquartier|emsphere|paragon|iconsiam|takashimaya|เซ็นทรัล|โรบินสัน|เดอะมอลล์|เอ็มโพเรียม|เอ็มควอเทียร์|เอ็มสเฟียร์|พารากอน|ไอคอนสยาม/i],
  ['central', /central|robinson|\btops\b|supersports|power ?buy|\bb2s\b|officemate|thai ?watsadu|go ?wholesale|เซ็นทรัล|โรบินสัน|ท็อปส์|ไทวัสดุ|พาวเวอร์บาย|ซูเปอร์สปอร์ต/i],
  ['ewallet', /true ?money|rabbit ?line ?pay|line ?pay|shopee ?pay|alipay|wechat ?pay|ทรูมันนี่/i],
  ['online', /shopee|lazada|amazon|aliexpress|\btemu\b|netflix|spotify|youtube|apple\.com|app ?store|google|steam|\bgrab\b|line ?man|foodpanda|robinhood|agoda|booking\.com|expedia|trip\.com|ออนไลน์|online/i]
];

// ─── วันที่: รอบบิล = (วันตัดรอบเดือนก่อน + 1) … วันตัดรอบ; เดือนที่ไม่มีวันนั้นใช้วันสุดท้ายของเดือน ───
function billRwIso(y, m0, day) {
  const dim = new Date(y, m0 + 1, 0).getDate();
  return isoFromDate(new Date(y, m0, Math.min(day, dim)));
}

function billRwCycle(stmtDay, ref) {
  const [y, m] = ref.split('-').map(Number);
  let end = billRwIso(y, m - 1, stmtDay);
  if (ref > end) end = billRwIso(y, m, stmtDay);
  const [ey, em] = end.split('-').map(Number);
  return { start: billIsoAdd(billRwIso(ey, em - 2, stmtDay), 1), end };
}

// วันครบกำหนดชำระ = วันที่ dueDay ถัดจากวันตัดรอบ
function billRwDue(end, dueDay) {
  const [y, m] = end.split('-').map(Number);
  const same = billRwIso(y, m - 1, dueDay);
  return same > end ? same : billRwIso(y, m, dueDay);
}

// ─── หมวดสิทธิ์ของรายการ ───
function billRwAutoTags(t) {
  const s = new Set();
  const m = (t.merchant || '') + ' ' + (t.note || '');
  BILL_RW_RX.forEach(([k, rx]) => { if (rx.test(m)) s.add(k); });
  if (t.category === 'food' && !s.has('supermarket')) s.add('dining');
  if (t.category === 'travel') s.add('travel');
  if (t.category === 'bills') s.add('utility');
  return s;
}

function billRwTags(t) {
  const s = t.rewardTag && BILL_RW_TAGS[t.rewardTag] ? new Set([t.rewardTag]) : billRwAutoTags(t);
  if (s.has('sia')) s.add('airhotel');
  if (s.has('airhotel')) s.add('travel');
  const cur = String(t.currency || 'THB').toUpperCase();
  s.add(cur === 'THB' ? 'thb' : 'fx');
  return s;
}

// ─── คำนวณคะแนน ───
function billRwActive(r, date) { return (!r.validFrom || date >= r.validFrom) && (!r.validTo || date <= r.validTo); }

function billRwMatch(r, tags, cur) {
  if (r.cur && !r.cur.includes(cur)) return false;
  if (r.notCur && r.notCur.includes(cur)) return false;
  if (r.tags && !r.tags.some(x => tags.has(x))) return false;
  if (r.notTags && r.notTags.some(x => tags.has(x))) return false;
  return true;
}

// คะแนน/เงินคืนของรายการเดียว — st = สถานะการใช้เพดานของรอบนี้ (แก้ในที่)
function billRwEarn(prof, st, t, a) {
  const p = prof.p, tags = billRwTags(t), cur = String(t.currency || 'THB').toUpperCase();
  const basePts = n => Math.floor(n / p.base.per + 1e-9) * p.base.pts;
  if ((p.exclude && p.exclude.some(x => tags.has(x))) || (p.excludeCur && p.excludeCur.includes(cur))) return { pts: 0, cash: 0, rule: '-' };
  const r = p.rules.find(r => !prof.off[r.id] && billRwActive(r, t.date) && billRwMatch(r, tags, cur) && !(r.minSlip && a < r.minSlip));
  if (!r) return { pts: basePts(a), cash: 0, rule: '' };
  const s = st[r.id] = st[r.id] || { used: 0, spend: 0, blocks: 0, bonus: 0, cash: 0 };
  let pts = basePts(a), cash = 0;
  if (r.pct) {
    cash = a * r.pct / 100;
    if (r.capCash) cash = Math.max(0, Math.min(cash, r.capCash - s.cash));
    s.cash += cash;
  } else if (r.block) {
    let blocks = r.perSlip ? Math.floor(a / r.block) : Math.floor((s.spend + a) / r.block) - Math.floor(s.spend / r.block);
    if (r.maxBlocks) blocks = Math.max(0, Math.min(blocks, r.maxBlocks - s.blocks));
    let bonus = blocks * Math.floor(r.block / r.per) * r.bonusPts;
    if (r.capBonusPts) bonus = Math.max(0, Math.min(bonus, r.capBonusPts - s.bonus));
    s.blocks += blocks; s.bonus += bonus; pts += bonus;
  } else {
    const inCap = r.capSpend ? Math.min(a, Math.max(0, r.capSpend - s.used)) : a;
    const over = a - inCap;
    s.used += inCap;
    pts = Math.floor(inCap / r.per + 1e-9) * r.pts + (over > 0 ? Math.floor(over / p.base.per + 1e-9) * (r.overPts != null ? r.overPts : p.base.pts) : 0);
  }
  s.spend += a;
  return { pts, cash, rule: r.id };
}

function billAmtThb(t) { return typeof t.amountThb === 'number' ? t.amountThb : (Number(t.amount) || 0) * (Number(t.fxToThb) || 1); }

// ตัดอักขระพิเศษออกจากเลขอ้างอิงสลิปให้เทียบกันได้ (และใช้เป็น document id ได้)
function billRefKey(ref) { return String(ref || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 120); }

function billAddMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function billInPeriod(t, p) { return !!t.date && t.date.slice(0, p.length) === p; }

function billTotals(match, list) {
  if (!list) list = (typeof state !== 'undefined' && state.transactions) || []; // ไม่ส่ง list = ใช้รายการในแอป (เทสต์ส่งเอง)
  const r = { income: 0, consumption: 0, invest: 0, ccPaid: 0, refund: 0, count: 0, byCat: {}, byPay: {}, bizIncome: 0, bizExpense: 0, cards: {} };
  list.forEach(t => {
    if (!t.date || !match(t)) return;
    const v = billAmtThb(t);
    r.count++;
    if (t.type === 'income' && t.category === 'refund') {
      const oc = billOffsetCat(t);
      r.refund += v;
      r.consumption -= v;
      r.byCat[oc] = (r.byCat[oc] || 0) - v;
      if (oc === 'business') r.bizExpense -= v;
      return;
    }
    if (t.type === 'income') {
      r.income += v;
      if (t.category === 'business_in') r.bizIncome += v;
      return;
    }
    const cardName = (t.card || '').trim() || 'ไม่ระบุบัตร';
    if (t.category === 'cc_payment') {
      r.ccPaid += v;
      (r.cards[cardName] = r.cards[cardName] || { spent: 0, paid: 0 }).paid += v;
      return;
    }
    if (BILL_NON_SPEND.includes(t.category)) { r.invest += v; return; }
    if (t.payMethod === 'card') (r.cards[cardName] = r.cards[cardName] || { spent: 0, paid: 0 }).spent += v;
    if (t.category === 'business') r.bizExpense += v;
    r.consumption += v;
    r.byCat[t.category] = (r.byCat[t.category] || 0) + v;
    const pm = BILL_PAY[t.payMethod] ? t.payMethod : 'unknown';
    r.byPay[pm] = (r.byPay[pm] || 0) + v;
  });
  r.surplus = r.income - r.consumption;           // เงินเหลือจริง (ก่อนหักเงินลงทุน)
  r.savingsRate = r.income > 0 ? r.surplus / r.income * 100 : null;
  return r;
}

// ─── ช่วงของรายการ: วัน / สัปดาห์ (จันทร์–อาทิตย์) / เดือน ───
function billIsoAdd(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return isoFromDate(d);
}

// วันที่ของงวดที่ k (0 = งวดแรก): เดือนถัดไปทีละเดือน วันเดียวกัน — ถ้าเดือนนั้นไม่มีวันนั้น (เช่น 31) ใช้วันสุดท้ายของเดือน
function billInstDate(iso, k) {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(y, m + k, 0).getDate();
  return isoFromDate(new Date(y, m - 1 + k, Math.min(d, last)));
}

// ═══ Subscription (หักอัตโนมัติทุกรอบ ไม่มีวันจบ) ═══
// เก็บที่ users/<uid>/subscriptions: { name, amount, currency, fxToThb, fxFeePct, amountThb, category, payMethod, card, note, time,
//   cycle: 'monthly'|'yearly', startDate (วันตัดรอบแรก), active, cancelledAt, lastNo (รอบล่าสุดที่ลงรายการแล้ว) }
// เปิดแอปเมื่อไหร่ → billSubSync() ลงรายจ่ายของทุกรอบที่ถึงวันแล้วแต่ยังไม่ได้ลง (id = <subId>_<รอบ> กันซ้ำข้ามเครื่อง)
// ลบรายการของรอบไหนทิ้ง → ไม่สร้างซ้ำ เพราะ lastNo เดินไปแล้ว
function billSubStep(cycle) { return cycle === 'yearly' ? 12 : 1; }

// วันตัดรอบของรอบที่ idx+1 (idx 0 = รอบแรก) — วันที่ไม่มีในเดือนนั้น (เช่น 31, 29 ก.พ.) ใช้วันสุดท้ายของเดือน
function billSubDate(s, idx) { return billInstDate(s.startDate, billSubStep(s.cycle) * idx); }

// จำนวนรอบที่ถึงวันแล้ว (วันตัดรอบ ≤ วันนี้)
function billSubDueCount(s, today) {
  let n = 0;
  while (n < 600 && billSubDate(s, n) <= today) n++;
  return n;
}

// แปลงวันที่ที่ AI อ่านมา: ต้องเป็น YYYY-MM-DD ค.ศ. — ถ้าหลุดเป็น พ.ศ. (ปี > ปีหน้า) ลบ 543 ให้
function billNormDate(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return todayISO();
  let y = +m[1];
  if (y >= 2400) y -= 543; // เฉพาะปีที่เป็น พ.ศ. จริง — ปี ค.ศ. ในอนาคต (เช่นงวดผ่อน 2028) ต้องไม่ถูกแปลง
  const d = new Date(y, +m[2] - 1, +m[3]);
  if (isNaN(d) || d.getMonth() !== +m[2] - 1) return todayISO();
  return isoFromDate(d);
}

if (typeof module !== 'undefined') module.exports = { BILL_PAY, isoFromDate, todayISO, billOffsetCat, billRwIso, billRwCycle, billRwDue, billRwAutoTags, billRwTags, billRwActive, billRwMatch, billRwEarn, billAmtThb, billRefKey, billAddMonths, billInPeriod, billTotals, billIsoAdd, billInstDate, billSubStep, billSubDate, billSubDueCount, billNormDate, BILL_NON_SPEND, BILL_RW_TAGS, BILL_RW_RX };
