// Folio — แดชบอร์ดสัญญาณตลาด (Macro, ปฏิทิน, สัญญาณรายสินทรัพย์, ตัวช่วย DCA)
// โหลดหลัง js/bill.js
// แยกมาจาก index.html (เฟส 8) — เนื้อหาเดิมทุกบรรทัด ลำดับการโหลดต้องคงตาม <script src> ใน index.html

// ═══════════════════════════════════════════════════════════════════════
// แดชบอร์ดสัญญาณตลาด (เฟส 1: Macro + ปฏิทิน · เฟส 2: สัญญาณรายสินทรัพย์ + ตัวช่วย DCA)
// ข้อมูลทั้งหมดผ่าน Worker (folio-proxy) — หน้าเว็บไม่ถือ API key ใด ๆ
// สัญญาณเป็นข้อมูลประกอบการตัดสินใจ ไม่ใช่คำแนะนำการลงทุน
// ═══════════════════════════════════════════════════════════════════════
function sgProxy() { return (window._PROXY_URL || localStorage.getItem('folio_PROXY_URL') || SET_PROXY).replace(/\/+$/, ''); }

async function sgFetch(params, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs || 20000);
  try {
    const r = await fetch(sgProxy() + '/?' + params, { signal: ctl.signal });
    const d = await r.json();
    return d;
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'หมดเวลารอ' : 'เชื่อมต่อ Worker ไม่ได้' };
  } finally { clearTimeout(timer); }
}

function sgHowto(html) {
  return '<details class="sg-howto"><summary>วิธีอ่าน</summary><div>' + html + '</div></details>';
}
function sgFmtNum(v, dp) {
  if (v == null || !isFinite(v)) return '—';
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function sgPct(v, dp) {
  if (v == null || !isFinite(v)) return '—';
  return (v > 0 ? '+' : '') + v.toFixed(dp == null ? 2 : dp) + '%';
}
function sgDateTH(d, withTime) {
  const opt = { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' };
  if (withTime) { opt.hour = '2-digit'; opt.minute = '2-digit'; }
  return d.toLocaleString('th-TH', opt);
}
// YYYY-MM-DD ของวันนั้นในเวลาไทย
function sgBkkISO(d) { return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }); }

// ─────────────────────────────── เฟส 1: Macro ───────────────────────────────
// good: +1 = ขึ้นแล้วดีต่อพอร์ต, -1 = ขึ้นแล้วไม่ดีต่อพอร์ต
const SG_MACRO_META = {
  US10Y:  { label: 'US 10Y Yield', good: -1, dp: 2, yield: true,
            why: 'yield ขึ้น = ต้นทุนเงินแพง กดดันหุ้นเติบโต/ทอง/กองตราสารหนี้' },
  DXY:    { label: 'Dollar Index (DXY)', good: -1, dp: 2,
            why: 'ดอลลาร์แข็ง = เงินไหลออกจากตลาดเกิดใหม่ ทอง/crypto มักอ่อน' },
  USDTHB: { label: 'USD/THB', good: -1, dp: 3,
            why: 'ค่าบาทอ่อน = DCA กองต่างประเทศได้หน่วยน้อยลง (แต่กองไม่ hedge ที่ถืออยู่มูลค่าเป็นบาทเพิ่ม)' },
  SPX:    { label: 'S&P 500', good: 1, dp: 2, why: 'ตลาดหุ้นสหรัฐโดยรวม' },
  NDX:    { label: 'Nasdaq', good: 1, dp: 2, why: 'หุ้นเทคโนโลยีสหรัฐ' },
  SET:    { label: 'SET Index', good: 1, dp: 2, why: 'ตลาดหุ้นไทย' },
  GOLD:   { label: 'ทองคำ (USD/oz)', good: 1, dp: 1, prefix: '$', why: 'ราคาทอง Futures (COMEX)' },
  VIX:    { label: 'VIX (ดัชนีความกลัว)', good: -1, dp: 2, why: 'VIX สูง = ตลาดกลัว ผันผวนแรง (> 30 = กลัวมาก)' },
  BRENT:  { label: 'น้ำมัน Brent', good: -1, dp: 2, prefix: '$', why: 'น้ำมันแพง = เงินเฟ้อสูง ดอกเบี้ยลดยาก' },
};
const SG_MACRO_ORDER = ['US10Y', 'DXY', 'USDTHB', 'SPX', 'NDX', 'SET', 'GOLD', 'VIX', 'BRENT'];
window._sgMacro = null;

function sgMacroSkeleton() {
  const g = document.getElementById('sgMacroGrid'); if (!g) return;
  g.innerHTML = SG_MACRO_ORDER.map(k =>
    '<div class="sg-mcard"><div class="sg-mlabel">' + esc(SG_MACRO_META[k].label) + '</div><div class="sg-mval sg-muted">กำลังโหลด…</div></div>'
  ).join('');
}

async function sgLoadMacro() {
  const g = document.getElementById('sgMacroGrid'); if (!g) return;
  sgMacroSkeleton();
  const st = document.getElementById('sgMacroStatus');
  const d = await sgFetch('macro=1', 25000);
  if (d.error || !Array.isArray(d.items)) {
    g.innerHTML = '<div class="sg-note" style="grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0;">' +
      '<span>⚠️ โหลดข้อมูลตลาดไม่ได้ (' + esc(d.error || 'Worker ยังไม่ได้อัปเดต') + ')</span>' +
      '<button class="sg-btn" style="white-space:nowrap;flex-shrink:0;" onclick="sgLoadMacro()">ลองใหม่</button></div>';
    if (st) st.textContent = '';
    return;
  }
  const byKey = {}; d.items.forEach(it => { byKey[it.key] = it; });
  window._sgMacro = byKey;
  g.innerHTML = SG_MACRO_ORDER.map(k => sgMacroCard(k, byKey[k] || { error: 'no data' })).join('');
  if (st) st.textContent = 'อัปเดต ' + new Date((d.fetchedAt || Date.now() / 1000) * 1000).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น. · Yahoo Finance (อาจช้า ~15 นาที)';
}

// ^TNX บางช่วง Yahoo ส่งเป็น yield×10 (เช่น 42.5 = 4.25%) — ปรับให้เป็น % เสมอ
function sgYieldFix(v) { return v != null && v > 20 ? v / 10 : v; }

function sgMacroCard(k, it) {
  const m = SG_MACRO_META[k];
  if (!it || it.error || it.price == null) {
    return '<div class="sg-mcard sg-err"><div class="sg-mlabel">' + esc(m.label) + '</div><div class="sg-mval sg-muted">โหลดไม่ได้</div><div class="sg-msub">' + esc((it && it.error) || '') + '</div></div>';
  }
  let price = it.price, prev = it.prev, week = it.week;
  let d1txt, d7txt, d1, d7;
  if (m.yield) {
    price = sgYieldFix(price); prev = sgYieldFix(prev); week = sgYieldFix(week);
    d1 = prev != null ? (price - prev) * 100 : null; // basis points
    d7 = week != null ? (price - week) * 100 : null;
    d1txt = d1 == null ? '—' : (d1 > 0 ? '+' : '') + d1.toFixed(1) + ' bp';
    d7txt = d7 == null ? '—' : (d7 > 0 ? '+' : '') + d7.toFixed(1) + ' bp';
  } else {
    d1 = prev ? (price - prev) / prev * 100 : null;
    d7 = week ? (price - week) / week * 100 : null;
    d1txt = sgPct(d1); d7txt = sgPct(d7);
  }
  const dead = m.yield ? 1 : 0.05; // เปลี่ยนน้อยกว่านี้ถือว่าทรงตัว
  const tone = v => v == null || Math.abs(v) < dead ? 'flat' : (Math.sign(v) * m.good > 0 ? 'good' : 'bad');
  const t1 = tone(d1), t7 = tone(d7);
  const valTxt = (m.prefix || '') + sgFmtNum(price, m.dp) + (m.yield ? '%' : '');
  const asOf = it.asOf ? sgDateTH(new Date(it.asOf * 1000), true) : '';
  return '<div class="sg-mcard sg-' + t1 + '" title="' + esc(m.why) + '">' +
    '<div class="sg-mlabel">' + esc(m.label) + '</div>' +
    '<div class="sg-mval">' + valTxt + '</div>' +
    '<div class="sg-mchg"><span class="sg-t-' + t1 + '">วันนี้ ' + d1txt + '</span><span class="sg-t-' + t7 + '">7 วัน ' + d7txt + '</span></div>' +
    sgSpark(it.spark, t7) +
    '<div class="sg-msub">' + esc(asOf) + '</div>' +
  '</div>';
}

function sgSpark(arr, tone) {
  if (!Array.isArray(arr) || arr.length < 3) return '';
  const w = 100, h = 22, mn = Math.min(...arr), mx = Math.max(...arr), rg = mx - mn || 1;
  const pts = arr.map((v, i) => (i / (arr.length - 1) * w).toFixed(1) + ',' + (h - (v - mn) / rg * (h - 2) - 1).toFixed(1)).join(' ');
  const col = tone === 'good' ? 'var(--green)' : tone === 'bad' ? 'var(--red)' : 'var(--text3)';
  return '<svg class="sg-spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><polyline fill="none" stroke="' + col + '" stroke-width="1.3" points="' + pts + '"/></svg>';
}

// ─────────────────────────── เฟส 1: ปฏิทินเศรษฐกิจ ───────────────────────────
// วันประชุมธนาคารกลาง (วันประกาศผล) — อัปเดตทุกต้นปีจาก federalreserve.gov และ bot.or.th
// Fed: ประกาศ 14:00 เวลานิวยอร์ก (= ตี 1–2 ของวันถัดไปเวลาไทย)
const SG_CB_EVENTS = [
  { date: '2026-12-09T14:00:00-05:00', title: 'Fed ประกาศดอกเบี้ย (FOMC)', country: 'USD', impact: 'High', cb: 'fed' },
  { date: '2026-12-23T00:00:00+07:00', title: 'กนง. ประชุมนโยบายการเงิน (ประกาศผลระหว่างวัน)', country: 'THB', impact: 'High', cb: 'bot', allDay: true },
];
const SG_CAL_HIGH_ONLY = ['EUR', 'CNY', 'JPY', 'GBP'];
window._sgCalendar = [];
window._sgDivEvents = [];

async function sgLoadCalendar() {
  const box = document.getElementById('sgCalList'); if (!box) return;
  box.innerHTML = '<div class="sg-muted" style="padding:10px 0;font-size:12px;">กำลังโหลดปฏิทิน…</div>';
  const d = await sgFetch('calendar=1', 25000);
  const now = Date.now(), end = now + 8 * 86400000;
  let ev = [];
  let note = '';
  if (d.error || !Array.isArray(d.events)) note = '⚠️ ปฏิทิน Forex Factory โหลดไม่ได้ (' + (d.error || 'Worker ยังไม่ได้อัปเดต') + ') — แสดงเฉพาะวันประชุมธนาคารกลาง';
  else {
    ev = d.events.filter(e => e.country === 'USD' || e.country === 'THB' || (SG_CAL_HIGH_ONLY.includes(e.country) && e.impact === 'High'));
    if (d.notes && d.notes.length) note = 'หมายเหตุ: ข้อมูลสัปดาห์หน้าอาจยังไม่ออก (Forex Factory ปล่อยทีละสัปดาห์)';
  }
  // กันซ้ำกับ FF: ถ้า FF มีรายการ FOMC/Federal Funds Rate วันเดียวกันแล้ว ไม่ต้องใส่ของเรา
  SG_CB_EVENTS.forEach(c => {
    const day = sgBkkISO(new Date(c.date));
    const dup = c.cb === 'fed' && ev.some(e => /FOMC|Federal Funds/i.test(e.title) && sgBkkISO(new Date(e.date)) === day);
    if (!dup) ev.push(c);
  });
  ev = ev.concat(window._sgDivEvents || []);
  ev = ev.map(e => ({ ...e, _t: new Date(e.date).getTime() }))
    .filter(e => isFinite(e._t) && e._t >= now - 3 * 3600000 && e._t <= end)
    .sort((a, b) => a._t - b._t);
  window._sgCalendar = ev;
  // เหตุการณ์ธนาคารกลางถัดไปที่เลย 8 วัน — โชว์ตอนช่วง 8 วันไม่มีอะไร
  const nextCb = SG_CB_EVENTS.map(c => ({ ...c, _t: new Date(c.date).getTime() })).filter(c => c._t > end).sort((a, b) => a._t - b._t);
  sgRenderCalendar(ev, note, nextCb);
}

function sgRenderCalendar(ev, note, nextCb) {
  const box = document.getElementById('sgCalList'); if (!box) return;
  if (!ev.length) {
    let nx = '';
    if (nextCb && nextCb.length) {
      nx = '<div class="sg-sect" style="margin-top:8px;">เหตุการณ์ถัดไป</div>' + nextCb.slice(0, 2).map(e => {
        const dt = new Date(e._t);
        const days = Math.ceil((e._t - Date.now()) / 86400000);
        return '<div class="sg-cal-row" style="grid-template-columns:1fr auto;"><span class="sg-cal-title"><span class="sg-badge sg-b-high" style="margin-right:6px;">สูง</span>' + esc(e.title) +
          '<span class="sg-cal-fp">' + esc(dt.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'short', day: 'numeric', month: 'short' })) +
          (e.allDay ? '' : ' ' + esc(dt.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })) + ' น.') + '</span></span>' +
          '<span class="sg-muted" style="font-size:11px;">อีก ' + days + ' วัน</span></div>';
      }).join('');
    } else {
      nx = '<div class="sg-note">ยังไม่มีตารางประชุม Fed/กนง. รอบถัดไปในแอป — อัปเดต SG_CB_EVENTS ประจำปี</div>';
    }
    box.innerHTML = (note ? '<div class="sg-note">' + esc(note) + '</div>' : '') + '<div class="sg-muted" style="padding:6px 0 0;font-size:12px;">ไม่มีเหตุการณ์สำคัญใน 8 วันข้างหน้า</div>' + nx;
    return;
  }
  let lastDay = '';
  const rows = ev.map(e => {
    const dt = new Date(e._t);
    const day = sgBkkISO(dt);
    const head = day !== lastDay ? '<div class="sg-cal-day">' + esc(dt.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'short', day: 'numeric', month: 'short' })) + '</div>' : '';
    lastDay = day;
    const time = e.allDay ? 'ทั้งวัน' : dt.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
    const imp = e.impact === 'High' ? '<span class="sg-badge sg-b-high">สูง</span>' : e.impact === 'Medium' ? '<span class="sg-badge sg-b-mid">กลาง</span>' : '<span class="sg-badge sg-b-div">ปันผล</span>';
    const fp = (e.forecast || e.previous) ? '<span class="sg-cal-fp">' + (e.forecast ? 'คาด ' + esc(e.forecast) : '') + (e.forecast && e.previous ? ' · ' : '') + (e.previous ? 'ก่อนหน้า ' + esc(e.previous) : '') + '</span>' : '';
    return head + '<div class="sg-cal-row"><span class="sg-cal-time">' + esc(time) + '</span><span class="sg-cal-cc">' + esc(e.country || '') + '</span>' + imp +
      '<span class="sg-cal-title">' + esc(e.title) + fp + '</span></div>';
  }).join('');
  box.innerHTML = (note ? '<div class="sg-note">' + esc(note) + '</div>' : '') + rows;
}

// ────────────────────── เฟส 2: indicators (ไม่ใช้ไลบรารีภายนอก) ──────────────────────
function sgEMA(c, n) {
  const out = new Array(c.length).fill(null);
  if (c.length < n) return out;
  let s = 0; for (let i = 0; i < n; i++) s += c[i];
  let e = s / n; out[n - 1] = e;
  const k = 2 / (n + 1);
  for (let i = n; i < c.length; i++) { e = c[i] * k + e * (1 - k); out[i] = e; }
  return out;
}
// RSI แบบ Wilder (เหมือน TradingView)
function sgRSI(c, n) {
  n = n || 14;
  const out = new Array(c.length).fill(null);
  if (c.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n;
  out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}
// รวมแท่งรายวันเป็นรายสัปดาห์/รายเดือน (ใช้ราคาปิดวันสุดท้ายของช่วง) — คืน index ของแท่งวันที่ปิดช่วงนั้นด้วย
function sgResample(t, mode) {
  const idx = []; let lastKey = null;
  for (let i = 0; i < t.length; i++) {
    const d = new Date(t[i] + 7 * 3600000); // เวลาไทย
    let key;
    if (mode === 'M') key = d.getUTCFullYear() * 100 + d.getUTCMonth();
    else { const day = (d.getUTCDay() + 6) % 7; key = Math.floor((d.getTime() - day * 86400000) / (7 * 86400000)); }
    if (key === lastKey) idx[idx.length - 1] = i; else { idx.push(i); lastKey = key; }
  }
  return idx;
}

// สถิติย้อนหลัง: ทุกครั้งที่ "เข้าโซน" (จากนอกโซน → ในโซน, ห่างกันอย่างน้อย 4 สัปดาห์)
// วัดผลตอบแทนอีก 13/26/52 สัปดาห์ (~3/6/12 เดือน) จากราคาปิดสัปดาห์ที่เข้าโซน
function sgZoneStats(wc, cond) {
  const H = [{ k: 13, label: '3 เดือน' }, { k: 26, label: '6 เดือน' }, { k: 52, label: '12 เดือน' }];
  const starts = []; let lastStart = -999;
  for (let i = 1; i < wc.length; i++) {
    if (cond[i] === true && cond[i - 1] !== true && i - lastStart >= 4) { starts.push(i); lastStart = i; }
  }
  return H.map(h => {
    const rets = starts.filter(i => i + h.k < wc.length).map(i => (wc[i + h.k] / wc[i] - 1) * 100);
    const base = []; for (let i = 0; i + h.k < wc.length; i++) base.push((wc[i + h.k] / wc[i] - 1) * 100);
    const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
    return { label: h.label, n: rets.length, avg: avg(rets), win: rets.length ? rets.filter(x => x > 0).length / rets.length * 100 : null, base: avg(base), baseN: base.length };
  });
}

function sgRsiZone(v) { return v == null ? null : v < 30 ? 'oversold' : v > 70 ? 'overbought' : v < 50 ? 'weak' : 'strong'; }
const SG_ZONE_TH = { oversold: 'ขายมากเกินไป (< 30)', weak: 'ค่อนข้างอ่อน (30–50)', strong: 'ค่อนข้างแข็ง (50–70)', overbought: 'ซื้อมากเกินไป (> 70)' };

// คำนวณทุกอย่างของสินทรัพย์หนึ่งตัวจากราคาปิดรายวัน (t = ms, c = ราคา)
function sgAnalyze(t, c) {
  const n = c.length;
  const ema50 = sgEMA(c, 50), ema200 = sgEMA(c, 200);
  const rsiD = sgRSI(c, 14);
  const wIdx = sgResample(t, 'W'), mIdx = sgResample(t, 'M');
  const wc = wIdx.map(i => c[i]), mc = mIdx.map(i => c[i]);
  const rsiW = sgRSI(wc, 14), rsiM = sgRSI(mc, 14);
  const wEma200 = wIdx.map(i => ema200[i]);
  const last = c[n - 1];
  const look = Math.min(126, n); // ~6 เดือนทำการ
  const recent = c.slice(n - look);
  const out = {
    last, lastT: t[n - 1], n,
    chg1d: n >= 2 ? (last / c[n - 2] - 1) * 100 : null,
    rsiD: rsiD[n - 1], rsiW: rsiW[rsiW.length - 1], rsiM: rsiM[rsiM.length - 1],
    rsiWReady: wc.length > 14, rsiMReady: mc.length > 14,
    ema50: ema50[n - 1], ema200: ema200[n - 1],
    support: Math.min(...recent), resistance: Math.max(...recent), srDays: look,
    years: (t[n - 1] - t[0]) / (365.25 * 86400000),
  };
  out.vsEma200 = out.ema200 ? (last / out.ema200 - 1) * 100 : null;
  out.belowEma200 = out.ema200 != null && last < out.ema200;
  out.rsiWLow = out.rsiW != null && out.rsiW < 30;
  out.buySignal = out.rsiWLow || out.belowEma200;
  // สถิติ: (1) โซน RSI รายสัปดาห์เดียวกับตอนนี้ (2) อยู่ฝั่งเดียวกับ EMA200 เหมือนตอนนี้
  const zoneNow = sgRsiZone(out.rsiW);
  out.zoneNow = zoneNow;
  out.statsRsi = zoneNow ? sgZoneStats(wc, rsiW.map(v => v == null ? null : sgRsiZone(v) === zoneNow)) : null;
  out.statsEma = out.ema200 != null ? sgZoneStats(wc, wEma200.map((e, i) => e == null ? null : (wc[i] < e) === out.belowEma200)) : null;
  out.series = { t, c, ema50, ema200 };
  return out;
}

// ──────────────────────── เฟส 2: รายการสินทรัพย์ ────────────────────────
const SG_DEFAULT_WATCH = ['VOO', 'QQQ', 'MSFT', 'NVDA', 'PTT.BK', 'CPALL.BK', 'ADVANC.BK', 'KBANK.BK'];
function sgGetWatch() {
  try { const w = JSON.parse(localStorage.getItem('folio_sgWatch') || 'null'); if (Array.isArray(w)) return w; } catch (e) {}
  return SG_DEFAULT_WATCH.slice();
}
function sgSaveWatch(w) {
  localStorage.setItem('folio_sgWatch', JSON.stringify(w));
  if (window.FB) window.FB.setDoc('signals', 'watchlist', { symbols: w }).catch(() => {});
}
async function sgSyncWatchFromCloud() {
  try {
    // Firebase โหลดไม่ได้/ช้า → ใช้ watchlist ในเครื่องไปก่อน ไม่ให้หน้าค้าง
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000));
    const fb = await Promise.race([whenFB(), timeout]);
    const docs = await Promise.race([fb.getAll('signals'), timeout]);
    const wl = docs.find(d => d.id === 'watchlist');
    if (wl && Array.isArray(wl.symbols)) localStorage.setItem('folio_sgWatch', JSON.stringify(wl.symbols));
  } catch (e) {}
}

function sgNorm(s) { return String(s || '').toUpperCase().replace(/[\s_()]/g, ''); }

// แปลง holding → สินทรัพย์สำหรับดึงข้อมูล
function sgAssetFromHolding(h) {
  const tk = String(h.ticker || '').toUpperCase().trim();
  if (h.type === 'fund') return { key: 'F:' + sgNorm(h.name || tk), kind: 'fund', label: h.name || tk, fundName: (h.name || tk).trim(), held: true, taxType: h.taxType || '', fundRegion: h.fundRegion || '' };
  if (!tk) return null;
  if (/^(XAU|GOLD|GC=F)$/.test(tk)) return { key: 'Y:GC=F', kind: 'gold', label: 'ทองคำ', sym: 'GC=F', held: true };
  if (h.type === 'crypto') { const s = tk.includes('-') ? tk : tk + '-USD'; return { key: 'Y:' + s, kind: 'crypto', label: tk, sym: s, held: true }; }
  if (h.type === 'set') { const s = tk.includes('.') ? tk : tk + '.BK'; return { key: 'Y:' + s, kind: 'set', label: tk.replace(/\.BK$/, ''), sym: s, held: true }; }
  return { key: 'Y:' + tk, kind: 'us', label: tk, sym: tk, held: true };
}
function sgAssetFromWatch(s) {
  const tk = String(s).toUpperCase().trim();
  if (tk.endsWith('-USD')) return { key: 'Y:' + tk, kind: 'crypto', label: tk.replace('-USD', ''), sym: tk, held: false };
  if (tk === 'GC=F') return { key: 'Y:GC=F', kind: 'gold', label: 'ทองคำ', sym: 'GC=F', held: false };
  if (tk.endsWith('.BK')) return { key: 'Y:' + tk, kind: 'set', label: tk.replace(/\.BK$/, ''), sym: tk, held: false };
  return { key: 'Y:' + tk, kind: 'us', label: tk, sym: tk, held: false };
}
function sgAssetList() {
  const seen = {}; const out = [];
  (state.holdings || []).forEach(h => { const a = sgAssetFromHolding(h); if (a && !seen[a.key]) { seen[a.key] = 1; out.push(a); } });
  sgGetWatch().forEach(s => { const a = sgAssetFromWatch(s); if (!seen[a.key]) { seen[a.key] = 1; out.push(a); } });
  return out;
}

// ─── ดึงข้อมูล ───
window._sgData = {};   // key → { status, a (analysis), err, meta }
function sgProjCache() { try { return JSON.parse(localStorage.getItem('folio_sgProj') || '{}'); } catch (e) { return {}; } }

async function sgResolveFund(name) {
  const cache = sgProjCache(); const k = sgNorm(name);
  if (cache[k]) return cache[k];
  // ลองชื่อเต็มก่อน แล้วค่อยตัด suffix ของคลาส (เช่น -A, -SSF, (A))
  const tries = [name.trim(), name.trim().replace(/\s*\([^)]*\)\s*$/, ''), name.trim().replace(/-[A-Z0-9]{1,6}$/i, '')].filter((v, i, a) => v && a.indexOf(v) === i);
  for (const q of tries) {
    const d = await sgFetch('fund_search=' + encodeURIComponent(q));
    if (d.error) { if (/SEC_KEY|Worker/.test(d.error)) return { error: d.error }; continue; }
    const funds = d.funds || [];
    if (!funds.length) continue;
    const exact = funds.find(f => sgNorm(f.abbr) === sgNorm(q)) || funds.find(f => sgNorm(f.abbr) === k) || funds[0];
    const res = { proj_id: exact.proj_id, abbr: exact.abbr, name: exact.name };
    cache[k] = res; localStorage.setItem('folio_sgProj', JSON.stringify(cache));
    return res;
  }
  return { error: 'หา proj_id ของ "' + name + '" ไม่เจอใน SEC' };
}

async function sgLoadAsset(a) {
  window._sgData[a.key] = { status: 'loading' };
  try {
    if (a.kind === 'fund') {
      const pr = await sgResolveFund(a.fundName);
      if (pr.error) throw new Error(pr.error);
      const to = new Date(), from = new Date(Date.now() - 5 * 365.25 * 86400000);
      const d = await sgFetch('nav_hist=' + encodeURIComponent(pr.proj_id) + '&from=' + sgBkkISO(from) + '&to=' + sgBkkISO(to), 40000);
      if (d.error) throw new Error('NAV: ' + d.error + (d.status === 401 || d.status === 403 ? ' (key ยังไม่ได้ subscribe Fund Daily Info API V2)' : ''));
      let rows = (d.rows || []).filter(r => r.d && r.v > 0);
      // กองที่มีหลายคลาส: เลือกคลาสที่ชื่อตรงกับที่ถือ
      const classes = {}; rows.forEach(r => { (classes[r.cls] = classes[r.cls] || []).push(r); });
      const clsNames = Object.keys(classes);
      let clsPicked = clsNames[0] || '', clsWarn = false;
      if (clsNames.length > 1) {
        const want = sgNorm(a.fundName), raw = a.fundName.toUpperCase().trim();
        const m = clsNames.find(c => sgNorm(c) === want) || clsNames.find(c => {
          const suf = String(c).toUpperCase().trim().split(/[-\s]/).pop();
          return suf && (raw.endsWith('-' + suf) || raw.endsWith('(' + suf + ')'));
        });
        if (m) clsPicked = m; else { clsPicked = clsNames.sort((x, y) => classes[y].length - classes[x].length)[0]; clsWarn = true; }
        rows = classes[clsPicked];
      }
      rows.sort((x, y) => x.d < y.d ? -1 : 1);
      if (rows.length < 30) throw new Error('NAV ย้อนหลังมีแค่ ' + rows.length + ' วัน — ไม่พอคำนวณ');
      const t = rows.map(r => new Date(r.d + 'T00:00:00+07:00').getTime()), c = rows.map(r => r.v);
      const an = sgAnalyze(t, c);
      // ปันผลกอง (ไม่บังคับ — ถ้าไม่ได้ก็ข้าม)
      let divs = null;
      const dv = await sgFetch('dividend=' + encodeURIComponent(pr.proj_id));
      if (!dv.error && Array.isArray(dv.rows)) divs = dv.rows.filter(r => !clsPicked || !r.cls || sgNorm(r.cls) === sgNorm(clsPicked) || clsNames.length <= 1);
      window._sgData[a.key] = { status: 'ok', a: an, meta: { proj: pr, cls: clsPicked, clsWarn, navDate: rows[rows.length - 1].d, divs, currency: 'THB' } };
    } else {
      const d = await sgFetch('chart=' + encodeURIComponent(a.sym) + '&range=10y', 30000);
      if (d.error || !Array.isArray(d.c)) throw new Error(d.error || 'Worker ยังไม่รองรับ ?chart');
      if (d.c.length < 30) throw new Error('ข้อมูลราคาไม่พอ');
      const t = d.t.map(x => x * 1000);
      const an = sgAnalyze(t, d.c);
      window._sgData[a.key] = { status: 'ok', a: an, meta: { currency: d.currency, divs: d.div || [], tz: d.tz } };
    }
  } catch (e) {
    window._sgData[a.key] = { status: 'error', err: e.message || String(e) };
  }
}

let _sgLoading = false;
async function sgLoadAll(force) {
  if (_sgLoading) return; _sgLoading = true;
  const list = sgAssetList();
  if (force) list.forEach(a => delete window._sgData[a.key]);
  sgRenderList();
  const queue = list.filter(a => !window._sgData[a.key] || window._sgData[a.key].status !== 'ok');
  // ทีละ 3 ตัว กันยิง Worker พร้อมกันเยอะเกิน
  const workers = [0, 1, 2].map(async () => {
    while (queue.length) { const a = queue.shift(); await sgLoadAsset(a); sgRenderList(); }
  });
  await Promise.all(workers);
  _sgLoading = false;
  sgSaveSummary(list);
  sgBuildDivEvents(list);
  if (typeof renderDCA === 'function') renderDCA();
  sgRenderList();
}

// สรุปสั้น ๆ เก็บไว้ใช้กับตาราง DCA และ prompt ของ Gemini โดยไม่ต้องโหลดใหม่
function sgSaveSummary(list) {
  const sum = {};
  list.forEach(a => {
    const s = window._sgData[a.key]; if (!s || s.status !== 'ok') return;
    const x = s.a;
    sum[a.key] = { label: a.label, kind: a.kind, held: a.held, last: x.last, rsiD: x.rsiD, rsiW: x.rsiW, rsiM: x.rsiM, vsEma200: x.vsEma200, buy: x.buySignal, rsiWLow: x.rsiWLow, below: x.belowEma200, asOf: s.meta.navDate || sgBkkISO(new Date(x.lastT)), match: [sgNorm(a.label), sgNorm(a.fundName), sgNorm(a.sym), sgNorm((a.sym || '').replace(/\.BK$|-USD$/, ''))].filter(Boolean) };
  });
  localStorage.setItem('folio_sgSummary', JSON.stringify({ date: todayISO(), sum }));
}
function sgGetSummary() { try { return JSON.parse(localStorage.getItem('folio_sgSummary') || 'null'); } catch (e) { return null; } }
function sgFindSummaryFor(name) {
  const S = sgGetSummary(); if (!S) return null;
  const k = sgNorm(name);
  return Object.values(S.sum).find(s => s.match.includes(k)) || null;
}

function sgBuildDivEvents(list) {
  const ev = [];
  list.forEach(a => {
    const s = window._sgData[a.key]; if (!s || s.status !== 'ok' || a.kind !== 'fund' || !Array.isArray(s.meta.divs)) return;
    s.meta.divs.forEach(r => {
      if (r.bookClose) ev.push({ date: r.bookClose + 'T00:00:00+07:00', allDay: true, country: 'THB', impact: 'Div', title: 'ปิดสมุดทะเบียนปันผล ' + a.label + (r.value ? ' ฿' + r.value + '/หน่วย' : '') });
      if (r.payDate) ev.push({ date: r.payDate + 'T00:00:00+07:00', allDay: true, country: 'THB', impact: 'Div', title: 'จ่ายปันผล ' + a.label + (r.value ? ' ฿' + r.value + '/หน่วย' : '') });
    });
  });
  window._sgDivEvents = ev;
  if (ev.length) sgLoadCalendar();
}

// ─── ตัวช่วย DCA: ป้ายในตาราง DCA เดิม ───
function sgDcaBadge(d) {
  const s = sgFindSummaryFor(d.ticker); if (!s || !s.buy) return '';
  const why = [s.rsiWLow ? 'RSI รายสัปดาห์ ' + s.rsiW.toFixed(0) : '', s.below ? 'ต่ำกว่า EMA200 ' + s.vsEma200.toFixed(1) + '%' : ''].filter(Boolean).join(' · ');
  return '<span title="' + esc(why) + ' — ดูรายละเอียดหน้า 📡 สัญญาณ" onclick="event.stopPropagation();showPage(\'signals\')" style="cursor:pointer;font-size:9px;background:var(--green);color:#fff;border-radius:4px;padding:1px 6px;font-weight:700;">📡 เดือนนี้ซื้อเพิ่ม</span>';
}
function sgDcaPlansFor(a) {
  const keys = [sgNorm(a.label), sgNorm(a.fundName), sgNorm(a.sym), sgNorm((a.sym || '').replace(/\.BK$|-USD$/, ''))].filter(Boolean);
  return (state.dcaSchedules || []).filter(d => keys.includes(sgNorm(d.ticker)));
}

// ─── สรุปสัญญาณสำหรับ prompt ของ Gemini (3 กลยุทธ์) ───
function sgPromptLines() {
  const lines = [];
  const S = sgGetSummary();
  if (S && S.sum && Object.keys(S.sum).length) {
    lines.push('=== สัญญาณเทคนิค (คำนวณจากราคาปิด ณ วันที่ระบุ ใช้ประกอบเท่านั้น ไม่ใช่เหตุผลหลัก) ===');
    Object.values(S.sum).filter(s => s.held).forEach(s => {
      lines.push('- ' + s.label + ': RSI 1D/1W/1M = ' + [s.rsiD, s.rsiW, s.rsiM].map(v => v == null ? '-' : v.toFixed(0)).join('/') +
        ', เทียบ EMA200 ' + (s.vsEma200 == null ? '-' : sgPct(s.vsEma200, 1)) + (s.buy ? ' → สัญญาณ "ซื้อเพิ่ม" (RSI-W<30 หรือ ต่ำกว่า EMA200)' : '') + ' (ข้อมูล ' + s.asOf + ')');
    });
    lines.push('กติกา: ใช้สัญญาณนี้ปรับน้ำหนัก DCA เท่านั้น ห้ามแนะนำขาย SSF/RMF เพราะสัญญาณเทคนิค');
  }
  const M = window._sgMacro;
  if (M) {
    const parts = SG_MACRO_ORDER.map(k => {
      const it = M[k]; if (!it || it.price == null) return null;
      const meta = SG_MACRO_META[k];
      const p = meta.yield ? sgYieldFix(it.price) : it.price, pv = meta.yield ? sgYieldFix(it.prev) : it.prev;
      return meta.label + ' ' + sgFmtNum(p, meta.dp) + (pv ? ' (' + (meta.yield ? ((p - pv) >= 0 ? '+' : '') + ((p - pv) * 100).toFixed(0) + 'bp' : sgPct((p / pv - 1) * 100, 1)) + ')' : '');
    }).filter(Boolean);
    if (parts.length) lines.push('Macro วันนี้: ' + parts.join(', '));
  }
  return lines;
}

// ──────────────────────────── เฟส 2: หน้าจอ ────────────────────────────
window._sgOpen = null;
function sgKindLabel(k) { return { fund: 'กองทุน', set: 'หุ้นไทย', us: 'US', crypto: 'Crypto', gold: 'ทอง' }[k] || k; }

function sgRenderList() {
  const box = document.getElementById('sgAssetList'); if (!box) return;
  const list = sgAssetList();
  if (!list.length) { box.innerHTML = '<div class="sg-muted" style="font-size:12px;">ยังไม่มีสินทรัพย์ — เพิ่มหลักทรัพย์ในหน้าภาพรวม หรือเพิ่มใน Watchlist ด้านบน</div>'; return; }
  const sect = (title, arr) => arr.length ? '<div class="sg-sect">' + title + '</div><div class="sg-alist">' + arr.map(sgAssetRow).join('') + '</div>' : '';
  box.innerHTML = sect('ในพอร์ต', list.filter(a => a.held)) + sect('Watchlist (ยังไม่ได้ถือ)', list.filter(a => !a.held));
  if (window._sgOpen) sgRenderDetail(window._sgOpen);
}

function sgAssetRow(a) {
  const s = window._sgData[a.key];
  const rm = !a.held ? '<button class="sg-x" title="เอาออกจาก Watchlist" data-s="' + esc(a.sym) + '" onclick="event.stopPropagation();sgRemoveWatch(this.dataset.s)">✕</button>' : '';
  let body;
  if (!s || s.status === 'loading') body = '<span class="sg-muted">กำลังโหลด…</span>';
  else if (s.status === 'error') body = '<span class="sg-t-bad" style="font-size:11px;">⚠️ ' + esc(s.err) + '</span>';
  else {
    const x = s.a;
    const badge = x.buySignal ? '<span class="sg-badge sg-b-buy">' + (a.held ? 'เดือนนี้ซื้อเพิ่ม' : 'โซนน่าทยอยซื้อ') + '</span>' : (x.rsiW != null && x.rsiW > 70 ? '<span class="sg-badge sg-b-hot">ร้อนแรง</span>' : '');
    body = '<span class="sg-a-price">' + sgFmtNum(x.last, x.last < 10 ? 4 : 2) + '</span>' +
      '<span class="' + (x.chg1d > 0 ? 'sg-t-good' : x.chg1d < 0 ? 'sg-t-bad' : 'sg-muted') + '">' + sgPct(x.chg1d) + '</span>' +
      '<span class="sg-muted">RSI-W ' + (x.rsiW == null ? '—' : x.rsiW.toFixed(0)) + '</span>' +
      '<span class="sg-muted">EMA200 ' + (x.vsEma200 == null ? '—' : sgPct(x.vsEma200, 1)) + '</span>' + badge;
  }
  return '<div class="sg-arow' + (window._sgOpen === a.key ? ' sg-active' : '') + '" data-k="' + esc(a.key) + '" onclick="sgOpen(this.dataset.k)">' +
    '<div class="sg-a-name"><span class="sg-kind sg-k-' + a.kind + '">' + sgKindLabel(a.kind) + '</span>' + esc(a.label) + rm + '</div>' +
    '<div class="sg-a-body">' + body + '</div></div>';
}

function sgOpen(key) {
  window._sgOpen = window._sgOpen === key ? null : key;
  sgRenderList();
  const el = document.getElementById('sgDetail');
  if (window._sgOpen && el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  if (!window._sgOpen && el) el.innerHTML = '';
}

function sgRenderDetail(key) {
  const el = document.getElementById('sgDetail'); if (!el) return;
  const a = sgAssetList().find(x => x.key === key);
  const s = window._sgData[key];
  if (!a) { el.innerHTML = ''; return; }
  if (!s || s.status === 'loading') { el.innerHTML = '<div class="card sg-detail"><div class="sg-muted">กำลังโหลด ' + esc(a.label) + '…</div></div>'; return; }
  if (s.status === 'error') { el.innerHTML = '<div class="card sg-detail"><div class="card-title">' + esc(a.label) + '</div><div class="sg-note">⚠️ ' + esc(s.err) + '</div><button class="sg-btn" data-k="' + esc(key) + '" onclick="sgRetry(this.dataset.k)">ลองใหม่</button></div>'; return; }
  const x = s.a, m = s.meta;
  const dp = x.last < 10 ? 4 : 2;
  const cur = m.currency === 'THB' ? '฿' : m.currency === 'USD' ? '$' : '';
  const asOf = a.kind === 'fund' ? 'NAV ณ ' + new Date(m.navDate + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
    : 'ราคาปิด ณ ' + new Date(x.lastT).toLocaleDateString('th-TH', { timeZone: m.tz || 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit' });

  // หัว
  let html = '<div class="card sg-detail">' +
    '<div class="sg-d-head"><div><div class="sg-d-title"><span class="sg-kind sg-k-' + a.kind + '">' + sgKindLabel(a.kind) + '</span>' + esc(a.label) + '</div>' +
    '<div class="sg-msub">' + esc(asOf) + (a.kind === 'fund' && m.proj ? ' · ' + esc(m.proj.proj_id) + (m.cls ? ' · คลาส ' + esc(m.cls) : '') : '') + '</div></div>' +
    '<div style="text-align:right;"><div class="sg-d-price">' + cur + sgFmtNum(x.last, dp) + '</div><div class="' + (x.chg1d > 0 ? 'sg-t-good' : x.chg1d < 0 ? 'sg-t-bad' : 'sg-muted') + '" style="font-size:12px;">' + sgPct(x.chg1d) + (a.kind === 'fund' ? ' จาก NAV ก่อนหน้า' : ' วันล่าสุด') + '</div></div></div>';
  if (a.kind === 'fund') {
    html += '<div class="sg-note">NAV ไม่ใช่ราคาสด ประกาศวันละครั้ง' + (/US|GLOBAL|ต่างประเทศ|CHINA|ASIA|INDIA|JAPAN|EUROPE|VIET/i.test(a.fundRegion || '') || /FIF/i.test(a.fundName) ? ' · กองต่างประเทศ (FIF) มักช้า 1–2 วันทำการ' : '') + (m.clsWarn ? ' · ⚠️ จับคู่คลาสไม่ได้แน่ชัด ใช้คลาส ' + esc(m.cls) : '') + '</div>';
  }

  // DCA helper
  const plans = sgDcaPlansFor(a);
  if (x.buySignal) {
    const reasons = [];
    if (x.rsiWLow) reasons.push('RSI รายสัปดาห์ = ' + x.rsiW.toFixed(1) + ' (ต่ำกว่า 30 = ถูกขายหนัก)');
    if (x.belowEma200) reasons.push('ราคาต่ำกว่าเส้นเฉลี่ย EMA200 อยู่ ' + Math.abs(x.vsEma200).toFixed(1) + '%');
    let planTxt = '';
    if (plans.length) planTxt = plans.map(d => '<div>• แผน ' + esc(d.ticker) + ' ปกติ ฿' + Number(d.amount).toLocaleString() + ' → พิจารณา ฿' + Math.round(d.amount * 1.25).toLocaleString() + '–฿' + Math.round(d.amount * 1.5).toLocaleString() + ' (+25–50%) ครั้งถัดไป ' + esc(dcaDisplayDate(d.nextISO)) + '</div>').join('');
    else planTxt = a.held ? '<div class="sg-muted">ยังไม่มีแผน DCA ของตัวนี้ในตาราง DCA</div>' : '<div class="sg-muted">ยังไม่ได้ถือ — ถ้าสนใจ เริ่มทยอยซื้อด้วยเงินก้อนเล็กแบบ DCA ดีกว่าซื้อครั้งเดียว</div>';
    html += '<div class="sg-dca sg-dca-on"><div class="sg-dca-h">📡 ' + (a.held ? 'เดือนนี้ซื้อเพิ่ม' : 'อยู่ในโซนน่าทยอยซื้อ') + '</div>' + reasons.map(r => '<div>' + esc(r) + '</div>').join('') + planTxt +
      '<div class="sg-muted" style="margin-top:4px;">เป็นกติกาง่าย ๆ ไม่ใช่การรับประกัน — ราคาที่ต่ำกว่า EMA200 อาจลงต่อได้อีกนาน ดูสถิติด้านล่างประกอบ</div></div>';
  } else {
    html += '<div class="sg-dca"><div class="sg-dca-h">DCA ตามปกติ</div><div class="sg-muted">ยังไม่เข้าเงื่อนไข "ซื้อเพิ่ม" (RSI รายสัปดาห์ < 30 หรือราคาต่ำกว่า EMA200)' + (plans.length ? ' · แผน: ' + plans.map(d => esc(d.ticker) + ' ฿' + Number(d.amount).toLocaleString()).join(', ') : '') + '</div></div>';
  }
  html += sgHowto('ตัวช่วยนี้<b>ไม่ได้ให้หยุด DCA</b> — แค่บอกว่าช่วงไหน "ถูกกว่าปกติ" จนน่าใส่เพิ่ม · เงื่อนไข: RSI รายสัปดาห์ต่ำกว่า 30 <u>หรือ</u> ราคาต่ำกว่าเส้นเฉลี่ย 200 วัน (EMA200) · ตัวเลข +25–50% เป็นแค่ข้อเสนอ ให้ดูเงินสำรองตัวเองก่อน');

  // RSI
  const rsiCell = (lbl, v, ready) => {
    const z = sgRsiZone(v);
    const pos = v == null ? 0 : Math.max(0, Math.min(100, v));
    return '<div class="sg-rsi"><div class="sg-rsi-top"><span>' + lbl + '</span><b class="sg-z-' + (z || 'na') + '">' + (v == null ? '—' : v.toFixed(1)) + '</b></div>' +
      '<div class="sg-rsi-bar"><i style="left:' + pos + '%"></i></div>' +
      '<div class="sg-msub">' + (v == null ? (ready ? 'ข้อมูลไม่พอ' : 'ข้อมูลย้อนหลังไม่พอ (ต้อง ≥ 15 แท่ง)') : SG_ZONE_TH[z]) + '</div></div>';
  };
  html += '<div class="sg-h3">RSI(14) หลายกรอบเวลา</div><div class="sg-rsi-grid">' + rsiCell('รายวัน (1D)', x.rsiD, true) + rsiCell('รายสัปดาห์ (1W)', x.rsiW, x.rsiWReady) + rsiCell('รายเดือน (1M)', x.rsiM, x.rsiMReady) + '</div>' +
    sgHowto('RSI วัดแรงซื้อ-ขายช่วง 14 แท่งล่าสุด ค่า 0–100 · <b>ต่ำกว่า 30</b> = ถูกขายหนัก (มักเป็นจังหวะสะสม) · <b>สูงกว่า 70</b> = ร้อนแรง (ไม่ควรเร่งซื้อ) · สำหรับ DCA ระยะยาวให้ดู <b>รายสัปดาห์/รายเดือน</b> เป็นหลัก รายวันแกว่งเร็วเกินไป');

  // กราฟ
  html += '<div class="sg-h3">กราฟ 1 ปี + EMA50 / EMA200</div>' + sgChartSVG(x, dp) +
    '<div class="sg-legend"><span><i style="background:var(--accent)"></i>ราคา</span><span><i style="background:var(--blue)"></i>EMA50 ' + sgFmtNum(x.ema50, dp) + '</span><span><i style="background:var(--amber)"></i>EMA200 ' + sgFmtNum(x.ema200, dp) + '</span>' +
    '<span><i class="sg-dash" style="border-color:var(--green)"></i>แนวรับ ' + sgFmtNum(x.support, dp) + '</span><span><i class="sg-dash" style="border-color:var(--red)"></i>แนวต้าน ' + sgFmtNum(x.resistance, dp) + '</span></div>' +
    sgHowto('<b>EMA</b> = เส้นราคาเฉลี่ยที่ให้น้ำหนักวันล่าสุดมากกว่า · ราคาอยู่<b>เหนือ EMA200</b> = แนวโน้มระยะยาวยังเป็นขาขึ้น · ต่ำกว่า = อยู่ในช่วงพักตัว/ขาลง · EMA50 ตัดขึ้นเหนือ EMA200 มักเรียก Golden Cross · <b>แนวรับ/แนวต้าน</b> ในที่นี้คือราคาต่ำสุด/สูงสุดในรอบ ~6 เดือน (' + x.srDays + ' วันทำการ) ใช้ดูกรอบคร่าว ๆ');

  // สถิติย้อนหลัง
  html += '<div class="sg-h3">สถิติย้อนหลัง (ข้อมูล ' + x.years.toFixed(1) + ' ปี)</div>';
  if (x.statsRsi) html += sgStatsTable('เมื่อ RSI รายสัปดาห์เข้าโซน "' + SG_ZONE_TH[x.zoneNow] + '" แบบตอนนี้', x.statsRsi);
  if (x.statsEma) html += sgStatsTable(x.belowEma200 ? 'เมื่อราคาลงไปอยู่ใต้ EMA200 แบบตอนนี้' : 'เมื่อราคาขึ้นไปอยู่เหนือ EMA200 แบบตอนนี้', x.statsEma);
  if (!x.statsRsi && !x.statsEma) html += '<div class="sg-note">ข้อมูลย้อนหลังน้อยเกินไปที่จะทำสถิติ</div>';
  html += sgHowto('นับ "ครั้ง" เฉพาะตอน<b>เพิ่งเข้าโซน</b> (เว้นห่างอย่างน้อย 4 สัปดาห์) แล้ววัดผลตอบแทนราคาอีก 3/6/12 เดือน · <b>n</b> = จำนวนครั้งที่ใช้คำนวณ ถ้า n น้อยกว่า 5 ตัวเลขแทบไม่มีความหมาย · "ทุกช่วงเวลา" = ค่าเฉลี่ยถ้าซื้อสุ่มวันไหนก็ได้ ใช้เทียบว่าโซนนี้ดีกว่าปกติจริงไหม · ผลในอดีตไม่รับประกันอนาคต ' + (a.kind === 'fund' ? '· กองทุนใช้ NAV ย้อนหลังสูงสุด 5 ปี (ไม่รวมปันผลที่จ่ายออก)' : '· ใช้ราคาปิด ไม่รวมปันผล'));

  // ปันผล
  html += sgDivSection(a, m, cur);
  html += '</div>';
  el.innerHTML = html;
}

function sgStatsTable(title, st) {
  const fewest = Math.min(...st.map(r => r.n));
  const rows = st.map(r => '<tr><td>' + r.label + '</td><td class="' + (r.avg > 0 ? 'sg-t-good' : r.avg < 0 ? 'sg-t-bad' : '') + '">' + (r.n ? sgPct(r.avg, 1) : '—') + '</td><td>' + (r.n ? r.win.toFixed(0) + '%' : '—') + '</td><td><b>' + r.n + '</b></td><td class="sg-muted">' + sgPct(r.base, 1) + '</td></tr>').join('');
  const warn = fewest === 0 ? '<div class="sg-note">ไม่เคยเกิดเหตุการณ์นี้ในช่วงข้อมูลที่มี (n = 0) — สรุปจากสถิติไม่ได้</div>'
    : fewest < 5 ? '<div class="sg-note">⚠️ ข้อมูลน้อย (n ต่ำสุด = ' + fewest + ' ครั้ง) — อย่าใช้ตัวเลขนี้ตัดสินใจ</div>' : '';
  const best = st.find(r => r.n > 0);
  const sentence = best ? '<div class="sg-msub" style="margin:4px 0 2px;">ในอดีต ' + esc(title) + ' อีก 3/6/12 เดือนผลตอบแทนเฉลี่ย ' + st.map(r => r.n ? sgPct(r.avg, 1) : '—').join(' / ') + ' (n = ' + st.map(r => r.n).join(' / ') + ' ครั้ง)</div>' : '';
  return '<div class="sg-stat">' + (sentence || '<div class="sg-stat-h">' + esc(title) + '</div>') +
    '<div style="overflow-x:auto;"><table class="sg-tbl"><thead><tr><th>ถือต่อ</th><th>เฉลี่ย</th><th>บวก</th><th>n</th><th>ทุกช่วงเวลา</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + warn + '</div>';
}

function sgDivSection(a, m, cur) {
  if (a.kind === 'crypto' || a.kind === 'gold') return '';
  const today = todayISO();
  if (a.kind === 'fund') {
    if (!Array.isArray(m.divs)) return '<div class="sg-h3">ปันผล</div><div class="sg-note">ดึงประวัติปันผลไม่ได้ (key อาจยังไม่ได้ subscribe Fund Daily Info API V2)</div>';
    if (!m.divs.length) return '<div class="sg-h3">ปันผล</div><div class="sg-muted" style="font-size:12px;">ไม่มีการจ่ายปันผลใน 3 ปีที่ผ่านมา (กองสะสมมูลค่า)</div>';
    const rows = m.divs.slice().sort((x, y) => (y.bookClose || '') < (x.bookClose || '') ? -1 : 1).slice(0, 8).map(r =>
      '<tr' + ((r.bookClose || '') >= today ? ' class="sg-up"' : '') + '><td>' + esc(r.bookClose || '—') + '</td><td>' + esc(r.payDate || '—') + '</td><td>' + (r.value ? '฿' + r.value : '—') + '</td></tr>').join('');
    return '<div class="sg-h3">ปันผลกองทุน</div><div style="overflow-x:auto;"><table class="sg-tbl"><thead><tr><th>ปิดสมุดทะเบียน</th><th>วันจ่าย</th><th>ต่อหน่วย</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      sgHowto('ต้องถือหน่วยลงทุน<b>ก่อนวันปิดสมุดทะเบียน</b> (วันที่ NAV ขึ้น XD) จึงจะได้ปันผล · ปันผลกองทุนถูกหักภาษี 10% ณ ที่จ่าย · กองที่จ่ายปันผล NAV จะลดลงเท่ากับปันผลในวัน XD (ไม่ใช่ขาดทุน)');
  }
  const divs = (m.divs || []).slice(-8).reverse();
  if (!divs.length) return '<div class="sg-h3">ปันผล</div><div class="sg-muted" style="font-size:12px;">ไม่พบประวัติปันผลใน Yahoo</div>';
  const yr = Date.now() / 1000 - 365 * 86400;
  const ttm = (m.divs || []).filter(d => d.t >= yr).reduce((s, d) => s + d.v, 0);
  const s = window._sgData[a.key];
  const yld = s && s.a && s.a.last ? ttm / s.a.last * 100 : null;
  const rows = divs.map(d => '<tr><td>' + new Date(d.t * 1000).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) + '</td><td>' + cur + sgFmtNum(d.v, 4) + '</td></tr>').join('');
  return '<div class="sg-h3">ปันผลย้อนหลัง (วัน XD)</div><div class="sg-msub">ปันผล 12 เดือนล่าสุด ' + cur + sgFmtNum(ttm, 2) + (yld ? ' · yield ≈ ' + yld.toFixed(2) + '%' : '') + '</div>' +
    '<div style="overflow-x:auto;"><table class="sg-tbl"><thead><tr><th>วัน XD</th><th>ต่อหุ้น</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    sgHowto('วัน XD = วันแรกที่ซื้อแล้ว<b>ไม่ได้</b>ปันผลรอบนั้น · ราคาหุ้นมักลดลงประมาณเท่าปันผลในวัน XD · Yahoo ให้แค่ประวัติ<b>ที่ผ่านมาแล้ว</b> วัน XD รอบถัดไปให้ดูประกาศใน set.or.th' + (a.kind === 'us' ? ' · หุ้น/ETF สหรัฐถูกหักภาษีปันผล 15–30% ตามสถานะผู้ลงทุน' : ''));
}

function sgChartSVG(x, dp) {
  const S = x.series, n = S.c.length, from = Math.max(0, n - 252);
  const c = S.c.slice(from), e50 = S.ema50.slice(from), e200 = S.ema200.slice(from), t = S.t.slice(from);
  const W = 600, H = 220, pl = 4, pr = 52, pt = 8, pb = 18;
  const vals = c.concat(e50.filter(v => v != null), e200.filter(v => v != null), [x.support, x.resistance]);
  const mn = Math.min(...vals), mx = Math.max(...vals), rg = (mx - mn) || 1;
  const X = i => pl + i / (c.length - 1) * (W - pl - pr);
  const Y = v => pt + (1 - (v - mn) / rg) * (H - pt - pb);
  const line = (arr, col, w) => {
    let d = '', pen = false;
    arr.forEach((v, i) => { if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; });
    return d ? '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + w + '" stroke-linejoin="round"/>' : '';
  };
  const hl = (v, col) => '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" stroke="' + col + '" stroke-width="1" stroke-dasharray="4 4"/>' +
    '<text x="' + (W - pr + 4) + '" y="' + (Y(v) + 3).toFixed(1) + '" font-size="10" fill="' + col + '">' + sgFmtNum(v, dp) + '</text>';
  const lab = i => new Date(t[i]).toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
  return '<svg class="sg-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="กราฟราคา 1 ปี">' +
    hl(x.support, 'var(--green)') + hl(x.resistance, 'var(--red)') +
    line(e200, 'var(--amber)', 1.5) + line(e50, 'var(--blue)', 1.3) + line(c, 'var(--accent)', 1.8) +
    '<text x="' + pl + '" y="' + (H - 4) + '" font-size="10" fill="var(--text3)">' + lab(0) + '</text>' +
    '<text x="' + (W - pr) + '" y="' + (H - 4) + '" font-size="10" fill="var(--text3)" text-anchor="end">' + lab(c.length - 1) + '</text>' +
    '</svg>';
}

function sgRetry(key) {
  const a = sgAssetList().find(x => x.key === key); if (!a) return;
  if (a.kind === 'fund') { const c = sgProjCache(); delete c[sgNorm(a.fundName)]; localStorage.setItem('folio_sgProj', JSON.stringify(c)); }
  sgLoadAsset(a).then(() => { sgRenderList(); sgSaveSummary(sgAssetList()); });
  sgRenderList();
}

function sgAddWatch() {
  const inp = document.getElementById('sgWatchInput'); if (!inp) return;
  let v = inp.value.trim().toUpperCase().replace(/\s+/g, '');
  if (!v) return;
  if (!/^[A-Z0-9.^=\-&]{1,20}$/.test(v)) { showToast('รูปแบบ symbol ไม่ถูกต้อง'); return; }
  if (v === 'BTC' || v === 'ETH' || v === 'SOL') v += '-USD';
  if (v === 'GOLD') v = 'GC=F';
  const w = sgGetWatch();
  if (w.includes(v)) { showToast(v + ' อยู่ใน Watchlist แล้ว'); return; }
  w.push(v); sgSaveWatch(w); inp.value = '';
  const a = sgAssetFromWatch(v);
  sgRenderList();
  sgLoadAsset(a).then(() => { sgRenderList(); sgSaveSummary(sgAssetList()); });
}
function sgRemoveWatch(sym) {
  const w = sgGetWatch().filter(s => s !== sym); sgSaveWatch(w);
  if (window._sgOpen === 'Y:' + sym) window._sgOpen = null;
  sgRenderList();
  const el = document.getElementById('sgDetail'); if (el && !window._sgOpen) el.innerHTML = '';
}

// ─── เริ่มทำงาน ───
let _sgSignalsStarted = false;
function sgOnShowSignals() {
  if (_sgSignalsStarted) { sgRenderList(); return; }
  _sgSignalsStarted = true;
  sgSyncWatchFromCloud().then(() => sgLoadAll(false));
}
(async function sgInit() {
  sgLoadMacro();
  sgLoadCalendar();
  // รอ holdings จาก Firestore แล้วคำนวณสัญญาณเบื้องหลัง (ป้าย DCA + prompt Gemini ใช้ได้เลยโดยไม่ต้องเปิดหน้า)
  const t0 = Date.now();
  while (!window._holdingsLoaded && Date.now() - t0 < 8000) await new Promise(r => setTimeout(r, 300));
  const S = sgGetSummary();
  if (!S || S.date !== todayISO()) sgOnShowSignals();
})();
