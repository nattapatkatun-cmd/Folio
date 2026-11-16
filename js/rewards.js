// Folio — สิทธิ์บัตรเครดิต: โปรไฟล์/รอบบิล/คะแนน/แนะนำรูดใบไหน/กระทบยอด statement
// โหลดก่อน js/bill.js (ไม่มีโค้ดระดับบนสุดที่เรียกของ bill — ฟังก์ชันถูกเรียกหลังโหลดครบ)
// แยกมาจาก index.html (เฟส 8) — เนื้อหาเดิมทุกบรรทัด ลำดับการโหลดต้องคงตาม <script src> ใน index.html

// โปรไฟล์บัตร — key ภาษาอังกฤษเก็บใน settings (ห้ามเปลี่ยน) · match = เดาจากชื่อบัตรในรายชื่อ (เรียงตาม BILL_RW_ORDER)
// rule: tags/notTags/cur/notCur = เงื่อนไข · per+pts = อัตราในกฎ · capSpend = ยอดที่ได้อัตรานี้ต่อรอบ (เกิน → overPts หรืออัตราปกติ)
//       block = ให้โบนัสเป็นก้อน (bonusPts ต่อ per บาทของก้อน, perSlip = ต้องครบในสลิปเดียว, maxBlocks/capBonusPts = เพดาน)
//       pct = เครดิตเงินคืน % · validTo = วันหมดโปร (YYYY-MM-DD)
const BILL_RW_PRESETS = {
  t1luxe: {
    name: 'Central The 1 Luxe', bank: 'Krungsri (KCC)', match: /the ?1\b|\bt1\b|luxe|เดอะวัน/i, stmtDay: 15, dueDay: 4,
    unit: 'คะแนน The 1', pointValue: 0.125, pvNote: 'ปกติ 800 คะแนน = ส่วนลด ฿100 (≈0.125 บาท/คะแนน)',
    base: { per: 25, pts: 1, verified: false },
    rules: [
      { id: 'central', label: 'เครือ Central x4', tags: ['central'], per: 25, pts: 4, verified: true, note: 'ธนาคารเขียนว่า "สูงสุด x4" บางร้านในเครืออาจได้น้อยกว่า' },
      { id: 'fuel', label: 'น้ำมัน — นับคะแนนไม่เกิน ฿50,000', tags: ['fuel'], per: 25, pts: 1, capSpend: 50000, overPts: 0, verified: true, note: 'เงื่อนไขเขียนว่าต่อเดือน' }
    ],
    notes: ['ส่วนลดสูงสุด 10% ในเครือ Central / ที่จอดรถ / VIP Lounge ตามเงื่อนไขของบัตร']
  },
  ksig: {
    name: 'Krungsri Signature', bank: 'Krungsri', match: /signature|ซิกเนเจอร์|krungsri|กรุงศรี/i, stmtDay: 18, dueDay: 7,
    unit: 'กรุงศรี พอยต์', pointValue: 0.10, pvNote: 'แลก 500 พอยต์ = เงินคืน ฿50 ผ่าน UCHOOSE (≈0.10 บาท/พอยต์)',
    base: { per: 25, pts: 1, verified: true }, excludeCur: ['EUR', 'GBP'],
    rules: [
      { id: 'dept', label: 'ห้างฯ 5X — ครบ ฿5,000 ต่อสลิป (3 ครั้ง)', tags: ['dept'], per: 25, block: 5000, perSlip: true, bonusPts: 4, maxBlocks: 3, capBonusPts: 2400, validTo: '2026-12-31', verified: true, note: 'Central, The Mall, Emporium, EmQuartier, EmSphere, Paragon + ออนไลน์ของห้าง · เพดาน 2,400 พอยต์จากบทความของธนาคาร' },
      { id: 'air', label: 'ตั๋วเครื่องบิน/โรงแรม 5X — ทุก ฿10,000 (3 ครั้ง)', tags: ['airhotel'], per: 25, block: 10000, bonusPts: 4, maxBlocks: 3, capBonusPts: 4800, validTo: '2026-12-31', verified: true, note: 'บางหน้าระบุว่าต้องจองตรงกับสายการบิน/โรงแรม' }
    ],
    waiver: 300000, waiverNote: 'ยกเว้นค่าธรรมเนียมรายปี ฿4,280 เมื่อรูดสะสม ฿300,000 ใน 12 รอบบิล',
    notes: ['ร้านอาหาร: ส่วนลดสูงสุด 25% เฉพาะร้านที่ร่วมรายการ (ไม่ได้คำนวณเป็นคะแนน) ถึง 31 ธ.ค. 69', 'ร้านค้าที่จดทะเบียนใน EEA/UK ไม่ได้คะแนน (แอปประมาณจากสกุล EUR/GBP)']
  },
  bbl: {
    name: 'BBL Platinum Leader', bank: 'Bangkok Bank', match: /leader|bbl|bangkok ?bank|กรุงเทพ|ผู้นำ/i, stmtDay: 29, dueDay: 13,
    unit: 'คะแนน', pointValue: 0.05, pvNote: 'ยังไม่พบอัตราแลกมาตรฐาน — ตั้งไว้ ≈0.4% ของยอดรูด ตรวจในแอปแล้วแก้ได้', pvUnverified: true,
    base: { per: 25, pts: 2, verified: true }, rules: [],
    waiver: 150000, waiverNote: 'ยกเว้นค่าธรรมเนียมรายปีเมื่อรูดครบ ฿150,000/ปี',
    notes: ['ไม่มีหมวดโบนัส — 2 คะแนนทุก 25 บาททั้งในและต่างประเทศ']
  },
  ttb: {
    name: 'ttb absolute', bank: 'ttb', match: /absolute|\bttb\b|ทีทีบี/i, stmtDay: 14, dueDay: 3,
    unit: 'คะแนน ttb', pointValue: 0.10, pvNote: 'โปรแลก 1,000 คะแนน = เงินคืน ฿100 (≈0.10 บาท/คะแนน) · แลกไมล์ ROP 3 คะแนน/ไมล์', pvUnverified: true,
    base: { per: 20, pts: 1, verified: true }, fxFee: 1,
    rules: [
      { id: 'online', label: 'ออนไลน์ x2 (ไม่รวม e-Wallet/Bill Payment)', tags: ['online'], notTags: ['ewallet', 'utility'], per: 20, pts: 2, verified: true }
    ],
    notes: ['ค่าธรรมเนียมแปลงสกุลเงิน 1% (ต่ำกว่าบัตรทั่วไป 2.5%)', 'ท่องเที่ยว/ร้านอาหาร x2 เฉพาะ ttb privilege Superior ขึ้นไป (คุณไม่ได้อยู่ระดับนี้)']
  },
  kwe: {
    name: 'UOB KrisFlyer World Elite', bank: 'UOB', match: /kwe|kris/i, stmtDay: 27, dueDay: 17,
    unit: 'ไมล์ KrisFlyer', pointValue: 0.5, mileUnit: true, pvNote: 'ไม่ได้ตั้งเอง = ใช้มูลค่าไมล์เดียวกับ ROP (ตั้งที่ด้านบนของหน้านี้)', pvUnverified: true,
    base: { per: 35, pts: 1, verified: false },
    rules: [
      { id: 'sia', label: 'Singapore Airlines/Scoot/KrisShop ฿12.5/ไมล์', tags: ['sia'], per: 12.5, pts: 1, capSpend: 200000, verified: false },
      { id: 'dutyfree', label: 'Duty Free ฿20/ไมล์', tags: ['dutyfree'], per: 20, pts: 1, capSpend: 200000, verified: false },
      { id: 'fx', label: 'สกุลเงินต่างประเทศ ฿20/ไมล์', tags: ['fx'], per: 20, pts: 1, verified: false }
    ],
    notes: ['⚠️ UOB ประกาศปรับอัตราสะสมไมล์ตั้งแต่ 1 ส.ค. 69 — ตัวเลขนี้เป็นอัตราก่อนปรับ ตรวจในแอป UOB TMRW แล้วแก้', 'ค่าธรรมเนียมรายปี ฿10,000 + VAT']
  },
  prvi: {
    name: 'UOB PRVI Miles', bank: 'UOB', match: /privi|prvi|พรีวิ/i, stmtDay: 27, dueDay: 17,
    unit: 'คะแนน UOB', pointValue: 0.185, pvNote: 'ตีค่าตามการแลกไมล์ 2.7 คะแนน/ไมล์ × ฿0.5 (≈0.185 บาท/คะแนน) — บางแหล่งยังเขียน 1.2 คะแนน/ไมล์', pvUnverified: true,
    base: { per: 15, pts: 1, verified: true }, exclude: ['utility'],
    rules: [
      { id: 'sea', label: 'ริงกิต/ดอง/รูเปียห์/ดอลลาร์สิงคโปร์ ฿12/คะแนน (≤3,000 คะแนน)', cur: ['MYR', 'VND', 'IDR', 'SGD'], per: 12, pts: 1, capSpend: 36000, validTo: '2026-12-31', verified: true, note: 'เพดาน 3,000 คะแนน = ยอด ฿36,000 · เงื่อนไขเขียนว่าต่อเดือน' }
    ],
    waiver: 300000, waiverNote: 'ยกเว้นค่าธรรมเนียมรายปี ฿4,000 เมื่อรูดครบ ฿300,000/ปี',
    notes: ['โปร 9 บาท/คะแนนสำหรับทุกสกุลเงินต่างประเทศ หมดแล้วตั้งแต่ 15 ก.ค. 69']
  },
  premier: {
    name: 'UOB Premier', bank: 'UOB', match: /premier|พรีเมียร์/i, stmtDay: 27, dueDay: 17,
    unit: 'คะแนน UOB', pointValue: 0.05, pvNote: 'ยังไม่พบอัตราแลกเงินคืนมาตรฐาน — ตั้งไว้ ≈0.4% ของยอดรูด', pvUnverified: true,
    base: { per: 25, pts: 2, verified: true }, exclude: ['utility', 'ewallet'],
    rules: [
      { id: 'super', label: 'ซูเปอร์มาร์เก็ตเงินคืน 5% (≤฿500/เดือน · ขั้นต่ำ ฿800/สลิป)', tags: ['supermarket'], pct: 5, capCash: 500, minSlip: 800, validTo: '2026-12-31', verified: true, note: 'เงินคืนสูงสุด ฿500/บัตรหลัก/เดือน (รวมบัตรเสริม) = ยอด ฿10,000 · ต้องลงทะเบียน SMS ตามกติกาของแต่ละรอบ · เพดานรายเดือนแอปนับตามรอบบิล' },
      { id: 'dept', label: 'ห้างฯ/Duty Free x4', tags: ['dept', 'dutyfree'], per: 25, pts: 4, verified: true }
    ],
    notes: ['เครื่องดื่มฟรีเดือนละ 1 ครั้ง · Miracle Lounge 2 ครั้ง/ปี', 'ไม่ได้คะแนน: ค่าสาธารณูปโภค (MCC 4900) และการเติมเงิน e-Wallet']
  },
  uobworld: {
    name: 'UOB World', bank: 'UOB', match: /world|เวิลด์/i, stmtDay: 27, dueDay: 17,
    unit: 'คะแนน UOB', pointValue: 0.05, pvNote: 'ยังไม่พบอัตราแลกเงินคืนมาตรฐาน — ตั้งไว้ ≈0.4% ของยอดรูดปกติ', pvUnverified: true,
    base: { per: 25, pts: 2, verified: true },
    rules: [
      { id: 'x5', label: 'ออนไลน์/e-Wallet/ร้านอาหาร/ท่องเที่ยว/ต่างประเทศ 5 คะแนน (≤฿20,000)', tags: ['online', 'ewallet', 'dining', 'travel', 'fx'], per: 25, pts: 5, capSpend: 20000, overPts: 2, verified: true, note: 'ร้านอาหาร/ท่องเที่ยวนับตาม MCC · ผ่อน i-Plan ได้แค่ x2' }
    ],
    notes: ['ค่าธรรมเนียมรายปี ฿3,800 + VAT (ปีแรกฟรี)', 'เดือนเกิดคะแนนพิเศษ (ยังไม่ได้คำนวณ)']
  },
  passion: {
    name: 'KBank THE PASSION', bank: 'KBank', match: /passion|แพสชั่น|แพชชั่น/i, stmtDay: 17, dueDay: 2,
    unit: 'K Point', pointValue: 0.10, pvNote: 'แลก K Point เท่ายอดใช้จ่ายรับเงินคืน 10% (≈0.10 บาท/คะแนน) — บางแคมเปญได้ 12–15%', pvUnverified: true,
    base: { per: 25, pts: 1, verified: true },
    rules: [
      { id: 'fx', label: 'ต่างประเทศ x3 ไม่มีเพดาน', tags: ['fx'], notCur: ['EUR', 'GBP', 'CNY'], per: 25, pts: 3, verified: true, note: 'ร้านใน EEA/UK/จีนแผ่นดินใหญ่ไม่ได้ x3 · จ่ายเป็นเงินบาทกับร้านต่างประเทศไม่ได้คะแนน' },
      { id: 'thb', label: 'ในประเทศ x2 (≤฿200,000)', tags: ['thb'], per: 25, pts: 2, capSpend: 200000, overPts: 1, verified: true }
    ],
    notes: ['ยกเว้นค่าธรรมเนียมรายปีเมื่อรูดครบ 12 ครั้ง/ปี (จากเว็บเปรียบเทียบ)']
  },
  jcb: {
    name: 'KBank JCB Platinum', bank: 'KBank', match: /jcb/i, stmtDay: 17, dueDay: 2,
    unit: 'K Point', pointValue: 0.10, pvNote: 'แลก K Point เท่ายอดใช้จ่ายรับเงินคืน 10% (≈0.10 บาท/คะแนน)', pvUnverified: true,
    base: { per: 25, pts: 1, verified: false }, fxFee: 2.5,
    rules: [
      { id: 'jpy', label: 'จ่ายเงินเยน x2 (≤2,000 คะแนน)', cur: ['JPY'], per: 25, pts: 2, capSpend: 25000, overPts: 1, verified: true, note: 'เพดาน 2,000 คะแนน = ยอด ฿25,000 ต่อรอบ (จากบทความธนาคาร ~1 ปี)' }
    ],
    notes: ['เงินคืนที่ญี่ปุ่น 3–4% ตามแหล่ง (ยังไม่ยืนยัน — ไม่ได้คำนวณ)', 'LoungeKey สูงสุด 8 ครั้ง/ปี']
  }
};
// ลำดับเดาโปรไฟล์จากชื่อบัตร: เฉพาะเจาะจงก่อน (KrisFlyer World Elite มีคำว่า World, The 1 Luxe ออกโดยกรุงศรี)
const BILL_RW_ORDER = ['kwe', 'prvi', 'premier', 'uobworld', 'passion', 'jcb', 't1luxe', 'ksig', 'bbl', 'ttb'];
// อัตราแลกเป็นไมล์ Royal Orchid Plus: per = คะแนนต่อ 1 ไมล์ (null = ไม่รู้อัตรา/โอนเข้า ROP ไม่ได้ → ไม่จัดอันดับในโหมด ROP)
const BILL_RW_ROP = {
  t1luxe: { per: 4, ok: true, note: 'หน้าคะแนนเดอะวัน: 4 คะแนน = 1 ไมล์ ROP (บางหน้าเก่าเขียน 2) · ขั้นต่ำ 12,000 คะแนน/ครั้ง' },
  ksig: { per: 2, ok: true, note: 'krungsricard: บัตร Signature 2 พอยต์ = 1 ไมล์ ROP · ขั้นต่ำ 6,000 พอยต์ เพิ่มทีละ 1,000' },
  bbl: { per: 2.5, ok: true, note: 'ประกาศธนาคาร (2563): บัตรผู้นำแพลทินัม 2,500 คะแนน = 1,000 ไมล์ — เอกสารเก่า โทร 0-2638-4888 เพื่อยืนยัน' },
  ttb: { per: 3, ok: true, note: '3 คะแนน = 1 ไมล์ ROP (ChaiMiles) — หน้าเก่าของ ttb มีทั้ง 3 และ 5' },
  kwe: { per: null, ok: false, note: 'ได้ไมล์ KrisFlyer ซึ่งโอนเข้า ROP ไม่ได้ — ใส่ 1 ถ้าอยากนับไมล์ KrisFlyer เท่ากับ ROP' },
  prvi: { per: 2.7, ok: true, note: '2.7 คะแนน = 1 ไมล์ ตั้งแต่ 1 ต.ค. 68 (หลายแหล่งตรงกัน แต่บางหน้าของ UOB ยังเขียน 1.2)' },
  premier: { per: 5, ok: true, note: '5 คะแนน = 1 ไมล์ ตั้งแต่ 1 ต.ค. 68 (ตารางจาก creditcardth)' },
  uobworld: { per: 5, ok: true, note: '5 คะแนน = 1 ไมล์ ROP (อัตราหลัง 1 ต.ค. 68 — ผู้ใช้ยืนยันจากแอป UOB แล้ว)' },
  passion: { per: 4, ok: true, note: 'K Point → ROP: 4 K Point = 1 ไมล์ · โอนขั้นต่ำ 20,000 K Point (ผู้ใช้ยืนยัน)' },
  jcb: { per: 4, ok: true, note: 'K Point → ROP: 4 K Point = 1 ไมล์ · โอนขั้นต่ำ 20,000 K Point (ผู้ใช้ยืนยัน)' },
};
// โหมดเทียบความคุ้ม: 'baht' = 💰 คุ้มสุด (ค่าเริ่มต้น — ตีมูลค่าเป็นบาทจากทางแลกที่ดีที่สุดของแต้ม + เงินคืน − ค่า FX)
// 'rop' = ไมล์ ROP ที่ได้ · 'raw' = คะแนนดิบ
// เฟส 5: เหลือโหมด 'baht' (💰 คุ้มสุด) โหมดเดียว — ค่า folio_bill_rw_mode2 เดิมยังเก็บ/ซิงก์ไว้ตามเดิมแต่ไม่ถูกอ่านมาใช้
// (ทางแยก rop/raw ที่เหลือในโค้ดด้านล่างจึงไม่ถูกเรียกอีก; ไมล์ ROP และคะแนนดิบแสดงเป็นบรรทัดรองของแต่ละบัตรแทน)
function billRwMode() { return 'baht'; }
// มูลค่า 1 แต้มเป็นบาท = ทางแลกที่ให้มากกว่า ระหว่าง แลกเงินคืน/ส่วนลด (pointValue) กับ แลกไมล์ ROP (ไมล์ละ billRwMileBaht)
function billRwPtBaht(prof) {
  const rop = prof.ropPer ? billRwMileBaht() / prof.ropPer : 0;
  return Math.max(prof.pointValue || 0, rop);
}
function billRwRoute(prof) { return prof.ropPer && billRwMileBaht() / prof.ropPer > (prof.pointValue || 0) ? 'rop' : 'cash'; }
function billRwRouteTxt(prof) { return prof.p.mileUnit ? 'ได้ไมล์ KrisFlyer (ตีค่าเท่าไมล์ ROP)' : billRwRoute(prof) === 'rop' ? 'แต้มแลก ROP คุ้มกว่า' : 'แต้มแลกเงินคืน/ส่วนลดคุ้มกว่า'; }
// ใช้แปลงเงินคืน (เช่น UOB Premier ซูเปอร์ฯ 5%) เป็นไมล์ในโหมด ROP เท่านั้น
function billRwMileBaht() { const v = parseFloat(localStorage.getItem('folio_bill_rw_milebaht')); return v > 0 ? v : 0.5; }

function billRwSaved() {
  try { const o = JSON.parse(localStorage.getItem('folio_bill_card_profiles') || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}
function billRwAutoPreset(name) { return BILL_RW_ORDER.find(k => BILL_RW_PRESETS[k].match.test(name || '')) || ''; }
function billRwProfile(card) {
  if (!card) return null;
  const s = billRwSaved()[card] || null;
  const key = s && typeof s.preset === 'string' ? s.preset : billRwAutoPreset(card);
  const p0 = BILL_RW_PRESETS[key];
  if (!p0) return null;
  const day = (v, fb) => { const n = parseInt(v, 10); return n >= 1 && n <= 31 ? n : fb; };
  // สิทธิ์ที่แก้เองในแอป: ruleEdit = ตัวเลขใหม่ของกฎเดิม · custom = โปรที่เพิ่มเอง (มาก่อนกฎเดิม) · base = อัตราปกติใหม่
  const ed = (s && s.ruleEdit) || {};
  const custom = ((s && s.custom) || []).map(c => ({
    id: c.id, label: c.label || 'โปรที่เพิ่มเอง', custom: true, verified: true,
    tags: c.tag && c.tag !== 'all' ? [c.tag] : null, cur: c.cur ? [c.cur] : null,
    per: c.per || 25, pts: c.pts, pct: c.pct, capSpend: c.capSpend, capCash: c.capCash, validTo: c.validTo
  }));
  const rules = custom.concat(p0.rules.map(r => ed[r.id] ? Object.assign({}, r, ed[r.id], { edited: true, verified: true }) : r));
  const base = s && s.base ? Object.assign({}, p0.base, s.base, { verified: true, edited: true }) : p0.base;
  const p = Object.assign({}, p0, { rules, base });
  return {
    key, card, p, auto: !s,
    stmtDay: day(s && s.stmtDay, p.stmtDay), dueDay: day(s && s.dueDay, p.dueDay),
    pointValue: s && typeof s.pointValue === 'number' && s.pointValue >= 0 ? s.pointValue : (p0.mileUnit ? billRwMileBaht() : p.pointValue),
    off: (s && s.off) || {}, memo: (s && s.memo) || '',
    ropPer: s && typeof s.ropPer === 'number' && s.ropPer > 0 ? s.ropPer : (BILL_RW_ROP[key] || {}).per || null,
    ropOk: s && typeof s.ropPer === 'number' && s.ropPer > 0 ? true : !!(BILL_RW_ROP[key] || {}).ok
  };
}
function billRwCards() { return billCards().map(billRwProfile).filter(Boolean); }

function billRwDays(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); }
function billRwShort(iso) { return new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }); }

function billRwTagLabel(t) {
  const s = t.rewardTag && BILL_RW_TAGS[t.rewardTag] ? [t.rewardTag] : [...billRwAutoTags(t)];
  return s.length ? s.map(k => BILL_RW_TAGS[k]).join(' + ') : BILL_RW_TAGS.general;
}

function billRwCalc(prof, txs) {
  const st = {};
  let pts = 0, cash = 0, spend = 0;
  txs.forEach(t => { const a = Math.max(0, billAmtThb(t)); spend += a; const e = billRwEarn(prof, st, t, a); pts += e.pts; cash += e.cash; });
  const value = pts * billRwPtBaht(prof) + cash;
  const miles = prof.ropPer ? pts / prof.ropPer : null;
  // score = ตัวเลขที่ใช้จัดอันดับตามโหมด (null = บัตรนี้ไม่มีอัตรา ROP)
  const mode = billRwMode();
  const score = mode === 'rop' ? (miles == null ? null : miles + cash / billRwMileBaht()) : mode === 'raw' ? pts : value;
  return { pts, cash, spend, value, miles, score, st };
}
function billRwTxs(card, start, end, skipId) {
  return (state.transactions || []).filter(t => t.type === 'expense' && t.payMethod === 'card' && (t.card || '').trim() === card &&
    t.date >= start && t.date <= end && !BILL_NON_SPEND.includes(t.category) && t.id !== skipId)
    .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
}
// มูลค่าที่ได้เพิ่มถ้ารูดรายการ t ด้วยบัตรนี้ (ดูเพดานที่ใช้ไปแล้วในรอบเดียวกัน) — ต่างประเทศหักค่าธรรมเนียม FX ของบัตร
function billRwMarginal(prof, t, baseThb, skipId) {
  const cyc = billRwCycle(prof.stmtDay, t.date);
  const txs = billRwTxs(prof.card, cyc.start, cyc.end, skipId);
  const fx = String(t.currency || 'THB').toUpperCase() !== 'THB';
  const fee = fx ? billCardFee(prof.card) : 0;
  const amt = baseThb * (1 + fee / 100);
  const before = billRwCalc(prof, txs);
  const after = billRwCalc(prof, txs.concat([{ ...t, card: prof.card, amountThb: amt, date: t.date, time: '99:99' }]));
  const mode = billRwMode(), rop = mode === 'rop', raw = mode === 'raw';
  const feeCost = baseThb * fee / 100;
  if (after.score == null) return { prof, none: true, net: null, metric: -Infinity, fee, feeCost };
  const gain = after.score - before.score;
  // โหมดบาท: หักค่าธรรมเนียม FX ออกจากมูลค่า · โหมด ROP/คะแนนดิบ: ไม่หัก (คนละหน่วย) แต่แสดงค่าธรรมเนียมแยก
  const net = rop || raw ? gain : gain - feeCost;
  return { prof, rop, raw, gain, feeCost, net, fee, base: baseThb,
    pct: baseThb > 0 ? net / baseThb * 100 : 0,
    metric: baseThb > 0 ? (rop || raw ? net / baseThb * 1000 : net / baseThb * 100) : 0, // ROP: ไมล์/฿1,000 · ดิบ: คะแนน/฿1,000 · บาท: %
    pts: after.pts - before.pts, cash: after.cash - before.cash };
}
function billRwRank(t, baseThb, skipId) {
  return billRwCards().map(prof => billRwMarginal(prof, t, baseThb, skipId)).filter(r => !r.none).sort((a, b) => b.net - a.net);
}
// บัตรที่ยังไม่มีอัตรา ROP (โหมด ROP ไม่จัดอันดับ)
function billRwNoRop() { return billRwMode() === 'rop' ? billRwCards().filter(p => !p.ropPer).map(p => p.card) : []; }
function billRwFmtGain(r) {
  if (r.raw) return `≈ <strong>${r.pts.toLocaleString()}</strong> ${esc(r.prof.p.unit)}${r.cash ? ' + เงินคืน ' + billFmt0(r.cash) : ''}${r.fee ? ' <span style="color:var(--text3);">(FX ' + r.fee + '% = ' + billFmt0(r.feeCost) + ')</span>' : ''}`;
  if (r.rop) {
    const bpm = r.net > 0 ? ' · ' + (r.base / r.net).toFixed(1) + ' ฿/ไมล์' : '';
    if (r.cash > 0) return `≈ <strong>${(r.prof.ropPer ? r.pts / r.prof.ropPer : 0).toFixed(1)}</strong> ไมล์ ROP + เงินคืน <strong>${billFmt0(r.cash)}</strong> <span style="color:var(--text3);">(${r.pts.toLocaleString()} ${esc(r.prof.p.unit)} · ตีรวม ≈${r.net.toFixed(0)} ไมล์${r.fee ? ' · FX ' + r.fee + '% = ' + billFmt0(r.feeCost) : ''})</span>`;
    return `≈ <strong>${r.net.toFixed(1)}</strong> ไมล์ ROP <span style="color:var(--text3);">(${r.pts.toLocaleString()} ${esc(r.prof.p.unit)}${bpm}${r.fee ? ' · FX ' + r.fee + '% = ' + billFmt0(r.feeCost) : ''})</span>`;
  }
  return `≈ ${billFmt(Math.round(r.net * 100) / 100)} <span style="color:var(--text3);">(${r.pct.toFixed(2)}%${r.fee ? ' หลังหัก FX ' + r.fee + '%' : ''}${r.pts > 0 ? ' · ' + billRwRouteTxt(r.prof) : ''})</span>`;
}

// ─── แนะนำบัตรในฟอร์มบันทึก ───
function billRwDraftBase(d) {
  if (d.currency === 'THB') return Number(d.amount) || 0;
  const amt = Number(d.amount) || 0, fx = Number(d.fx) || 0;
  if (amt > 0 && fx > 0) return amt * fx;
  return Number(d.thbActual) > 0 ? Number(d.thbActual) / (1 + (Number(d.fee) || 0) / 100) : 0;
}
function billRwShowFor(d) { return d.type === 'expense' && !BILL_NON_SPEND.includes(d.category) && d.plan !== 'inst'; }
// หมวดสิทธิ์บัตร (เลือกเอง) — อยู่ใต้ "เพิ่มเติม"
function billRwTagField(d, i) {
  if (!billRwShowFor(d) || !billRwCards().length) return '';
  const auto = 'อัตโนมัติ: ' + billRwTagLabel({ ...d, rewardTag: '' });
  const opts = [`<option value="">${esc(auto)}</option>`].concat(Object.keys(BILL_RW_TAGS).map(k => `<option value="${k}" ${d.rewardTag === k ? 'selected' : ''}>${BILL_RW_TAGS[k]}</option>`)).join('');
  return `<div class="form-group full"><label class="form-label">หมวดสิทธิ์บัตร (ใช้คำนวณคะแนน/เพดาน)</label><select class="form-select" onchange="billDraftSet(${i},'rewardTag',this.value,true)">${opts}</select></div>`;
}
// คำแนะนำ "รูดบัตรไหนคุ้มสุด" — บรรทัดเดียวใต้ชิปบัตร แตะเพื่อดูอันดับเต็ม
function billRwRecBox(d, i) {
  if (!billRwShowFor(d) || !billRwCards().length) return '';
  return `<div class="form-group full rw-wrap"><div id="billRwRec${i}" class="rw-rec">${billRwRecHtml(d, i)}</div></div>`;
}
function billDraftToggleRw(i) {
  const d = billState.drafts[i];
  if (!d) return;
  d.rwOpen = !d.rwOpen;
  const el = document.getElementById('billRwRec' + i);
  if (el) el.innerHTML = billRwRecHtml(d, i);
}
function billRwRecHtml(d, i) {
  const base = billRwDraftBase(d);
  if (!(base > 0)) return '';
  const t = { type: 'expense', payMethod: 'card', category: d.category, merchant: d.merchant, note: d.note, currency: d.currency, rewardTag: d.rewardTag, date: d.date };
  const rank = billRwRank(t, base, billState.editingId);
  const noRop = billRwNoRop();
  if (!rank.length) return noRop.length ? '<span style="color:var(--text3);">💡 ยังไม่มีบัตรที่ใส่อัตรา ROP — ตั้งที่ ⚙️ ตั้งค่าบัตร</span>' : '';
  const fmtV = billRwFmtGain;
  const top = rank.slice(0, 3).map((r, k) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;padding:2px 0;">
      <span>${k === 0 ? '🥇' : k === 1 ? '🥈' : '🥉'} ${esc(r.prof.card)} ${fmtV(r)}</span>
      ${d.payMethod === 'card' && d.card === r.prof.card ? '<span style="color:var(--green);font-size:10.5px;">✓ ใบนี้</span>' : `<button class="bill-chip" data-c="${esc(r.prof.card)}" onclick="billDraftUseCard(${i},this.dataset.c)">ใช้ใบนี้</button>`}</div>`).join('');
  if (!d.rwOpen) {
    const best = rank[0], isCur = d.payMethod === 'card' && d.card === best.prof.card;
    return `<div style="display:flex;gap:8px;align-items:center;cursor:pointer;min-height:32px;" onclick="billDraftToggleRw(${i})"><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">💡 คุ้มสุด: 🥇 ${esc(best.prof.card)} ${fmtV(best)}${isCur ? ' <span style="color:var(--green);">✓</span>' : ''}</span><span style="color:var(--text3);">▾</span></div>`;
  }
  const cur = d.payMethod === 'card' && d.card ? rank.find(r => r.prof.card === d.card) : null;
  const curIdx = cur ? rank.indexOf(cur) : -1;
  return `<div style="font-weight:600;margin-bottom:2px;">💡 รูดบัตรไหนคุ้มสุด <span style="font-weight:400;color:var(--text3);">· ${esc(billRwTagLabel(d))}${d.currency !== 'THB' ? ' · ' + esc(d.currency) : ''}</span></div>${top}` +
    (cur && curIdx > 2 ? `<div style="color:var(--amber);margin-top:2px;">ใบที่เลือก (${esc(cur.prof.card)}) ${fmtV(cur)}</div>` : '') +
    (noRop.length ? `<div style="color:var(--text3);font-size:10.5px;margin-top:2px;">ไม่ได้จัดอันดับ (ยังไม่มีอัตรา ROP): ${noRop.map(esc).join(', ')}</div>` : '') +
    `<div style="text-align:right;color:var(--text3);cursor:pointer;min-height:28px;" onclick="billDraftToggleRw(${i})">ย่อ ▴</div>`;
}
function billDraftUseCard(i, card) {
  const d = billState.drafts[i];
  if (!d) return;
  d.payMethod = 'card'; d.card = card; d._touched = true;
  if (d.currency !== 'THB' && !d.feeManual) d.fee = billAutoFee(d);
  billRenderDrafts();
}

// ─── การ์ดในหน้าบิล ───
function billRwRefDate() {
  const today = todayISO();
  if (billState.view === 'year' || billState.month >= today.slice(0, 7)) return today;
  const [y, m] = billState.month.split('-').map(Number);
  return billRwIso(y, m - 1, 31);
}
function billRwBar(used, cap, color) {
  const pct = cap > 0 ? Math.min(100, used / cap * 100) : 0;
  return `<div class="bill-progress"><div style="width:${pct.toFixed(1)}%;background:${color || (pct >= 100 ? 'var(--green)' : 'var(--accent)')};"></div></div>`;
}
function billRwBadge(v) { return v ? '' : ' <span class="rw-unv" title="ยังยืนยันจากเว็บธนาคารไม่ได้ — ตรวจแล้วแก้ในตั้งค่าบัตร">ยังไม่ยืนยัน</span>'; }
function billRwRuleLine(prof, r, s, ref) {
  const today = todayISO();
  const off = prof.off[r.id];
  const expired = r.validTo && ref > r.validTo;
  let status = '', bar = '';
  s = s || { used: 0, spend: 0, blocks: 0, bonus: 0, cash: 0 };
  if (off) status = '<span style="color:var(--text3);">ปิดไว้</span>';
  else if (expired) status = '<span style="color:var(--text3);">⌛ หมดโปรแล้ว</span>';
  else if (r.pct) { status = `รูด ${billFmt0(s.spend)} · เงินคืน <strong>${billFmt0(s.cash)}</strong>${r.capCash ? ' / ' + billFmt0(r.capCash) + (s.cash < r.capCash ? ' · เหลือรูดได้อีก <strong>' + billFmt0((r.capCash - s.cash) / r.pct * 100) + '</strong>' : ' · <span style="color:var(--green);">เต็มแล้ว</span>') : ''}`; if (r.capCash) bar = billRwBar(s.cash, r.capCash); }
  else if (r.block) {
    const max = r.maxBlocks || 0;
    status = `ครบ <strong>${s.blocks}/${max}</strong> ครั้ง · โบนัส ${s.bonus.toLocaleString()} ${esc(prof.p.unit)}` +
      (s.blocks < max ? (r.perSlip ? ` · ต้องครบ ${billFmt0(r.block)} ในสลิปเดียว` : ` · อีก <strong>${billFmt0(r.block - (s.spend % r.block))}</strong> ถึงครั้งถัดไป`) : ' · <span style="color:var(--green);">เต็มแล้ว ✓</span>');
    bar = billRwBar(s.blocks, max);
  } else if (r.capSpend) {
    const rem = Math.max(0, r.capSpend - s.used);
    status = `${billFmt0(s.used)} / ${billFmt0(r.capSpend)} · ` + (rem > 0 ? `เหลือ <strong>${billFmt0(rem)}</strong>` : '<span style="color:var(--green);">เต็มแล้ว — ใช้ใบอื่นต่อ</span>');
    bar = billRwBar(s.used, r.capSpend);
  } else status = s.spend ? `รูด ${billFmt0(s.spend)} · ไม่มีเพดาน` : 'ไม่มีเพดาน';
  const exp = !expired && r.validTo && billRwDays(today, r.validTo) <= 45 ? ` <span style="color:var(--amber);">⏳ หมด ${billFmtDate(r.validTo)}</span>` : '';
  const tag = r.custom ? ' <span class="rw-edited">เพิ่มเอง</span>' : r.edited ? ' <span class="rw-edited">แก้แล้ว</span>' : billRwBadge(r.verified);
  return `<div class="rw-rule${off || expired ? ' off' : ''}"><div style="display:flex;justify-content:space-between;gap:8px;"><span>${esc(r.label)}${tag}${exp}${r.custom || r.edited ? '<br><span style="color:var(--text3);font-size:10.5px;">' + esc(billRwRuleDesc(r, prof.p.unit)) + '</span>' : ''}</span></div>
    <div style="color:var(--text2);">${status}</div>${bar}</div>`;
}
function billRwRender() {
  const el = document.getElementById('billRw'), box = document.getElementById('billRwCard');
  if (!el || !box) return;
  const profs = billRwCards();
  box.style.display = '';
  billRwRenderPick();
  if (!profs.length) {
    el.innerHTML = `<div style="font-size:12px;color:var(--text2);line-height:1.7;">ยังไม่ได้ผูกบัตรกับโปรไฟล์สิทธิ์ — กดปุ่มด้านล่างเพื่อเพิ่มบัตร ${Object.keys(BILL_RW_PRESETS).length} ใบที่ตั้งค่าไว้ (สิทธิ์ ณ พ.ย. 2569, วันตัดรอบ/ครบกำหนดตามที่คุณให้)</div>
      <button class="btn-primary" style="margin-top:8px;font-size:12px;" onclick="billRwAddAll()">➕ ตั้งค่าบัตรทั้งหมด</button>`;
    return;
  }
  const ref = billRwRefDate(), today = todayISO();
  // บัตรในรายชื่อที่ยังไม่ผูกโปรไฟล์ / โปรไฟล์ที่ยังไม่มีบัตร — ไม่งั้นบัตรจะหายจากอันดับเงียบ ๆ
  const unmapped = billCards().filter(c => !billRwProfile(c));
  document.getElementById('billRwSub').textContent = 'ณ ' + billFmtDate(ref);
  let html = billRwExpiryBanner(profs, today);
  // เฟส 5: ซ่อนคำเตือน "โปรไฟล์ที่ยังไม่มีบัตร" ตามค่าเริ่มต้น (บัตร 7 ใบที่ไม่ได้ถืออยู่เป็นเรื่องปกติ) — เตือนเฉพาะบัตรในรายชื่อที่ยังไม่ผูกโปรไฟล์
  if (unmapped.length) html += `<div class="insight" style="background:var(--amber-bg);color:var(--amber);font-size:11.5px;border-radius:10px;padding:8px 10px;margin-bottom:10px;line-height:1.6;" id="billRwUnmapped">⚠️ บัตรที่ยังไม่ผูกโปรไฟล์ (ไม่ถูกนับ/จัดอันดับ): <b>${unmapped.map(esc).join(', ')}</b> — แตะ ⚙️ ตั้งค่าบัตร แล้วเลือกโปรไฟล์ให้แต่ละใบ</div>`;
  // 1) ครบกำหนดชำระของรอบที่ปิดแล้วล่าสุด
  const dues = billRwDues();
  if (dues.length) {
    html += '<div class="bill-recur-head" style="margin-top:0;">📅 ครบกำหนดชำระ (ยอดรอบที่ปิดแล้ว)</div>' + dues.map(x => {
      const col = x.done ? 'var(--green)' : x.days < 0 ? 'var(--red)' : x.days <= 5 ? 'var(--amber)' : 'var(--text2)';
      return `<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:5px 0;border-bottom:0.5px solid var(--bg2);">
        <span>💳 ${esc(x.prof.card)} <span style="color:var(--text3);font-size:10.5px;">รอบ ${billRwShort(x.closed.start)}–${billRwShort(x.closed.end)}</span></span>
        <span style="text-align:right;white-space:nowrap;"><strong>${billFmt0(x.spent)}</strong> <span style="color:${col};font-size:11px;">${x.done ? '✅ จ่ายแล้ว' : 'ครบ ' + billRwShort(x.due) + (x.days < 0 ? ' (เลยมา ' + -x.days + ' วัน)' : x.days === 0 ? ' (วันนี้)' : ' (อีก ' + x.days + ' วัน)')}</span></span></div>` + billStmtBlock(x);
    }).join('') + '<div style="font-size:10px;color:var(--text3);margin:4px 0 8px;">ยอดจากรายการที่บันทึกในแอป · ใส่ยอดจาก statement เพื่อดูส่วนต่าง · "จ่ายแล้ว" ดูจากรายการ 💳 จ่ายบิลบัตรเครดิตของบัตรนั้น</div>';
  }
  const rop = billRwMode() === 'rop';
  const raw = billRwMode() === 'raw';
  // 3) รายบัตร: รอบปัจจุบัน + เพดานโปร
  html += '<div class="bill-recur-head" style="margin-top:12px;">💳 รอบบิลปัจจุบันของแต่ละใบ <span style="font-weight:400;color:var(--text3);">· แตะเพื่อดูโปร/เพดาน</span></div>';
  let totV = 0, totM = 0;
  html += profs.map(prof => {
    const cyc = billRwCycle(prof.stmtDay, ref);
    const c = billRwCalc(prof, billRwTxs(prof.card, cyc.start, cyc.end));
    totV += c.value; totM += c.miles || 0;
    const head = raw ? `${c.pts.toLocaleString()} ${esc(prof.p.unit)}${c.cash ? ' + ' + billFmt0(c.cash) : ''}` : rop ? (c.miles == null ? `${c.pts.toLocaleString()} ${esc(prof.p.unit)}` : `≈ ${Math.floor(c.miles).toLocaleString()} ไมล์ ROP`) : `≈ ${billFmt0(c.value)}`;
    const rate = raw ? (c.spend > 0 ? ` · เฉลี่ย ${(c.pts / c.spend * 1000).toFixed(0)} ${esc(prof.p.unit)}/฿1,000` : '') : rop ? (prof.ropPer ? ` · ${prof.ropPer} ${esc(prof.p.unit)} = 1 ไมล์ ROP${prof.ropOk ? '' : billRwBadge(false)}${c.miles > 0 ? ' · เฉลี่ย ' + (c.spend / c.miles).toFixed(1) + ' ฿/ไมล์' : ''}` : ' · <span style="color:var(--amber);">ยังไม่มีอัตรา ROP</span>')
      : ` · 1 ${esc(prof.p.unit)} ≈ ฿${billRwPtBaht(prof).toFixed(3)} (${billRwRouteTxt(prof)})${c.spend > 0 ? ' · ได้คืนเฉลี่ย ' + (c.value / c.spend * 100).toFixed(2) + '%' : ''}`;
    const left = billRwDays(today, cyc.end);
    const p = prof.p;
    const yearSpend = p.waiver ? (state.transactions || []).filter(t => t.type === 'expense' && t.payMethod === 'card' && (t.card || '').trim() === prof.card && (t.date || '').slice(0, 4) === ref.slice(0, 4) && !BILL_NON_SPEND.includes(t.category)).reduce((a, t) => a + billAmtThb(t), 0) : 0;
    return `<details class="rw-card"><summary>
        <span><strong>💳 ${esc(prof.card)}</strong> <span style="color:var(--text3);font-size:10.5px;">${billRwShort(cyc.start)}–${billRwShort(cyc.end)}${ref === today && left >= 0 ? ' · ตัดรอบอีก ' + left + ' วัน' : ''}</span><div class="rw-sub2">${billRwSecondary(c, prof)}</div></span>
        <span style="white-space:nowrap;">${billFmt0(c.spend)} → <strong style="color:var(--green);">${head}</strong></span></summary>
      <div style="font-size:11px;color:var(--text2);margin:4px 0 6px;">${c.pts.toLocaleString()} ${esc(p.unit)}${c.cash ? ' + เงินคืน ' + billFmt0(c.cash) : ''} · อัตราปกติ ${p.base.pts} ต่อ ${p.base.per} บาท${billRwBadge(p.base.verified)}${rate}</div>
      ${p.rules.map(r => billRwRuleLine(prof, r, c.st[r.id], ref)).join('')}
      ${p.waiver ? `<div class="rw-rule"><div>🎟️ ${esc(p.waiverNote)}</div><div style="color:var(--text2);">รูดปี ${+ref.slice(0, 4) + 543}: ${billFmt0(yearSpend)} / ${billFmt0(p.waiver)} <span style="color:var(--text3);">(นับตามปีปฏิทิน — ปีสมาชิกจริงอาจต่าง)</span></div>${billRwBar(yearSpend, p.waiver)}</div>` : ''}
      ${(p.notes || []).concat(prof.memo ? ['📝 ' + prof.memo] : []).map(n => `<div style="font-size:10.5px;color:var(--text3);line-height:1.6;">• ${esc(n)}</div>`).join('')}
    </details>`;
  }).join('');
  html += `<div style="font-size:10.5px;color:var(--text3);margin-top:8px;line-height:1.6;">${raw ? 'คะแนนรวมแยกตามบัตรด้านบน (ต่างธนาคารรวมกันไม่ได้)' : rop ? 'รวมรอบปัจจุบัน ≈ <strong>' + Math.floor(totM).toLocaleString() + ' ไมล์ ROP</strong> (เฉพาะบัตรที่มีอัตรา ROP · เงินคืนไม่นับรวม' + ')' : 'รวมมูลค่าคะแนน/เงินคืนรอบปัจจุบัน ≈ <strong>' + billFmt0(totV) + '</strong>'} (ประมาณการจากรายการในแอป) · หมวดเดาจากชื่อร้าน+หมวด แก้ได้ที่ "หมวดสิทธิ์บัตร" ตอนบันทึก · ข้อมูลสิทธิ์ ณ พ.ย. 2569 — "ยังไม่ยืนยัน" ตรวจในแอปธนาคารแล้วแก้ที่ ⚙️</div>`;
  el.innerHTML = html;
}

// ─── เฟส 6b: กระทบยอดบัตร — ยอดจาก statement ของรอบที่ปิดแล้ว เทียบกับยอดในแอป ───
// เก็บที่ localStorage 'folio_bill_statements' และ Firestore settings/bill.statements = { [ชื่อบัตร]: { [วันตัดรอบ YYYY-MM-DD]: ยอด } }
function billStatements() { try { const o = JSON.parse(localStorage.getItem('folio_bill_statements') || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
function billStatementSet(card, end, value) {
  const all = billStatements(), raw = String(value == null ? '' : value).replace(/,/g, '').trim(), n = parseFloat(raw);
  if (raw === '' || !(n >= 0)) { if (all[card]) { delete all[card][end]; if (!Object.keys(all[card]).length) delete all[card]; } }
  else (all[card] = all[card] || {})[end] = Math.round(n * 100) / 100;
  localStorage.setItem('folio_bill_statements', JSON.stringify(all));
  billSyncSettings();
  if (typeof billRender === 'function') billRender();
}
// รายการต่างประเทศของรอบนั้นที่ยอดบาทยังเป็นค่าประมาณ (thbActual !== true) — ตัวการที่ทำให้ยอดในแอปไม่ตรง statement
function billStatementEstimates(x) { return billRwTxs(x.prof.card, x.closed.start, x.closed.end).filter(t => String(t.currency || 'THB').toUpperCase() !== 'THB' && !t.thbActual); }
function billStmtBlock(x) {
  const end = x.closed.end, st = (billStatements()[x.prof.card] || {})[end], q = esc(JSON.stringify(x.prof.card)), dq = esc(JSON.stringify(end));
  const est = billStatementEstimates(x);
  let res = '';
  if (typeof st === 'number') {
    const diff = Math.round((st - x.spent) * 100) / 100;
    res = Math.abs(diff) < 1
      ? '<span style="color:var(--green);">✓ ตรงกับยอดในแอป</span>'
      : diff > 0 ? `<span style="color:var(--amber);">statement สูงกว่าแอป <b>+${billFmt0(diff)}</b> — อาจมีรายการที่ยังไม่ได้บันทึก (หรือค่าธรรมเนียม/ดอกเบี้ย)</span>`
        : `<span style="color:var(--amber);">แอปสูงกว่า statement <b>${billFmt0(-diff)}</b> — อาจมีรายการซ้ำ หรือยอดต่างประเทศที่ประมาณไว้สูงเกิน</span>`;
  }
  return `<div class="rw-stmt" data-card="${esc(x.prof.card)}" style="font-size:11px;padding:4px 0 8px;border-bottom:0.5px solid var(--bg2);">
    <label style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;color:var(--text2);">📄 ยอด statement ฿
      <input class="form-input" type="number" inputmode="decimal" min="0" step="0.01" value="${typeof st === 'number' ? st : ''}" placeholder="ใส่จากใบแจ้งหนี้" style="width:120px;padding:5px 8px;" onchange='billStatementSet(${q},${dq},this.value)'></label>
    ${res ? `<div class="rw-stmt-res" style="margin-top:3px;">${res} <span style="color:var(--text3);">· ยอดในแอป ${billFmt0(x.spent)}</span></div>` : ''}
    ${est.length ? `<div class="rw-stmt-est" style="margin-top:4px;color:var(--text2);">⚠️ รายการต่างประเทศที่ยอดบาทยังเป็นค่าประมาณ ${est.length} รายการ — ใส่ยอดจริงจาก statement แล้วส่วนต่างจะลดลง:${est.map(t => `<div style="display:flex;justify-content:space-between;gap:8px;padding:2px 0;"><span>${esc(t.merchant || billCat(t.category, t.type).label)} · ${esc(t.currency)} ${Number(t.amount).toLocaleString()}</span><span>≈ ${billFmt0(billAmtThb(t))} <button class="bill-chip" style="min-height:32px;" onclick='billEdit(${esc(JSON.stringify(t.id))})'>ใส่ยอดจริง</button></span></div>`).join('')}</div>` : ''}
  </div>`;
}
// ครบกำหนดชำระของรอบที่ปิดล่าสุดของแต่ละบัตร (ใช้ทั้งแท็บบัตรและกล่องในภาพรวม)
function billRwDues() {
  const today = todayISO();
  return billRwCards().map(prof => {
    const cur = billRwCycle(prof.stmtDay, today);
    const closed = billRwCycle(prof.stmtDay, billIsoAdd(cur.start, -1));
    const due = billRwDue(closed.end, prof.dueDay);
    const spent = billRwTxs(prof.card, closed.start, closed.end).reduce((a, t) => a + billAmtThb(t), 0);
    const paid = (state.transactions || []).filter(t => t.category === 'cc_payment' && (t.card || '').trim() === prof.card && t.date > closed.end && t.date <= due).reduce((a, t) => a + billAmtThb(t), 0);
    return { prof, closed, due, spent, paid, done: paid >= spent - 1, days: billRwDays(today, due) };
  }).filter(x => x.spent > 0 && x.days >= -3).sort((a, b) => a.due.localeCompare(b.due));
}
// กฎที่รายการ t จะใช้กับบัตรนี้ (null = อัตราปกติ, '-' = ไม่ได้คะแนน)
function billRwMatchedRule(prof, t) {
  const p = prof.p, tags = billRwTags(t), cur = String(t.currency || 'THB').toUpperCase();
  if ((p.exclude && p.exclude.some(x => tags.has(x))) || (p.excludeCur && p.excludeCur.includes(cur))) return '-';
  return p.rules.find(r => !prof.off[r.id] && billRwActive(r, t.date) && billRwMatch(r, tags, cur) && !(r.minSlip && (t.amountThb || 0) && t.amountThb < r.minSlip)) || null;
}
// ─── แท็บบัตร: "รูดใบไหนดี" เลือกหมวดด้วยไอคอน ───
const BILL_RW_PICK = [['dining', '🍽️', 'ร้านอาหาร'], ['online', '🛒', 'ออนไลน์'], ['dept', '🏬', 'ห้าง'], ['supermarket', '🧺', 'ซูเปอร์ฯ'], ['central', '🏷️', 'Central'],
  ['fuel', '⛽', 'น้ำมัน'], ['airhotel', '✈️', 'ตั๋ว/โรงแรม'], ['fx', '🌏', 'ต่างประเทศ'], ['ewallet', '📱', 'e-Wallet'], ['general', '📦', 'ทั่วไป']];
const BILL_RW_PICK_CUR = ['USD', 'JPY', 'SGD', 'EUR', 'KRW', 'CNY', 'MYR', 'VND'];
function billRwPickSet(k, v) {
  if (k === 'amt') { const n = parseFloat(v); if (!(n > 0)) return; billState.rwAmt = n; }
  else billState[k] = v;
  billRwRenderPick();
}
// บรรทัดรอง: คะแนนดิบ (+เงินคืน) และไมล์ ROP ที่เทียบเท่า — คนละหน่วยกับตัวเลขหลัก (บาท) ไม่ใช้จัดอันดับ
function billRwSecondary(c, prof) {
  return `${c.pts.toLocaleString()} ${esc(prof.p.unit)}${c.cash ? ' + เงินคืน ' + billFmt0(c.cash) : ''}${c.miles != null ? ' · ≈ ' + (Math.round(c.miles * 10) / 10).toLocaleString() + ' ไมล์ ROP' : ''}`;
}
function billRwRenderPick() {
  const el = document.getElementById('billRwPick');
  if (!el) return;
  if (!billRwCards().length) { el.innerHTML = ''; return; }
  const tag = billState.rwPick || 'dining', cur = tag === 'fx' ? (billState.rwCur || 'USD') : 'THB', amt = billState.rwAmt || 1000;
  const mode = billRwMode(), rop = mode === 'rop', raw = mode === 'raw';
  const ref = billRwRefDate();
  const t = { type: 'expense', payMethod: 'card', category: tag === 'dining' ? 'food' : 'other', merchant: '', currency: cur, rewardTag: tag === 'fx' ? 'general' : tag, date: ref, amountThb: amt };
  const rank = billRwRank(t, amt);
  // ไมล์จริงจากคะแนน (ไม่รวมเงินคืน) — เงินคืนแสดงแยก แต่ยังใช้มูลค่ารวมจัดอันดับ
  const realMi = r => r.prof.ropPer ? r.pts / r.prof.ropPer : 0;
  const big = r => raw ? `${r.pts.toLocaleString()} <small>${esc(r.prof.p.unit)}</small>`
    : rop ? (r.cash > 0 ? `${realMi(r).toFixed(1)} <small>ไมล์</small> + ${billFmt0(r.cash)}` : r.net > 0 ? `${(amt / r.net).toFixed(1)} <small>฿/ไมล์</small>` : '—')
    : `${r.pct.toFixed(2)}<small>%</small>`;
  const subOf = r => raw ? (r.cash ? 'เงินคืน ' + billFmt0(r.cash) : '')
    : rop ? (r.cash > 0 ? `ไมล์ ROP ${realMi(r).toFixed(1)} + เงินคืน ${billFmt0(r.cash)} · จัดอันดับโดยตีเงินคืนเป็น ≈${r.net.toFixed(0)} ไมล์ (ไมล์ละ ฿${billRwMileBaht()})` : `${r.net.toFixed(1)} ไมล์ จากยอด ${billFmt0(amt)}`)
    : `≈ ${billFmt(Math.round(r.net * 100) / 100)} จากยอด ${billFmt0(amt)} · ${r.pts.toLocaleString()} ${esc(r.prof.p.unit)}${r.cash > 0 ? ' + เงินคืน ' + billFmt0(r.cash) : ''}${r.prof.ropPer ? ' · ≈ ' + (Math.round(r.pts / r.prof.ropPer * 10) / 10) + ' ไมล์ ROP' : ''}`;
  const ruleTxt = r => { const m = billRwMatchedRule(r.prof, t); return (m === '-' ? 'ไม่ได้คะแนนหมวดนี้' : m ? m.label : 'อัตราปกติ') + (mode === 'baht' && r.pts > 0 ? ' · ' + billRwRouteTxt(r.prof) : ''); };
  let html = `<div class="rw-pick-grid">${BILL_RW_PICK.map(([k, ic, l]) => `<button class="${k === tag ? 'on' : ''}" onclick="billRwPickSet('rwPick','${k}')"><b>${ic}</b>${l}</button>`).join('')}</div>`;
  if (tag === 'fx') html += `<div class="chips-row">${BILL_RW_PICK_CUR.map(c => `<button class="bill-chip${c === cur ? ' active' : ''}" onclick="billRwPickSet('rwCur','${c}')">${c}</button>`).join('')}</div>`;
  html += `<div style="display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--text2);margin:2px 0 10px;flex-wrap:wrap;"><span style="white-space:nowrap;">ยอดต่อครั้ง ฿</span><input class="form-input" type="number" min="1" step="100" value="${amt}" style="width:96px;padding:5px 8px;font-size:12px;" onchange="billRwPickSet('amt',this.value)"><span style="color:var(--text3);">· คิดจากเพดานที่เหลือในรอบบิลนี้</span></div>`;
  if (!rank.length) html += '<div class="empty">ยังไม่มีบัตรที่คำนวณได้ในโหมดนี้</div>';
  else {
    const r0 = rank[0];
    const rule0 = billRwMatchedRule(r0.prof, t);
    let capHtml = '';
    if (rule0 && rule0 !== '-' && rule0.capSpend) {
      const cyc = billRwCycle(r0.prof.stmtDay, ref);
      const used = ((billRwCalc(r0.prof, billRwTxs(r0.prof.card, cyc.start, cyc.end)).st[rule0.id]) || {}).used || 0;
      capHtml = `${billRwBar(used, rule0.capSpend)}<div style="font-size:10.5px;color:var(--text3);margin-top:3px;">เพดานรอบนี้ ใช้ ${billFmt0(used)} / ${billFmt0(rule0.capSpend)} — เต็มแล้วอันดับจะสลับไปใบถัดไปเอง</div>`;
    }
    html += `<div class="rw-best-box">
      <div class="rw-cc">${esc(r0.prof.p.bank || '')}<b>${esc(r0.prof.card)}</b></div>
      <div style="flex:1;min-width:0;"><div class="rw-big">${big(r0)}</div><div style="font-size:11.5px;">${subOf(r0)}</div><div style="font-size:10.5px;color:var(--text3);">${esc(ruleTxt(r0))}${r0.fee ? ' · FX ' + r0.fee + '%' : ''}</div></div></div>${capHtml}`;
    html += '<div style="margin-top:8px;">' + rank.slice(1, 6).map((r, k) => `<div class="rw-rank-row"><span class="rw-rank">${k + 2}</span><div style="flex:1;min-width:0;"><div style="font-size:12.5px;font-weight:500;">${esc(r.prof.card)}</div><div style="font-size:10.5px;color:var(--text3);">${esc(ruleTxt(r))}${r.fee ? ' · FX ' + r.fee + '%' : ''}</div></div><b style="font-size:13px;white-space:nowrap;">${big(r)}</b></div>`).join('') + '</div>';
    // บัตรที่ให้โบนัสเป็นก้อน — ถ้ายอดต่อครั้งยังไม่ถึง บอกว่าถึงแล้วจะได้เท่าไร
    billRwCards().forEach(prof => {
      const rule = billRwMatchedRule(prof, t);
      if (!rule || rule === '-' || !rule.block || amt >= rule.block) return;
      const m = billRwMarginal(prof, t, rule.block);
      if (m.none || !(m.metric > r0.metric)) return;
      html += `<div class="rw-tip">💡 ถ้ายอดถึง ${billFmt0(rule.block)}${rule.perSlip ? ' ในสลิปเดียว' : ''}: <b>${esc(prof.card)}</b> ได้ ${raw ? Math.round(m.metric).toLocaleString() + ' ' + esc(prof.p.unit) + '/฿1,000' : rop ? (rule.block / m.net).toFixed(1) + ' ฿/ไมล์' : m.pct.toFixed(2) + '%'}</div>`;
    });
  }
  if (cur !== 'THB') html += billRwFxCompare(t, amt);
  if (raw) html += '<div class="rw-tip" style="color:var(--amber);">คะแนนต่างธนาคารมีมูลค่าไม่เท่ากัน — เรียงตามจำนวนคะแนนเท่านั้น</div>';
  const noRop = billRwNoRop();
  if (noRop.length) html += `<div class="rw-tip">ไม่ได้จัดอันดับ (ยังไม่มีอัตรา ROP): ${noRop.map(esc).join(', ')}</div>`;
  el.innerHTML = html;
}
// ─── ต่างประเทศ: แต้มมาก (FX 2.5%) vs FX ต่ำ (1%) — ไมล์ที่ได้เพิ่มคุ้มค่าธรรมเนียมที่จ่ายเพิ่มไหม ───
// คืนค่าไมล์/คะแนน/มูลค่า + ค่าธรรมเนียมของบัตรนี้ สำหรับยอด base (บาท ก่อนค่าธรรมเนียม) — ไม่ขึ้นกับโหมดที่เลือก
function billRwDelta(prof, t, base, skipId) {
  const cyc = billRwCycle(prof.stmtDay, t.date);
  const txs = billRwTxs(prof.card, cyc.start, cyc.end, skipId);
  const fee = String(t.currency || 'THB').toUpperCase() !== 'THB' ? billCardFee(prof.card) : 0;
  const a = billRwCalc(prof, txs), b = billRwCalc(prof, txs.concat([{ ...t, card: prof.card, amountThb: base * (1 + fee / 100), time: '99:99' }]));
  return { prof, fee, feeCost: base * fee / 100, pts: b.pts - a.pts, cash: b.cash - a.cash,
    miles: prof.ropPer ? (b.pts - a.pts) / prof.ropPer : null, value: b.value - a.value };
}
function billRwFxCompare(t, base) {
  const mb = billRwMileBaht();
  const rows = billRwCards().map(p => billRwDelta(p, t, base));
  const withMiles = rows.filter(r => r.miles != null);
  if (withMiles.length < 2) return '';
  const low = withMiles.slice().sort((a, b) => a.fee - b.fee || b.miles - a.miles)[0];
  // มูลค่าสุทธิเมื่อตีไมล์ละ mb บาท = ไมล์ × mb + เงินคืน − ค่าธรรมเนียม
  const net = r => r.miles * mb + r.cash - r.feeCost;
  const best = withMiles.slice().sort((a, b) => net(b) - net(a))[0];
  const lines = withMiles.filter(r => r !== low && r.miles > low.miles).sort((a, b) => b.miles - a.miles).slice(0, 4).map(r => {
    const dFee = r.feeCost - low.feeCost, dMi = r.miles - low.miles;
    if (dFee <= 0) return `<div class="rw-fx-row"><span><b>${esc(r.prof.card)}</b> ไมล์มากกว่าและค่าธรรมเนียมไม่แพงกว่า</span><b class="pos">คุ้มกว่าเสมอ</b></div>`;
    const be = dFee / dMi;
    return `<div class="rw-fx-row"><span><b>${esc(r.prof.card)}</b> จ่าย FX เพิ่ม ${billFmt(Math.round(dFee * 100) / 100)} ได้ไมล์เพิ่ม ${dMi.toFixed(1)}</span><b style="color:${be < mb ? 'var(--green)' : 'var(--text2)'};">คุ้มถ้าไมล์ > ฿${be.toFixed(2)}</b></div>`;
  }).join('');
  return `<div class="rw-fx"><div style="font-weight:600;margin-bottom:4px;">💱 แต้มเยอะ vs ค่าธรรมเนียมต่ำ (ยอด ${billFmt0(base)})</div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:4px;">เทียบกับ <b>${esc(low.prof.card)}</b> (FX ${low.fee}% · ${low.miles.toFixed(1)} ไมล์)</div>${lines || '<div style="font-size:11px;color:var(--text3);">ไม่มีใบที่ได้ไมล์มากกว่า</div>'}
    <div style="font-size:11.5px;margin-top:6px;">ถ้าตีไมล์ ROP ละ ฿<input class="form-input" type="number" min="0.05" step="0.05" value="${mb}" style="width:64px;padding:3px 6px;font-size:12px;display:inline-block;" onchange="billRwSetMileBaht(this.value)"> → คุ้มสุดหลังหักค่า FX: <b style="color:var(--accent-dark);">${esc(best.prof.card)}</b> (สุทธิ ${net(best) >= 0 ? '+' : '−'}${billFmt(Math.abs(Math.round(net(best) * 100) / 100))})</div>
    <div style="font-size:10px;color:var(--text3);margin-top:4px;line-height:1.5;">ไม่รวมบัตรที่ไม่มีอัตรา ROP (KBank, KWE) · ค่าธรรมเนียมตามที่ตั้งรายใบ (ไม่ได้ตั้ง = ${billDefaultFxFee()}%) · ถ้าจะใช้แต้มแลกส่วนลด/เงินคืนแทนไมล์ ให้ดูโหมด ฿ มูลค่าบาท</div></div>`;
}

// ─── 💬 ถาม AI ว่ารูดใบไหน ───
const RWC_RULES = [
  'คุณคือผู้ช่วยเลือกบัตรเครดิตของผู้ใช้คนเดียว ตอบภาษาไทย กระชับ ตรงประเด็น',
  'ใช้ข้อมูลบัตร เพดาน และตัวเลขที่แอปคำนวณไว้ในส่วน "ข้อมูลจากแอป" เป็นหลัก ห้ามแต่งอัตราหรือโปรที่ไม่มีในข้อมูล ถ้าข้อมูลไม่พอหรือติด "ยังไม่ยืนยัน" ให้บอกตรง ๆ',
  'เริ่มคำตอบด้วยบรรทัด "แนะนำ: <ชื่อบัตร>" แล้วตามด้วยเหตุผลสั้น ๆ (ได้กี่ไมล์/คะแนน/มูลค่า, เพดานเหลือเท่าไร) และใบสำรองถ้าเพดานเต็มหรือยอดเกินเพดาน',
  'ถ้ายอดใช้จ่ายไม่ตรงกับ ฿1,000 ในตาราง ให้คิดตามสัดส่วนเอง แต่ระวังเพดาน (capSpend) และโบนัสแบบก้อน (ต้องครบยอดต่อสลิป/สะสม) — แสดงวิธีคิดสั้น ๆ',
  'ใช้จ่ายต่างประเทศ: เทียบทั้งไมล์/คะแนนที่ได้ และค่าธรรมเนียมแปลงสกุลเงิน (FX) ของแต่ละบัตร บอกจุดคุ้มทุนเป็น "บาทต่อไมล์" และสรุปตามมูลค่าไมล์ที่ผู้ใช้ตั้ง',
  'เป้าหมายหลักของผู้ใช้คือ "ความคุ้มค่ารวม" — ตีทุกอย่างเป็นบาท: แต้มคิดตามทางแลกที่ให้มากกว่า (แลกไมล์ ROP ตามมูลค่าไมล์ที่ผู้ใช้ตั้ง หรือแลกเงินคืน/ส่วนลดตามมูลค่าแต้ม) + เงินคืน − ค่าธรรมเนียม FX แล้วบอกด้วยว่าแต้มของบัตรที่แนะนำควรเอาไปแลกอะไร',
  'ถ้ามูลค่าไมล์มีผลต่อคำตอบ (เช่น ต่างประเทศ: แต้มเยอะ vs FX ต่ำ) ให้บอกจุดคุ้มทุนเป็นบาทต่อไมล์ เพื่อให้ผู้ใช้ตัดสินเองได้',
  'ห้ามแนะนำให้รูดเพื่อให้ได้แต้มจนเกินความจำเป็น และเตือนถ้าบิลใกล้ครบกำหนดชำระ'
].join('\n');
function rwcContext() {
  const L = [], today = todayISO(), mode = billRwMode();
  L.push('วันนี้ ' + today + ' · โหมดที่เปิดอยู่: ' + (mode === 'rop' ? 'ไมล์ ROP' : mode === 'raw' ? 'คะแนนดิบ' : 'คุ้มสุด (บาท)') + ' · ผู้ใช้ตีมูลค่าไมล์ ROP ละ ฿' + billRwMileBaht() + ' (อ้างอิง: ซื้อไมล์ตรงกับการบินไทย ฿1.2/ไมล์, ใช้ไมล์เป็นส่วนลดตั๋ว Cash+Miles ≈฿0.2–0.3/ไมล์)');
  billRwCards().forEach(prof => {
    const p = prof.p, cyc = billRwCycle(prof.stmtDay, today);
    const c = billRwCalc(prof, billRwTxs(prof.card, cyc.start, cyc.end));
    L.push('');
    L.push(`[บัตร] ${prof.card} (${p.bank || ''}) · หน่วย: ${p.unit} · รอบบิลนี้ ${cyc.start}–${cyc.end} (ตัดรอบวันที่ ${prof.stmtDay}, ครบชำระวันที่ ${prof.dueDay}) · รูดรอบนี้ ${Math.round(c.spend)} บาท ได้ ${c.pts} ${p.unit}`);
    L.push(`  อัตราปกติ ${p.base.pts} ${p.unit}/${p.base.per} บาท · ROP: ${prof.ropPer ? prof.ropPer + ' ' + p.unit + ' = 1 ไมล์' : 'ไม่มีอัตรา/โอนเข้า ROP ไม่ได้'} · ถ้าแลกเงินคืน/ส่วนลด 1 ${p.unit} ≈ ฿${prof.pointValue} · มูลค่าที่ใช้ (ทางที่คุ้มกว่า) ≈ ฿${billRwPtBaht(prof).toFixed(3)} (${billRwRouteTxt(prof)}) · FX fee ${billCardFee(prof.card)}%${p.exclude ? ' · ไม่ได้คะแนน: ' + p.exclude.join(',') : ''}${p.excludeCur ? ' · ไม่ได้คะแนนสกุล ' + p.excludeCur.join(',') : ''}`);
    p.rules.forEach(r => {
      if (prof.off[r.id]) return;
      const s = c.st[r.id] || { used: 0, blocks: 0, spend: 0 };
      const active = billRwActive(r, today) ? '' : ' (หมดโปร/ยังไม่เริ่ม)';
      const left = r.capSpend ? ` · ใช้เพดานไป ${Math.round(s.used)}/${r.capSpend} เหลือ ${Math.max(0, Math.round(r.capSpend - s.used))}` : r.block ? ` · ครบแล้ว ${s.blocks}/${r.maxBlocks || '∞'} ครั้ง` : '';
      L.push(`  - โปร: ${r.label} | ${billRwRuleDesc(r, p.unit)} | หมวด: ${(r.tags || ['ทุกหมวด']).join(',')}${r.cur ? ' สกุล ' + r.cur.join(',') : ''}${r.notCur ? ' ยกเว้นสกุล ' + r.notCur.join(',') : ''}${left}${active}${r.verified === false ? ' [ยังไม่ยืนยัน]' : ''}`);
    });
    (p.notes || []).forEach(n => L.push('  หมายเหตุ: ' + n));
    if (prof.memo) L.push('  บันทึกของผู้ใช้: ' + prof.memo);
  });
  const nr = billCards().filter(c => !billRwProfile(c));
  if (nr.length) L.push('\nบัตรที่ยังไม่มีโปรไฟล์ (ไม่มีข้อมูลสิทธิ์): ' + nr.join(', '));
  // ตารางที่แอปคำนวณแล้ว: ต่อ ฿1,000 ในรอบบิลนี้ (เพดานที่ใช้ไปแล้วนับแล้ว)
  L.push('\n===== ตารางคำนวณจากแอป: ยอด ฿1,000 ต่อครั้ง ในรอบบิลปัจจุบัน =====');
  const cats = BILL_RW_PICK.filter(x => x[0] !== 'fx').map(x => [x[0], x[2], 'THB']).concat([['fx', 'ต่างประเทศ USD', 'USD'], ['fx', 'ต่างประเทศ JPY', 'JPY'], ['fx', 'ต่างประเทศ SGD', 'SGD'], ['fx', 'ต่างประเทศ EUR', 'EUR']]);
  cats.forEach(([tag, label, cur]) => {
    const t = { type: 'expense', payMethod: 'card', category: tag === 'dining' ? 'food' : 'other', merchant: '', currency: cur, rewardTag: tag === 'fx' ? 'general' : tag, date: today };
    const rows = billRwCards().map(p => billRwDelta(p, t, 1000)).sort((a, b) => (b.miles || 0) - (a.miles || 0));
    L.push(label + ': ' + rows.map(r => `${r.prof.card} ${r.pts}${r.prof.p.unit === 'ไมล์ KrisFlyer' ? 'ไมล์KF' : 'pt'}${r.miles != null ? '=' + r.miles.toFixed(1) + 'ไมล์ROP' : ''}${r.cash ? '+เงินคืน฿' + r.cash.toFixed(0) : ''}${r.fee ? ' FX฿' + r.feeCost.toFixed(0) : ''} มูลค่าคุ้มสุดสุทธิ≈฿${(r.value - r.feeCost).toFixed(1)}`).join(' | '));
  });
  return L.join('\n');
}
// ─── แท็บภาพรวม: กล่อง "บิลถัดไป" + "คะแนน/ไมล์รอบนี้" ───
function billRenderOvTiles() {
  const el = document.getElementById('billOvTiles');
  if (!el) return;
  const profs = billRwCards();
  if (!profs.length) { el.style.display = 'none'; return; }
  el.style.display = '';
  const dues = billRwDues().filter(x => !x.done && x.days >= 0);
  let due;
  if (dues.length) {
    const d0 = dues[0], g = dues.filter(x => x.due === d0.due);
    const banks = [...new Set(g.map(x => x.prof.p.bank))];
    const name = g.length === 1 ? g[0].prof.card : banks.length === 1 ? banks[0] + ' ×' + g.length : g.length + ' ใบ';
    const sum = g.reduce((a, x) => a + Math.max(0, x.spent - x.paid), 0);
    due = `<div class="k">⏰ บิลถัดไป</div><div class="v">${esc(name)}</div><div class="s">${billFmt0(sum)}</div><span class="rw-pill ${d0.days <= 3 ? 'due' : 'ok'}">${billRwShort(d0.due)} · ${d0.days === 0 ? 'วันนี้' : 'อีก ' + d0.days + ' วัน'}</span>`;
  } else due = '<div class="k">⏰ บิลถัดไป</div><div class="v" style="font-size:15px;">ไม่มีบิลค้าง</div><div class="s" style="color:var(--text3);">ยอดรอบที่ปิดแล้วจ่ายครบ</div>';
  const mode = billRwMode(), today = todayISO();
  let tot = 0, used = 0;
  profs.forEach(prof => {
    const cyc = billRwCycle(prof.stmtDay, today);
    const c = billRwCalc(prof, billRwTxs(prof.card, cyc.start, cyc.end));
    if (c.spend > 0) used++;
    tot += mode === 'rop' ? (c.miles || 0) : mode === 'baht' ? c.value : c.pts;
  });
  const earn = mode === 'rop' ? `<div class="k">✈️ ไมล์ ROP รอบนี้</div><div class="v">${Math.floor(tot).toLocaleString()}</div>`
    : mode === 'baht' ? `<div class="k">💰 มูลค่าแต้ม+เงินคืนรอบนี้</div><div class="v">≈ ${billFmt0(tot)}</div>`
    : `<div class="k">🔢 คะแนนรอบนี้</div><div class="v" style="font-size:15px;">ดูรายบัตร ›</div>`;
  el.innerHTML = `<div class="tile bill-tap" onclick="billSetTab('cards')">${due}</div>
    <div class="tile bill-tap" onclick="billSetTab('cards')">${earn}<div class="s" style="color:var(--text3);">ใช้ ${used} จาก ${profs.length} บัตร · แตะดูว่ารูดใบไหนดี</div></div>`;
}
// ─── แท็บของหน้าบิล ───
function billSetTab(tab) {
  billState.tab = tab;
  localStorage.setItem('folio_bill_tab', tab);
  billRender();
  const tabs = document.getElementById('billTabs');
  if (tabs && tabs.getBoundingClientRect().top < 0) tabs.scrollIntoView({ block: 'start' });
}
function billApplyTab() {
  const tab = billState.tab || localStorage.getItem('folio_bill_tab') || 'overview';
  billState.tab = tab;
  document.querySelectorAll('#billTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  document.querySelectorAll('#page-bills .bill-tab').forEach(sct => sct.classList.toggle('on', sct.dataset.tab === tab));
  const hero = document.getElementById('billMetrics');
  if (hero) hero.classList.toggle('compact', tab !== 'overview');
  document.getElementById('page-bills').classList.toggle('tab-budget', tab === 'budget'); // แท็บงบคิดเดือนปัจจุบันเสมอ → ซ่อนตัวเลือกเดือน/ปีบนหัวหน้า // การ์ดสรุปเต็มเฉพาะแท็บภาพรวม แท็บอื่นเป็นบรรทัดเดียว
}
// ─── ตั้งค่าโปรไฟล์บัตร ───
function billRwSaveAll(o) {
  localStorage.setItem('folio_bill_card_profiles', JSON.stringify(o));
  billSyncSettings();
  if (typeof billRender === 'function') billRender();
}
function billRwSet(card, field, value) {
  const all = billRwSaved();
  const cur = all[card] || { preset: billRwAutoPreset(card) };
  if (field === 'preset') cur.preset = value;
  else if (field === 'stmtDay' || field === 'dueDay') { const n = parseInt(value, 10); if (n >= 1 && n <= 31) cur[field] = n; else delete cur[field]; }
  else if (field === 'pointValue') { const n = parseFloat(value); if (n >= 0 && n <= 10) cur.pointValue = n; else delete cur.pointValue; }
  else if (field === 'ropPer') { const n = parseFloat(value); if (n > 0 && n <= 100) cur.ropPer = n; else delete cur.ropPer; }
  else if (field === 'memo') cur.memo = String(value || '').slice(0, 200);
  else if (field.startsWith('off:')) { cur.off = cur.off || {}; if (value) cur.off[field.slice(4)] = true; else delete cur.off[field.slice(4)]; }
  all[card] = cur;
  billRwSaveAll(all);
  billRwRenderModal();
}
function billRwAddAll() {
  const list = billCards().slice();
  let added = 0;
  BILL_RW_ORDER.forEach(k => {
    if (list.some(c => billRwProfile(c) && billRwProfile(c).key === k)) return;
    list.push(BILL_RW_PRESETS[k].name); added++;
  });
  if (added) billSetCards(list);
  showToast(added ? 'เพิ่มบัตร ' + added + ' ใบพร้อมโปรไฟล์สิทธิ์แล้ว' : 'บัตรทุกใบมีโปรไฟล์อยู่แล้ว');
  if (typeof billRender === 'function') billRender();
  billRwRenderModal();
}
function billRwSetMileBaht(v) { const n = parseFloat(v); if (!(n > 0 && n <= 10)) { showToast('ใส่ตัวเลขมากกว่า 0'); return; } localStorage.setItem('folio_bill_rw_milebaht', String(n)); billSyncSettings(); if (typeof billRender === 'function') billRender(); showToast('1 ไมล์ ROP = ฿' + n); }
// ─── แก้สิทธิ์ในแอป (ไม่ต้องแก้โค้ด) ───
// คำอธิบายตัวเลขจริงของกฎ (หลังแก้แล้ว)
function billRwRuleDesc(r, unit) {
  const a = [];
  if (r.pct) a.push('เงินคืน ' + r.pct + '%' + (r.capCash ? ' (สูงสุด ' + billFmt0(r.capCash) + '/รอบ)' : ''));
  else if (r.block) a.push(`+${r.bonusPts} ${unit}/${r.per}฿ เมื่อครบ ${billFmt0(r.block)}${r.perSlip ? '/สลิป' : ''} · ${r.maxBlocks || '∞'} ครั้ง/รอบ`);
  else a.push(`${r.pts} ${unit} ต่อ ${r.per} บาท`);
  if (r.capSpend) a.push('เพดานยอด ' + billFmt0(r.capSpend) + '/รอบ');
  if (r.minSlip) a.push('ขั้นต่ำ ' + billFmt0(r.minSlip) + '/สลิป');
  if (r.cur) a.push('สกุล ' + r.cur.join('/'));
  if (r.validTo) a.push('ถึง ' + billFmtDate(r.validTo));
  return a.join(' · ');
}
function billRwRuleEditor(q, prof, r) {
  const unit = prof.p.unit, rid = esc(JSON.stringify(r.id));
  const inp = (f, v, step, ph) => `<label class="rw-ed-f">${ph}<input class="form-input rw-num" type="number" min="0" step="${step}" value="${v == null ? '' : v}" onchange='billRwRuleSet(${q},${rid},"${f}",this.value)'></label>`;
  let fields;
  if (r.pct) fields = inp('pct', r.pct, 0.5, 'เงินคืน %') + inp('capCash', r.capCash, 100, 'เงินคืนสูงสุด/รอบ ฿') + inp('minSlip', r.minSlip, 100, 'ขั้นต่ำต่อสลิป ฿');
  else if (r.block) fields = inp('bonusPts', r.bonusPts, 0.5, `โบนัส ${unit}/${r.per}฿`) + inp('block', r.block, 500, 'ต้องครบ ฿') + inp('maxBlocks', r.maxBlocks, 1, 'ครั้ง/รอบ');
  else fields = inp('pts', r.pts, 0.5, unit) + inp('per', r.per, 0.5, 'ต่อ ฿') + inp('capSpend', r.capSpend, 1000, 'เพดานยอด/รอบ ฿ (ว่าง = ไม่มี)');
  fields += `<label class="rw-ed-f">หมดเขต<input class="form-input" type="date" value="${esc(r.validTo || '')}" onchange='billRwRuleSet(${q},${rid},"validTo",this.value)' style="padding:5px 6px;font-size:12px;"></label>`;
  const tag = r.custom ? ' <span class="rw-edited">เพิ่มเอง</span>' : r.edited ? ' <span class="rw-edited">แก้แล้ว</span>' : billRwBadge(r.verified);
  return `<div style="border-top:0.5px solid var(--bg2);padding:5px 0;">
    <label style="display:flex;gap:8px;align-items:flex-start;font-size:11.5px;cursor:pointer;">
      <input type="checkbox" ${prof.off[r.id] ? '' : 'checked'} onchange='billRwSet(${q},"off:${r.id}",!this.checked)' style="margin-top:2px;accent-color:var(--accent);">
      <span>${esc(r.label)}${tag}<br><span style="color:var(--text2);font-size:10.5px;">${esc(billRwRuleDesc(r, unit))}</span>${r.note ? '<br><span style="color:var(--text3);font-size:10.5px;">' + esc(r.note) + '</span>' : ''}</span></label>
    <details style="margin-left:22px;"><summary style="font-size:10.5px;color:var(--accent);cursor:pointer;">✏️ แก้ตัวเลข${r.custom ? ' / ลบ' : ''}</summary>
      <div class="rw-ed">${fields}</div>
      ${r.custom ? `<button class="bill-del" style="font-size:11px;color:var(--red);" onclick='billRwCustomDel(${q},${rid})'>🗑️ ลบโปรนี้</button>` : ''}</details></div>`;
}
function billRwRuleSet(card, rid, field, value) {
  const all = billRwSaved();
  const cur = all[card] || { preset: billRwAutoPreset(card) };
  const custom = (cur.custom || []).find(c => c.id === rid);
  const tgt = custom || ((cur.ruleEdit = cur.ruleEdit || {})[rid] = (cur.ruleEdit || {})[rid] || {});
  if (field === 'validTo') { if (/^\d{4}-\d{2}-\d{2}$/.test(value)) tgt.validTo = value; else tgt.validTo = ''; }
  else { const n = parseFloat(value); if (n > 0) tgt[field] = n; else tgt[field] = (field === 'capSpend' || field === 'capCash' || field === 'maxBlocks' || field === 'minSlip') ? 0 : tgt[field]; }
  all[card] = cur;
  billRwSaveAll(all); billRwRenderModal();
}
function billRwBaseSet(card, field, value) {
  const n = parseFloat(value);
  if (!(n >= 0)) { showToast('ใส่ตัวเลข'); return; }
  const all = billRwSaved();
  const cur = all[card] || { preset: billRwAutoPreset(card) };
  cur.base = Object.assign({}, cur.base, { [field]: field === 'per' ? Math.max(1, n) : n });
  all[card] = cur;
  billRwSaveAll(all); billRwRenderModal();
}
function billRwCustomForm(q, card) {
  const id = 'rwc' + Math.abs([...card].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7));
  const tagOpts = '<option value="all">ทุกการใช้จ่าย</option><option value="fx">🌏 สกุลเงินต่างประเทศ</option>' + Object.keys(BILL_RW_TAGS).map(k => `<option value="${k}">${BILL_RW_TAGS[k]}</option>`).join('');
  return `<details style="margin-top:6px;"><summary style="font-size:11.5px;color:var(--accent);cursor:pointer;">➕ เพิ่มโปร/สิทธิ์ใหม่ของบัตรนี้</summary>
    <div class="rw-ed" id="${id}">
      <label class="rw-ed-f" style="grid-column:1/-1;">ชื่อโปร<input class="form-input" data-f="label" placeholder="เช่น ลงทะเบียน x5 ร้านอาหาร ธ.ค."></label>
      <label class="rw-ed-f">หมวด<select class="form-select" data-f="tag">${tagOpts}</select></label>
      <label class="rw-ed-f">เฉพาะสกุลเงิน<input class="form-input" data-f="cur" placeholder="เช่น JPY (ว่างได้)" maxlength="3"></label>
      <label class="rw-ed-f">แบบ<select class="form-select" data-f="kind"><option value="pts">คะแนนต่อยอด</option><option value="pct">เงินคืน %</option></select></label>
      <label class="rw-ed-f">คะแนน / เงินคืน %<input class="form-input rw-num" type="number" min="0" step="0.5" data-f="val" placeholder="เช่น 5"></label>
      <label class="rw-ed-f">ต่อทุก ฿ (แบบคะแนน)<input class="form-input rw-num" type="number" min="1" step="0.5" data-f="per" value="25"></label>
      <label class="rw-ed-f">เพดานยอด/รอบ ฿<input class="form-input rw-num" type="number" min="0" step="1000" data-f="cap" placeholder="ว่าง = ไม่มี"></label>
      <label class="rw-ed-f">หมดเขต<input class="form-input" type="date" data-f="to" style="padding:5px 6px;font-size:12px;"></label>
      <button class="btn-primary" style="grid-column:1/-1;font-size:12px;padding:7px;" onclick='billRwCustomAdd(${q},"${id}")'>บันทึกโปร</button>
    </div></details>`;
}
function billRwCustomAdd(card, id) {
  const box = document.getElementById(id);
  if (!box) return;
  const v = f => (box.querySelector('[data-f="' + f + '"]') || {}).value || '';
  const val = parseFloat(v('val'));
  if (!(val > 0)) { showToast('ใส่จำนวนคะแนนหรือ % เงินคืน'); return; }
  const kind = v('kind'), cur = v('cur').trim().toUpperCase();
  const c = { id: 'u_' + Date.now().toString(36), label: v('label').trim().slice(0, 60) || 'โปรที่เพิ่มเอง', tag: v('tag'),
    cur: /^[A-Z]{3}$/.test(cur) ? cur : '', per: parseFloat(v('per')) > 0 ? parseFloat(v('per')) : 25,
    capSpend: parseFloat(v('cap')) > 0 ? parseFloat(v('cap')) : 0, validTo: /^\d{4}-\d{2}-\d{2}$/.test(v('to')) ? v('to') : '' };
  if (kind === 'pct') c.pct = val; else c.pts = val;
  const all = billRwSaved();
  const curP = all[card] || { preset: billRwAutoPreset(card) };
  curP.custom = (curP.custom || []).concat(c);
  all[card] = curP;
  billRwSaveAll(all); billRwRenderModal();
  showToast('เพิ่มโปร "' + c.label + '" แล้ว');
}
function billRwCustomDel(card, rid) {
  if (!confirm('ลบโปรนี้?')) return;
  const all = billRwSaved();
  if (!all[card]) return;
  all[card].custom = (all[card].custom || []).filter(c => c.id !== rid);
  billRwSaveAll(all); billRwRenderModal();
}
function billRwReset(card) {
  if (!confirm('ล้างตัวเลขที่แก้และโปรที่เพิ่มเองของ ' + card + '? (วันตัดรอบ/อัตรา ROP/หมายเหตุยังอยู่)')) return;
  const all = billRwSaved();
  if (!all[card]) return;
  delete all[card].ruleEdit; delete all[card].custom; delete all[card].base;
  billRwSaveAll(all); billRwRenderModal();
}
// ⚙️ ในหน้าบิล → ไปหัวข้อ "ตั้งค่าหน้าบิล" ในหน้าตั้งค่า
function billOpenSettings() {
  showPage('settings');
  const el = document.getElementById('settingsBill');
  if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600); }
}
// แถบเตือนโปรที่หมดอายุแล้ว/จะหมดใน 30 วัน (นับเฉพาะกฎที่ยังเปิดอยู่) — แก้วันหมดอายุได้ในตั้งค่าบัตรโดยไม่ต้องแก้โค้ด
function billRwExpiring(profs, today) {
  const out = [];
  profs.forEach(prof => prof.p.rules.forEach(r => {
    if (prof.off[r.id] || !r.validTo) return;
    const days = billRwDays(today, r.validTo);
    if (days <= 30) out.push({ prof, r, days });
  }));
  return out.sort((a, b) => a.days - b.days);
}
function billRwExpiryBanner(profs, today) {
  const L = billRwExpiring(profs, today);
  if (!L.length) return '';
  const gone = L.filter(x => x.days < 0).length;
  const line = x => `<div>${x.days < 0 ? '⌛ หมดแล้ว' : '⏳ อีก ' + x.days + ' วัน'} · <b>${esc(x.prof.card)}</b> · ${esc(x.r.label)} <span style="color:var(--text3);">(${billFmtDate(x.r.validTo)})</span></div>`;
  return `<div class="insight" id="billRwExpiry" style="background:var(--amber-bg);color:var(--amber);font-size:11.5px;border-radius:10px;padding:8px 10px;margin-bottom:10px;line-height:1.6;">
    <div style="font-weight:600;">${gone ? '⌛ มีโปรหมดอายุแล้ว ' + gone + ' รายการ' : '⏳ มีโปรใกล้หมดอายุ'}${L.length > gone && gone ? ' · ใกล้หมดใน 30 วัน ' + (L.length - gone) + ' รายการ' : ''}${gone ? ' — อันดับบัตรไม่นับโปรที่หมดแล้ว' : ''}</div>
    ${L.slice(0, 4).map(line).join('')}${L.length > 4 ? '<div>… และอีก ' + (L.length - 4) + ' รายการ</div>' : ''}
    <button class="bill-chip" style="margin-top:6px;min-height:36px;" onclick="billRwOpen()">แก้วันหมดอายุในตั้งค่าบัตร</button></div>`;
}
function billRwOpen() { billRwRenderModal(); openModal('billRwModal'); }
function billRwRenderModal() {
  const el = document.getElementById('billRwModalBody');
  if (!el) return;
  const cards = billCards();
  const head = `<div class="bill-draft" style="background:var(--surface);">
      <div class="form-group"><label class="form-label">1 ไมล์ ROP ≈ กี่บาท (ใช้ตีค่าแต้มที่แลก ROP และแปลงเงินคืนเป็นไมล์)</label><input class="form-input" type="number" min="0.05" step="0.05" value="${billRwMileBaht()}" onchange="billRwSetMileBaht(this.value)"></div>
      <div style="font-size:10.5px;color:var(--text3);line-height:1.6;margin-top:4px;">จัดอันดับด้วยมูลค่าเป็นบาท (ทางแลกแต้มที่ดีที่สุด + เงินคืน − ค่าธรรมเนียม FX) · ไมล์ ROP และคะแนนดิบแสดงเป็นบรรทัดรองของแต่ละบัตร</div></div>`;
  if (!cards.length) { el.innerHTML = head + '<div class="empty">ยังไม่มีบัตรในรายชื่อ — กด "เพิ่มบัตรตามโปรไฟล์" ด้านบน</div>'; return; }
  el.innerHTML = head + cards.map(card => {
    const prof = billRwProfile(card);
    const s = billRwSaved()[card];
    const presetKey = s && typeof s.preset === 'string' ? s.preset : billRwAutoPreset(card);
    const q = esc(JSON.stringify(card));
    const opts = `<option value="">— ไม่ผูกโปรไฟล์ —</option>` + BILL_RW_ORDER.map(k => `<option value="${k}" ${k === presetKey ? 'selected' : ''}>${esc(BILL_RW_PRESETS[k].name)}</option>`).join('');
    let body = '';
    if (prof) {
      const p = prof.p;
      body = `<div class="bill-draft-grid" style="margin-top:8px;">
          <div class="form-group"><label class="form-label">วันตัดรอบ</label><input class="form-input" type="number" min="1" max="31" value="${prof.stmtDay}" onchange='billRwSet(${q},"stmtDay",this.value)'></div>
          <div class="form-group"><label class="form-label">วันครบกำหนดชำระ</label><input class="form-input" type="number" min="1" max="31" value="${prof.dueDay}" onchange='billRwSet(${q},"dueDay",this.value)'></div>
          <div class="form-group full"><label class="form-label">${esc(p.unit)} ต่อ 1 ไมล์ ROP${prof.ropOk ? '' : billRwBadge(false)}</label><input class="form-input" type="number" min="0" step="0.1" value="${prof.ropPer || ''}" placeholder="ยังไม่รู้ — เว้นว่าง = ไม่จัดอันดับในโหมด ROP" onchange='billRwSet(${q},"ropPer",this.value)'><span style="font-size:10px;color:var(--text3);line-height:1.5;">${esc((BILL_RW_ROP[prof.key] || {}).note || '')}</span></div>
          <div class="form-group full"><label class="form-label">มูลค่า 1 ${esc(p.unit)} ถ้าแลกเงินคืน/ส่วนลด (บาท)${p.pvUnverified ? billRwBadge(false) : ''}</label><input class="form-input" type="number" min="0" step="0.005" value="${prof.pointValue}" onchange='billRwSet(${q},"pointValue",this.value)'><span style="font-size:10px;color:var(--text3);line-height:1.5;">${esc(p.pvNote || '')}</span></div>
        </div>
        <div style="font-size:11px;color:var(--text2);margin:4px 0;display:flex;gap:6px;align-items:center;flex-wrap:wrap;">อัตราปกติ
          <input class="form-input rw-num" style="width:70px;" type="number" min="0" step="0.5" value="${p.base.pts}" onchange='billRwBaseSet(${q},"pts",this.value)'> ${esc(p.unit)} ต่อ
          <input class="form-input rw-num" style="width:70px;" type="number" min="1" step="0.5" value="${p.base.per}" onchange='billRwBaseSet(${q},"per",this.value)'> บาท${p.base.edited ? ' <span class="rw-edited">แก้แล้ว</span>' : billRwBadge(p.base.verified)}${p.fxFee != null ? ' · FX ' + p.fxFee + '%' : ''}</div>
        ${p.rules.map(r => billRwRuleEditor(q, prof, r)).join('')}
        ${billRwCustomForm(q, card)}
        ${s && (s.ruleEdit || s.custom || s.base) ? `<button class="bill-del" style="font-size:11px;color:var(--red);" onclick='billRwReset(${q})'>↺ ล้างสิทธิ์ที่แก้เอง กลับเป็นค่าเริ่มต้น</button>` : ''}
        <div class="form-group" style="margin-top:6px;"><label class="form-label">หมายเหตุของบัตร (เช่น โปรชั่วคราวที่ลงทะเบียนไว้)</label><input class="form-input" value="${esc(prof.memo)}" onchange='billRwSet(${q},"memo",this.value)'></div>`;
    }
    return `<div class="bill-draft" style="background:var(--surface);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><strong style="font-size:13px;">💳 ${esc(card)}</strong>${prof && prof.auto ? '<span style="font-size:10px;color:var(--text3);">เดาจากชื่อ</span>' : ''}</div>
      <select class="form-select" style="width:100%;margin-top:6px;" onchange='billRwSet(${q},"preset",this.value)'>${opts}</select>${body}</div>`;
  }).join('');
}
