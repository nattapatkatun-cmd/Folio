// Folio — ผู้ช่วย AI หน้าแรก (แชตเดียว: พอร์ต / บัตร / บิล)
// โหลดท้ายสุด
// แยกมาจาก index.html (เฟส 8) — เนื้อหาเดิมทุกบรรทัด ลำดับการโหลดต้องคงตาม <script src> ใน index.html

// ═══════════════════════════════════════════════════════════════════════
// ผู้ช่วย AI — ศูนย์รวมถาม-ตอบ (3 คำถามสำเร็จรูป + พิมพ์ถามเอง + ถามต่อ)
// AI เห็นข้อมูลพอร์ตจริงทั้งหมดผ่าน systemInstruction และค้น Google ได้เมื่อจำเป็น
// ═══════════════════════════════════════════════════════════════════════
const AIH_KEY = 'folio_aiHubThread';
const AIH_MAX_STORE = 30;   // ข้อความที่เก็บในเครื่อง
const AIH_MAX_SEND = 10;    // ข้อความล่าสุดที่ส่งให้ AI เป็นบริบทการคุย
let aihThread = [];
let aihBusy = false;

function aihLoad() {
  try { const t = JSON.parse(localStorage.getItem(AIH_KEY) || '[]'); if (Array.isArray(t)) aihThread = t; } catch (e) { aihThread = []; }
}
function aihSave() {
  try { localStorage.setItem(AIH_KEY, JSON.stringify(aihThread.slice(-AIH_MAX_STORE))); } catch (e) {}
}
function aihFmt(n) { return '฿' + Math.round(Number(n) || 0).toLocaleString(); }

// ─── ข้อมูลพอร์ตทั้งหมดที่ AI ใช้ตอบ ───
function aihContext(scope) {
  const L = [];
  const now = new Date();
  L.push('วันนี้: ' + now.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' (' + todayISO() + ')');
  const risk = (typeof _p17bRiskLevel !== 'undefined') ? _p17bRiskLevel : 'base';
  L.push('ระดับความเสี่ยงที่ผู้ใช้เลือก: ' + (risk === 'low' ? 'ระมัดระวัง' : risk === 'high' ? 'รับความเสี่ยงสูง' : 'สมดุล'));
  L.push('สไตล์การลงทุน: DCA ระยะยาว (ซื้อสม่ำเสมอทุกเดือน) ไม่ได้เทรดระยะสั้น');
  const total = portfolioValueThb(), cost = portfolioCostThb();
  if (total > 0) L.push('มูลค่าพอร์ตรวม ' + aihFmt(total) + ' · ต้นทุน ' + aihFmt(cost) + ' · กำไร/ขาดทุน ' + (cost > 0 ? ((total / cost - 1) * 100).toFixed(1) + '%' : '-'));
  if (window._p9Data) L.push('ผลตอบแทนปีนี้ ' + window._p9Data.currentYoy.toFixed(1) + '% (เป้า ' + yoyTargetPct().toFixed(0) + '% ต่อปี)');

  const locked = new Set(taxLockedAssetNames().map(s => String(s).toUpperCase()));
  if (state.holdings && state.holdings.length) {
    L.push('', 'หลักทรัพย์ที่ถืออยู่:');
    state.holdings.forEach(h => {
      const v = valueThb(h), c = costThb(h);
      const nm = h.name || h.ticker;
      const typeTh = { set: 'หุ้นไทย', us: 'หุ้น US', crypto: 'Crypto', tech: 'หุ้น Tech', fund: 'กองทุน' }[h.type] || h.type;
      L.push('- ' + nm + ' [' + typeTh + (h.fundRegion ? ' · ' + h.fundRegion : '') + (h.taxType ? ' · ' + h.taxType : '') + ']' +
        ' มูลค่า ' + aihFmt(v) + ' (' + (total > 0 ? (v / total * 100).toFixed(1) : '0') + '% ของพอร์ต)' +
        (c > 0 ? ' กำไร/ขาดทุน ' + ((v / c - 1) * 100).toFixed(1) + '%' : '') +
        (h._navDate ? ' NAV ณ ' + h._navDate : '') +
        (locked.has(String(nm).toUpperCase()) ? ' 🔒LOCKED' : ''));
    });
  } else L.push('', 'ยังไม่มีข้อมูลหลักทรัพย์ในแอป');

  if (window._p10Data && window._p10Data.activeTypes) {
    const { actual, targets, activeTypes } = window._p10Data;
    L.push('', 'สัดส่วนจริงเทียบเป้าหมาย (ราย asset class):');
    activeTypes.forEach(t => {
      const a = actual[t] || 0, g = targets[t] || 0;
      L.push('- ' + (P10_LABELS[t] || t) + ': จริง ' + a.toFixed(1) + '% เป้า ' + g + '% (' + (a - g >= 0 ? 'เกิน ' : 'ขาด ') + Math.abs(a - g).toFixed(1) + '%)');
    });
  }
  if (window._p17SheetData && window._p17SheetData.holdings) {
    L.push('', 'ข้อมูลจาก Google Sheet ของผู้ใช้ (Drift = ห่างจากเป้ากี่ %, + คือเกินเป้า · BuyScore 0–10 ยิ่งสูงยิ่งควรซื้อ · SuggestBuy = ยอดซื้อที่ Sheet แนะนำต่อเดือน):');
    window._p17SheetData.holdings.forEach(sh => {
      L.push('- ' + sh['Asset'] + ': Drift ' + ((Number(sh['Drift %']) || 0) * 100).toFixed(1) + '%, เป้า ' + ((Number(sh['Target Allocation %']) || 0) * 100).toFixed(0) + '%, BuyScore ' + Number(sh['Buy Priority Score'] || 0).toFixed(1));
    });
    (window._p17SheetData.executionPlan || []).filter(r => Number(r['Suggested Monthly Buy (THB)']) > 0).forEach(r => {
      L.push('  SuggestBuy ' + r['Asset'] + ' ' + aihFmt(r['Suggested Monthly Buy (THB)']));
    });
  }
  if (state.dcaSchedules && state.dcaSchedules.length) {
    L.push('', 'แผน DCA (รวม ≈ ' + aihFmt(dcaMonthly()) + '/เดือน):');
    state.dcaSchedules.forEach(d => L.push('- ' + d.ticker + ' ' + aihFmt(d.amount) + ' ' + (d.freq || '') + (d.nextISO ? ' ครั้งถัดไป ' + d.nextISO : '')));
  }
  if (locked.size) L.push('', '🔒 LOCKED (SSF/RMF ขายแล้วเสียสิทธิภาษี): ' + [...locked].join(', '));
  if (typeof sgPromptLines === 'function') { const s = sgPromptLines(); if (s.length) { L.push(''); s.forEach(x => L.push(x)); } }
  if (typeof billCashflowContext === 'function') { const b = billCashflowContext(); if (b) { L.push('', 'รายรับ-รายจ่ายจริงจากสลิป/บิล:', b); } }
  // เฟส 5: แชตเดียว — ถามจากแท็บบัตร ส่งข้อมูลบัตร/เพดาน/รอบบิลที่แอปคำนวณไว้ไปด้วย
  if (scope === 'cards' && typeof rwcContext === 'function') L.push('', '===== ข้อมูลบัตรเครดิต/สิทธิ์ที่แอปคำนวณไว้ =====', rwcContext());
  return L.join('\n');
}

const AIH_RULES = [
  'คุณคือผู้ช่วยการเงินส่วนตัวในแอป Folio คุยกับเจ้าของพอร์ตคนเดียว ตอบเป็นภาษาไทยที่อ่านง่าย เหมือนอธิบายให้เพื่อนฟัง',
  'กติกาการตอบ:',
  '1. บรรทัดแรกเป็น "สรุป:" ตอบคำถามตรง ๆ ใน 1–2 ประโยค แล้วค่อยให้รายละเอียด',
  '2. รายละเอียดใช้หัวข้อ ## ได้ไม่เกิน 3 หัวข้อ ใช้ bullet สั้น ๆ ประโยคละ 1 ความคิด ใช้ตาราง markdown เมื่อมีตัวเลขหลายรายการ',
  '3. ใช้ภาษาไทย หลีกเลี่ยงศัพท์อังกฤษ ถ้าจำเป็นต้องใช้ศัพท์เทคนิค (เช่น RSI, EMA200, Drift) ให้อธิบายสั้น ๆ ในวงเล็บครั้งแรก',
  '4. ตัวเลขต้องมาจากข้อมูลพอร์ตด้านล่างหรือจากการค้น Google เท่านั้น ห้ามแต่งตัวเลข ถ้าข้อมูลไม่พอให้บอกตรง ๆ ว่าขาดอะไร',
  '5. ห้ามแนะนำขาย/ลดกองที่ติด 🔒LOCKED (SSF/RMF) เด็ดขาด',
  '6. ห้ามแนะนำขายเพราะข่าวหรือราคาแกว่งระยะสั้น — การลดสัดส่วนทำได้เฉพาะตอนปรับพอร์ตให้กลับเข้าเป้าหมาย',
  '7. ถ้าอ้างข่าว ให้บอกว่าข่าวเมื่อไหร่ และใช้เฉพาะข่าวที่ค้นเจอจริง',
  '8. สัญญาณเทคนิค (RSI/EMA) ใช้แค่ปรับจังหวะ DCA ไม่ใช่เหตุผลหลัก',
  '9. ไม่ต้องเขียนคำเตือนยาว ๆ ว่าไม่ใช่คำแนะนำการลงทุน (แอปแสดงไว้แล้ว)',
  '10. ถ้าคำถามกำกวม ตอบตามการตีความที่สมเหตุสมผลที่สุด แล้วถามกลับ 1 คำถามท้ายคำตอบ',
].join('\n');

// ─── คำถามสำเร็จรูป ───
function aihPreset(kind) {
  if (aihBusy) return;
  if (kind === 'buy') {
    const el = document.getElementById('aihBudget');
    const budget = Math.round(Number(el && el.value) || 0);
    if (!budget || budget < 500) { showToast('ใส่งบเดือนนี้ก่อน (ขั้นต่ำ ฿500)'); if (el) el.focus(); return; }
    aihAsk('💰 เดือนนี้มีงบ ' + aihFmt(budget) + ' ควรซื้ออะไรบ้าง', [
      'งาน: จัดสรรงบ ' + aihFmt(budget) + ' สำหรับเดือนนี้',
      '- ทำตาราง | สินทรัพย์ | จำนวนเงิน | เหตุผล (1 ประโยค) | ยอดรวมทุกแถวต้องเท่ากับ ' + budget + ' บาทพอดี ปัดเป็นหลักร้อย',
      '- เน้นตัวที่ต่ำกว่าเป้าหมาย/BuyScore สูง/มีสัญญาณ "ซื้อเพิ่ม" · ไม่ซื้อตัวที่เกินเป้ามาก',
      '- อิงแผน DCA เดิมเป็นฐาน ถ้าไม่เปลี่ยนจากแผนเดิมให้บอกว่า "ตามแผนเดิม"',
      '- เสนอกองใหม่ที่ไม่มีในพอร์ตได้ไม่เกิน 1 กอง และต้องเขียนว่า (กองใหม่) พร้อมเหตุผลจากข่าวที่ค้นเจอ',
      '- ท้ายตารางบอก 1 ประโยคว่าหลังซื้อแล้วสัดส่วนพอร์ตเข้าใกล้เป้าขึ้นอย่างไร',
    ].join('\n'), { budget });
  } else if (kind === 'health') {
    aihAsk('📊 พอร์ตตอนนี้เป็นยังไงบ้าง', [
      'งาน: ตรวจสุขภาพพอร์ต',
      '## ภาพรวม — ผลตอบแทนเทียบเป้า และสัดส่วนเทียบเป้าหมาย',
      '## จุดที่ดี — 2 ข้อ',
      '## จุดที่ต้องระวัง — 2–3 ข้อ (เช่น กระจุกตัวในตัวเดียว/ประเทศเดียว ค่าเงิน สัดส่วนหลุดเป้า เงินสำรอง)',
      'ปิดท้ายด้วย "สิ่งที่ควรทำเดือนนี้" 1–3 ข้อ ที่ทำได้จริง',
    ].join('\n'));
  } else if (kind === 'news') {
    aihAsk('📰 ช่วงนี้มีข่าวอะไรกระทบพอร์ตบ้าง', [
      'งาน: ใช้ Google Search หาข่าว 7 วันล่าสุดที่กระทบสินทรัพย์ในพอร์ตจริง (รวมตลาด/ปัจจัยที่กองเหล่านี้ลงทุน เช่น หุ้นสหรัฐ ทอง ดอกเบี้ย ค่าเงิน)',
      '- ไม่เกิน 5 ข่าว เรียงจากกระทบมากไปน้อย',
      '- แต่ละข่าว: **หัวข่าวสั้น** (วันที่) → กระทบตัวไหน · ดีหรือไม่ดี · ควรทำอะไร',
      '- ส่วนใหญ่คำตอบที่ถูกคือ "DCA ต่อตามแผน ไม่ต้องทำอะไร" — บอกตรง ๆ ได้ ห้ามแนะนำขายจากข่าว',
    ].join('\n'));
  }
}

// ปุ่มลัดจากหน้าอื่น (บัตร/บิล): ไปแชตหน้าแรกแล้วถามคำถามตั้งต้นทันที — scope กำหนดบริบทที่ส่งให้ AI
function aihOpenWith(question, scope, extra) {
  if (aihBusy) { showToast('AI กำลังตอบอยู่ รอสักครู่'); return; }
  showPage('overview');
  const card = document.getElementById('aihCard');
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return aihAsk(question, extra || '', { scope: scope || '' });
}
function aihSendTyped() {
  const ta = document.getElementById('aihInput');
  const q = (ta && ta.value || '').trim();
  if (!q || aihBusy) return;
  ta.value = '';
  aihAutoGrow(ta);
  aihAsk(q, '');
}
function aihAutoGrow(ta) { if (!ta) return; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; }

async function aihAsk(display, extra, meta) {
  if (aihBusy) return;
  aihBusy = true;
  const scope = (meta && meta.scope) || '';
  aihThread.push({ role: 'user', text: display, send: extra ? display + '\n\n' + extra : display, scope, t: Date.now() });
  aihSave();
  aihRender(true);
  const history = aihThread.slice(-AIH_MAX_SEND).filter(m => m.role === 'user' || (m.role === 'model' && !m.error));
  // ข้อความแรกที่ส่งต้องเป็นของผู้ใช้
  while (history.length && history[0].role !== 'user') history.shift();
  const contents = history.map(m => ({ role: m.role, parts: [{ text: m.role === 'user' ? (m.send || m.text) : m.text }] }));
  try {
    const d = await callGemini({
      systemInstruction: { parts: [{ text: AIH_RULES + (scope === 'cards' ? '\n\nกติกาเพิ่มเติมเมื่อถามเรื่องบัตรเครดิต (บรรทัด "สรุป:" ให้ขึ้นต้นด้วย "แนะนำ: <ชื่อบัตร>"):\n' + RWC_RULES : '') + '\n\n===== ข้อมูลพอร์ตของผู้ใช้ (อัปเดตล่าสุด) =====\n' + aihContext(scope) }] },
      contents,
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 3000, temperature: 0.4 },
    });
    const text = geminiText(d).trim();
    const gm = d.candidates && d.candidates[0] && d.candidates[0].groundingMetadata;
    const sources = ((gm && gm.groundingChunks) || []).map(c => c.web).filter(Boolean).slice(0, 5).map(w => ({ uri: w.uri, title: w.title || w.uri }));
    const msg = { role: 'model', text, sources, t: Date.now() };
    if (meta && meta.budget) msg.check = aihCheckBudget(text, meta.budget);
    aihThread.push(msg);
  } catch (e) {
    const m = e.message === 'no_key' ? 'ยังไม่ได้ใส่ Gemini Key — ไปที่ ⚙️ ตั้งค่า' : e.message === 'all_quota' ? 'Gemini ทุก key หมดโควตาวันนี้ ลองใหม่พรุ่งนี้หรือเพิ่ม key ในตั้งค่า' : e.message;
    aihThread.push({ role: 'model', text: m, error: true, t: Date.now() });
  }
  aihBusy = false;
  aihSave();
  aihRender(true);
}

// ตรวจว่ายอดรวมในตารางตรงกับงบ — AI คิดเลขพลาดได้ บอกผู้ใช้ตรง ๆ
function aihCheckBudget(text, budget) {
  let sum = 0, rows = 0;
  String(text).split('\n').forEach(line => {
    if (!/^\s*\|.*\|\s*$/.test(line) || /^\s*\|?[\s:|-]+\|?\s*$/.test(line)) return;
    const cells = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
    if (/รวม|total/i.test(cells[0])) return;
    for (let i = 1; i < cells.length; i++) {
      const m = cells[i].replace(/,/g, '').match(/^฿?\s*(\d+(?:\.\d+)?)\s*(บาท)?$/);
      if (m) { sum += Number(m[1]); rows++; break; }
    }
  });
  if (!rows) return null;
  return Math.abs(sum - budget) <= 1 ? { ok: true, sum } : { ok: false, sum };
}

function aihRetry() {
  if (aihBusy) return;
  // เอาคำถามล่าสุดที่ error ออกแล้วถามใหม่
  const last = aihThread[aihThread.length - 1];
  if (!last || !last.error) return;
  aihThread.pop();
  const q = aihThread.pop();
  if (!q || q.role !== 'user') { aihRender(); return; }
  const extra = q.send && q.send !== q.text ? q.send.slice(q.text.length + 2) : '';
  const bm = q.text.match(/งบ ฿([\d,]+)/);
  aihAsk(q.text, extra, Object.assign({ scope: q.scope || '' }, bm ? { budget: Number(bm[1].replace(/,/g, '')) } : {}));
}
function aihClear() {
  if (aihBusy) return;
  if (aihThread.length && !confirm('ล้างบทสนทนาทั้งหมด?')) return;
  aihThread = []; aihSave(); aihRender();
}

function aihRender(scroll) {
  const box = document.getElementById('aihThread'); if (!box) return;
  const empty = document.getElementById('aihEmpty');
  if (empty) empty.style.display = aihThread.length || aihBusy ? 'none' : '';
  const clr = document.getElementById('aihClearBtn'); if (clr) clr.style.display = aihThread.length ? '' : 'none';
  let html = aihThread.map((m, i) => {
    const time = new Date(m.t).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    if (m.role === 'user') return '<div class="aih-msg aih-user"><div class="aih-bubble">' + esc(m.text) + '</div></div>';
    if (m.error) {
      const isLast = i === aihThread.length - 1;
      return '<div class="aih-msg aih-ai"><div class="aih-bubble aih-err">⚠️ ' + esc(m.text) + (isLast ? '<div><button class="sg-btn" style="margin-top:6px;" onclick="aihRetry()">ลองใหม่</button></div>' : '') + '</div></div>';
    }
    let foot = '';
    if (m.check && !m.check.ok) foot += '<div class="sg-note">⚠️ ยอดรวมในตาราง ' + aihFmt(m.check.sum) + ' ไม่ตรงกับงบ — ตรวจตัวเลขก่อนซื้อ หรือพิมพ์ "ช่วยปรับยอดให้ตรงงบ"</div>';
    if (m.sources && m.sources.length) foot += '<div class="aih-src">แหล่งข่าว: ' + m.sources.map(s => '<a href="' + esc(s.uri) + '" target="_blank" rel="noopener">' + esc(s.title) + '</a>').join(' · ') + '</div>';
    foot += '<div class="aih-time">' + esc(time) + ' · ความเห็นประกอบ ไม่ใช่คำแนะนำการลงทุน</div>';
    return '<div class="aih-msg aih-ai"><div class="aih-bubble">' + mdLiteToHtml(m.text) + foot + '</div></div>';
  }).join('');
  if (aihBusy) html += '<div class="aih-msg aih-ai"><div class="aih-bubble aih-typing"><span></span><span></span><span></span> กำลังคิด… (ถ้าต้องค้นข่าวอาจใช้ 20–40 วินาที)</div></div>';
  box.innerHTML = html;
  document.querySelectorAll('.aih-chip, #aihSend').forEach(b => { b.disabled = aihBusy; });
  if (scroll) {
    const msgs = box.querySelectorAll('.aih-msg');
    const target = aihBusy ? msgs[msgs.length - 1] : msgs[msgs.length - 1];
    // เลื่อนไปที่ต้นคำตอบล่าสุด ไม่ใช่ท้ายสุด จะได้อ่านจาก "สรุป" ก่อน
    if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 30);
  }
}

(function aihInit() {
  aihLoad();
  const b = document.getElementById('aihBudget');
  const fill = () => { if (b && !b.value) { const m = Math.round(dcaMonthly() / 100) * 100; if (m > 0) b.value = m; } };
  fill(); setTimeout(fill, 4000);
  aihRender(false);
})();
