// Folio — ตั้งค่า API key, AI Fund Advisor, ซิงก์ Sheet, YoY, Benchmark, ตรวจเวอร์ชัน
// โหลดหลัง Chart.js (CDN)
// แยกมาจาก index.html (เฟส 8) — เนื้อหาเดิมทุกบรรทัด ลำดับการโหลดต้องคงตาม <script src> ใน index.html

// --- Settings & Multi-Key System ---
// Support 4 keys per service with automatic fallback
const SERVICES = {
  AV:        { label: 'Alpha Vantage', slots: 4 },
  GEMINI:    { label: 'Gemini AI', slots: 4 },
};

// Track which key index is currently active per service
const activeKeyIndex = { AV: 0, GEMINI: 0 };

// --- Safe JSON parser ---
function safeParseJSON(text) {
  if (!text) return null;
  let t = text.replace(/[\`]{3}json\s*/gi, '').replace(/[\`]{3}\s*/g, '').trim();
  try { return JSON.parse(t); } catch(_) {}
  const mo = t.match(/\{[\s\S]*\}/);
  if (mo) try { return JSON.parse(mo[0]); } catch(_) {}
  const ma = t.match(/\[[\s\S]*\]/);
  if (ma) try { return JSON.parse(ma[0]); } catch(_) {}
  return null;
}

// เมื่อ Gemini ตอบ JSON ไม่ครบ (โดนตัดกลาง เช่น MAX_TOKENS) แต่ array ของ object ที่ต้องการ
// ถูกตัดกลางคัน — ไล่นับวงเล็บเก็บเฉพาะ object ที่ปิดสมบูรณ์ก่อนโดนตัด แทนที่จะทิ้งทั้งหมด
function salvageJsonArrayByKey(text, key) {
  if (!text) return [];
  try {
    var kIdx = text.indexOf('"' + key + '"');
    if (kIdx === -1) return [];
    var arrStart = text.indexOf('[', kIdx);
    if (arrStart === -1) return [];
    var objs = [];
    var depth = 0, objStart = -1;
    for (var ci = arrStart + 1; ci < text.length; ci++) {
      var ch = text[ci];
      if (ch === '{') { if (depth === 0) objStart = ci; depth++; }
      else if (ch === '}') { depth--; if (depth === 0 && objStart !== -1) { objs.push(text.slice(objStart, ci + 1)); objStart = -1; } }
      else if (ch === ']' && depth === 0) break;
    }
    var recovered = [];
    objs.forEach(function(o) { try { recovered.push(JSON.parse(o)); } catch(_) {} });
    return recovered;
  } catch(_) { return []; }
}

// --- Source badge: บอกที่มาของแต่ละคำแนะนำ (Sheet data vs ข่าว/ตลาด) ---
function srcBadge(source) {
  if (source === 'news') return '<span style="font-size:9px;background:var(--blue-bg);color:var(--blue);border-radius:4px;padding:1px 5px;font-weight:600;white-space:nowrap;">📰 ข่าว/ตลาด</span>';
  return '<span style="font-size:9px;background:var(--amber-bg);color:var(--amber);border-radius:4px;padding:1px 5px;font-weight:600;white-space:nowrap;">📊 Sheet</span>';
}

// --- Footer แหล่งข้อมูล ต่อท้ายผล AI ทุกกล่อง ---
function aiSourceFooter(usedNews) {
  var syncPart = window._p17SyncTime
    ? 'Google Sheet (sync ล่าสุด ' + window._p17SyncTime + ' น.)'
    : 'Google Sheet (ยังไม่ได้ sync — ใช้ข้อมูลใน Folio แทน)';
  var newsPart = usedNews ? ' + ข่าวสดผ่าน Google Search' : '';
  return '<div style="font-size:10px;color:var(--text3);border-top:0.5px dashed var(--border);margin-top:10px;padding-top:8px;line-height:1.6;">' +
    'แหล่งข้อมูล: ' + syncPart + newsPart + ' · AI เป็นความเห็นประกอบ ไม่ใช่คำแนะนำการลงทุน</div>';
}

// --- Lite markdown -> HTML: กัน Gemini ตอบ markdown แล้วขึ้นจอเป็น text ขีด ๆ ---
function mdLiteToHtml(text) {
  if (!text) return '';
  var lines = String(text).split('\n');
  var html = '';
  var tableRows = [];
  function flushTable() {
    if (!tableRows.length) return;
    var rows = tableRows.filter(function(r){ return !/^\s*\|?[\s:|-]+\|?\s*$/.test(r); }); // ตัดแถวคั่น |---|---|
    if (rows.length) {
      html += '<div style="overflow-x:auto;margin:8px 0;"><table style="border-collapse:collapse;font-size:11.5px;min-width:280px;">';
      rows.forEach(function(r, ri) {
        var cells = r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|');
        var tag = ri === 0 ? 'th' : 'td';
        html += '<tr>' + cells.map(function(c) {
          return '<' + tag + ' style="border:0.5px solid var(--border);padding:4px 8px;text-align:left;' + (ri === 0 ? 'background:var(--bg);font-weight:600;color:var(--text2);' : '') + '">' + inline(c.trim()) + '</' + tag + '>';
        }).join('') + '</tr>';
      });
      html += '</table></div>';
    }
    tableRows = [];
  }
  function inline(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }
  lines.forEach(function(line) {
    if (/^\s*\|.*\|\s*$/.test(line)) { tableRows.push(line); return; }
    flushTable();
    var t = line.trim();
    if (!t) { html += '<div style="height:6px;"></div>'; return; }
    var hm = t.match(/^#{1,4}\s+(.*)$/);
    if (hm) { html += '<div style="font-size:11px;font-weight:600;color:var(--accent);margin:12px 0 4px;">' + inline(hm[1]) + '</div>'; return; }
    var bm = t.match(/^[-•*]\s+(.*)$/);
    if (bm) { html += '<div style="padding-left:14px;position:relative;"><span style="position:absolute;left:2px;">•</span>' + inline(bm[1]) + '</div>'; return; }
    html += '<div>' + inline(t) + '</div>';
  });
  flushTable();
  return html;
}

// --- Gemini helper: auto-rotate keys on quota exhaustion ---
// Gemini helper: v1beta + x-goog-api-key header (works for all key formats)
// กันปัญหา "AI สรุปไม่ครบ / error กลางคัน" ไว้ที่จุดเดียว ทุกฟีเจอร์ได้ผลเหมือนกัน:
//  1) Gemini 2.5 Flash นับ token ที่ใช้ "คิด" รวมใน maxOutputTokens → คำตอบโดนตัด/ว่าง
//     ถ้าผู้เรียกไม่ได้กำหนด thinkingConfig: จำกัดงบคิด แล้วบวกเพิ่มให้ maxOutputTokens เท่ากัน
//  2) คำตอบที่ใช้ google_search มักมาหลายท่อน (parts) → รวมทุกท่อนเป็นท่อนเดียว
//     (โค้ดเดิมหลายจุดอ่านแค่ parts[0] จึงได้ข้อความครึ่งเดียว)
//  3) ตั้งเวลารอ 90 วิ — ไม่ให้ปุ่มหมุนค้าง
//  4) เน็ตหลุด / 500 / 502 / 504 → ลองใหม่อัตโนมัติ
//  5) ถูกตัดเพราะ MAX_TOKENS หรือได้คำตอบว่าง → ลองใหม่ 1 ครั้งด้วยเพดานที่สูงขึ้น
const GEMINI_THINK_BUDGET = 1024;
const GEMINI_TIMEOUT_MS = 90000;

function geminiPrepBody(body) {
  const b = JSON.parse(JSON.stringify(body || {}));
  const gc = b.generationConfig = b.generationConfig || {};
  if (!gc.thinkingConfig) {
    gc.thinkingConfig = { thinkingBudget: GEMINI_THINK_BUDGET };
    if (gc.maxOutputTokens) gc.maxOutputTokens += GEMINI_THINK_BUDGET;
  }
  return b;
}
// รวมข้อความทุกท่อนของคำตอบ (ข้ามท่อน "ความคิด" ถ้ามี)
function geminiText(d) {
  const parts = (d && d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
  return parts.filter(p => p && typeof p.text === 'string' && !p.thought).map(p => p.text).join('');
}
function geminiNormalize(d) {
  const c = d && d.candidates && d.candidates[0];
  if (c && c.content && Array.isArray(c.content.parts) && c.content.parts.length > 1) {
    const text = geminiText(d);
    c.content.parts = [{ text }];
  }
  return d;
}

async function callGemini(body) {
  const keys = getKeys('GEMINI');
  if (!keys.length) throw new Error('no_key');
  let req = geminiPrepBody(body);
  let netRetries = 0, truncRetried = false;
  for (let attempt = 0; attempt < keys.length * 2 + 3; attempt++) {
    const key = getActiveKey('GEMINI');
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
    const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': key };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), GEMINI_TIMEOUT_MS);
    let res, d;
    try {
      res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(req), signal: ctl.signal });
      const raw = await res.text();
      try { d = JSON.parse(raw); } catch (pe) { d = { error: { status: 'BAD_RESPONSE', message: 'HTTP ' + res.status } }; }
    } catch (e) {
      clearTimeout(timer);
      // เน็ตหลุด / หมดเวลา → ลองใหม่สูงสุด 2 ครั้ง
      if (netRetries < 2) {
        netRetries++;
        showToast('⏳ เชื่อมต่อ Gemini ไม่ได้ -- ลองใหม่ (' + netRetries + '/2)...');
        await new Promise(r => setTimeout(r, 3000 * netRetries));
        continue;
      }
      throw new Error(e.name === 'AbortError' ? 'Gemini ตอบช้าเกิน 90 วินาที ลองใหม่อีกครั้ง' : 'เชื่อมต่อ Gemini ไม่ได้ ตรวจสอบอินเทอร์เน็ต');
    }
    clearTimeout(timer);

    const isRateLimit = d.error?.status === 'RESOURCE_EXHAUSTED' || res.status === 429;
    const isOverload = res.status === 503 || d.error?.status === 'UNAVAILABLE' ||
      (d.error?.message && (d.error.message.includes('high demand') || d.error.message.includes('overloaded')));
    if (isRateLimit || isOverload) {
      rotateKey('GEMINI');
      if (attempt < keys.length * 2 - 1) {
        const waitSec = isOverload ? 15 : 30;
        for (let s = waitSec; s > 0; s -= 5) {
          showToast((isOverload ? '⏳ Gemini busy -- รอ ' : '⏳ Rate limit -- รอ ') + s + 'วิ...');
          await new Promise(r => setTimeout(r, 5000));
        }
        continue;
      }
      throw new Error('all_quota');
    }
    // error ฝั่งเซิร์ฟเวอร์ชั่วคราว → ลองใหม่
    if ((res.status === 500 || res.status === 502 || res.status === 504 || d.error?.status === 'INTERNAL' || d.error?.status === 'DEADLINE_EXCEEDED') && netRetries < 2) {
      netRetries++;
      showToast('⏳ Gemini ขัดข้องชั่วคราว -- ลองใหม่ (' + netRetries + '/2)...');
      await new Promise(r => setTimeout(r, 4000 * netRetries));
      continue;
    }
    if (d.error) {
      const msg = d.error.message || d.error.status || JSON.stringify(d.error);
      showToast('Gemini Error: ' + msg);
      throw new Error(msg);
    }
    const cand = d.candidates && d.candidates[0];
    const finish = cand ? cand.finishReason : '';
    const text = geminiText(d);
    // คำตอบโดนตัด/ว่าง → ลองใหม่ครั้งเดียวด้วยเพดานสูงขึ้น (ไม่ลองซ้ำกรณีถูกบล็อกด้วย SAFETY)
    if (!truncRetried && (finish === 'MAX_TOKENS' || (!text.trim() && finish !== 'SAFETY' && finish !== 'RECITATION' && finish !== 'PROHIBITED_CONTENT'))) {
      truncRetried = true;
      const gc = req.generationConfig;
      gc.maxOutputTokens = Math.min(Math.round((gc.maxOutputTokens || 4000) * 1.8), 16384);
      showToast('⏳ AI ตอบไม่ครบ -- ขอคำตอบใหม่อีกครั้ง...');
      continue;
    }
    if (!text.trim()) {
      throw new Error(finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT' ? 'Gemini ไม่ตอบคำถามนี้ (ถูกกรองเนื้อหา)' : 'Gemini ไม่ได้ส่งคำตอบกลับมา กดลองใหม่อีกครั้ง');
    }
    return geminiNormalize(d);
  }
  throw new Error('all_quota');
}

function getKeys(service) {
  const keys = [];
  for (let i = 0; i < SERVICES[service].slots; i++) {
    const k = localStorage.getItem(`folio_${service}_KEY_${i}`) || '';
    if (k) keys.push(k);
  }
  return keys;
}

// Get active key, rotate to next if current fails
function getActiveKey(service) {
  const keys = getKeys(service);
  if (!keys.length) return '';
  const idx = activeKeyIndex[service] % keys.length;
  return keys[idx];
}

function rotateKey(service) {
  const keys = getKeys(service);
  if (keys.length > 1) {
    activeKeyIndex[service] = (activeKeyIndex[service] + 1) % keys.length;
    showToast(`⚠️ ${SERVICES[service].label} key หมด สลับไป key ${activeKeyIndex[service]+1}`);
  }
}


// --- Phase 17: Portfolio Analyzer ---
window._p17SheetData = null;

// Executive summary table — render ตรงจาก Sheet data (deterministic, ไม่ผ่าน AI)
// ใช้สแกนสถานะพอร์ตรายวันได้โดยไม่ต้องกดวิเคราะห์
function p17RenderExecTable() {
  var el = document.getElementById('p17ExecTable');
  var wrap = document.getElementById('p17ExecTableWrap');
  if (!el) return;
  var data = window._p17SheetData;
  if (!data || !data.holdings || !data.holdings.length) { if (wrap) wrap.style.display = 'none'; return; }

  var rows = data.holdings.map(function(h) {
    return {
      asset: h['Asset'],
      value: Number(h['Market Value']) || 0,
      pl: (Number(h['P/L %']) || 0) * 100,
      drift: (Number(h['Drift %']) || 0) * 100,
      score: Number(h['Buy Priority Score']) || 0
    };
  }).sort(function(a, b) { return b.value - a.value; });

  var totalValue = rows.reduce(function(s, r) { return s + r.value; }, 0);
  var totalPL = data.holdings.reduce(function(s, h) { return s + (Number(h['Unrealized P/L']) || 0); }, 0);
  // เกณฑ์ BuyScore "สูง" = top 20% ของพอร์ต (เกณฑ์เดียวกับ smart filter ใน renderHoldings)
  var scores = rows.map(function(r) { return r.score; }).sort(function(a, b) { return b - a; });
  var scoreThreshold = scores.length ? (scores[Math.floor(scores.length * 0.2)] || 5) : 5;

  function statusTag(r) {
    if (r.drift > 5) {
      return taxLockInfo(r.asset)
        ? '<span style="background:var(--amber-bg);color:var(--amber);border-radius:4px;padding:1px 6px;font-size:9.5px;font-weight:600;white-space:nowrap;">🔒 ล็อก</span>'
        : '<span style="background:var(--orange-bg);color:var(--orange);border-radius:4px;padding:1px 6px;font-size:9.5px;font-weight:600;">ลด</span>';
    }
    if (r.drift < -5 || (r.score >= scoreThreshold && r.score > 0)) {
      return '<span style="background:var(--green-bg);color:var(--green);border-radius:4px;padding:1px 6px;font-size:9.5px;font-weight:600;">ซื้อ</span>';
    }
    return '<span style="background:var(--bg2);color:var(--text3);border-radius:4px;padding:1px 6px;font-size:9.5px;font-weight:600;">ถือ</span>';
  }

  var th = 'font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.4px;font-weight:600;padding:6px 8px;text-align:right;border-bottom:0.5px solid var(--border);white-space:nowrap;';
  var td = 'font-size:11.5px;padding:6px 8px;text-align:right;border-bottom:0.5px solid var(--bg2);white-space:nowrap;';
  var html = '<div style="font-size:10px;color:var(--text3);margin-bottom:6px;">' + (window._p17SyncTime ? 'sync ' + window._p17SyncTime + ' น. · ' : '') + 'ไม่ผ่าน AI</div>';
  html += '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;"><table style="border-collapse:collapse;width:100%;min-width:520px;">';
  html += '<tr><th style="' + th + 'text-align:left;">Asset</th><th style="' + th + '">มูลค่า ฿</th><th style="' + th + '">น้ำหนัก</th><th style="' + th + '">P/L</th><th style="' + th + '">Drift</th><th style="' + th + '">BuyScore</th><th style="' + th + 'text-align:center;">สถานะ</th></tr>';
  rows.forEach(function(r) {
    var w = totalValue > 0 ? (r.value / totalValue * 100) : 0;
    html += '<tr>' +
      '<td style="' + td + 'text-align:left;font-weight:500;color:var(--text);">' + esc(r.asset) + '</td>' +
      '<td style="' + td + '">' + Math.round(r.value).toLocaleString() + '</td>' +
      '<td style="' + td + 'color:var(--text2);">' + w.toFixed(1) + '%</td>' +
      '<td style="' + td + 'color:' + (r.pl >= 0 ? 'var(--green)' : 'var(--red)') + ';">' + (r.pl >= 0 ? '+' : '') + r.pl.toFixed(1) + '%</td>' +
      '<td style="' + td + 'color:' + (Math.abs(r.drift) > 5 ? 'var(--amber)' : 'var(--text2)') + ';">' + (r.drift >= 0 ? '+' : '') + r.drift.toFixed(1) + '%</td>' +
      '<td style="' + td + 'color:' + (r.score >= scoreThreshold && r.score > 0 ? 'var(--green)' : 'var(--text2)') + ';">' + r.score.toFixed(1) + '</td>' +
      '<td style="' + td + 'text-align:center;">' + statusTag(r) + '</td>' +
    '</tr>';
  });
  html += '<tr>' +
    '<td style="' + td + 'text-align:left;font-weight:600;color:var(--text);border-bottom:none;">รวม (' + rows.length + ')</td>' +
    '<td style="' + td + 'font-weight:600;color:var(--text);border-bottom:none;">' + Math.round(totalValue).toLocaleString() + '</td>' +
    '<td style="' + td + 'border-bottom:none;">100%</td>' +
    '<td style="' + td + 'font-weight:600;color:' + (totalPL >= 0 ? 'var(--green)' : 'var(--red)') + ';border-bottom:none;">' + (totalPL >= 0 ? '+' : '') + '฿' + Math.round(totalPL).toLocaleString() + '</td>' +
    '<td style="' + td + 'border-bottom:none;" colspan="3"></td>' +
  '</tr>';
  html += '</table></div>';
  el.innerHTML = html;
  if (wrap) wrap.style.display = '';
}

// ─── Sheet data table toggle (collapsed by default — raw data, opt-in view) ───
function p17ToggleExecTable() {
  var body = document.getElementById('p17ExecTable');
  var chevron = document.getElementById('p17ExecTableChevron');
  if (!body) return;
  body.classList.toggle('open');
  if (chevron) chevron.classList.toggle('open');
  try { localStorage.setItem('folio_p17_exectable_open', body.classList.contains('open') ? '1' : '0'); } catch(e) {}
}
function p17RestoreExecTableState() {
  try {
    if (localStorage.getItem('folio_p17_exectable_open') === '1') {
      var body = document.getElementById('p17ExecTable');
      var chevron = document.getElementById('p17ExecTableChevron');
      if (body) body.classList.add('open');
      if (chevron) chevron.classList.add('open');
    }
  } catch(e) {}
}

async function p17SyncSheet(manual = false) {
  const url = window._PORTFOLIO_SHEET_URL || localStorage.getItem('folio_PORTFOLIO_SHEET_URL') || '';
  if (!url) { showToast('ใส่ Portfolio Sheet URL ใน ⚙️ ตั้งค่าก่อน'); return; }
  const btn = document.getElementById('p17SyncBtn');
  if (btn) btn.disabled = true;
  showToast('กำลังดึงข้อมูลจาก Portfolio Sheet...');
  try {
    const resp = await fetch(url, { redirect: 'follow', mode: 'cors' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const holdings = data.holdings || [];
    window._p17SyncTime = new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
    // เส้นทางเดียวกับหน้าภาพรวม — ยอดรวมของสองหน้าจึงมาจากการคำนวณชุดเดียว
    applySheetData(data);
    savePriceCache();
    p17RenderSummaryRow();
    updatePortfolioSummary();
    renderHoldings();
    renderAllocation(); initPhase9(); initPhase10(); initPhase11(); initPhase12(); p14TrackDrawdown();
    showToast('ดึงข้อมูล ' + holdings.length + ' holdings สำเร็จ ✓');
  } catch(e) {
    showToast('ดึงข้อมูลไม่ได้: ' + e.message);
  }
  if (btn) btn.disabled = false;
}

async function p17RunAnalysis() {
  if (!window._p17SheetData) { showToast('กด 🔄 ดึงข้อมูล Sheet ก่อน'); return; }
  var btn = document.getElementById('p17AiBtn');
  var sp = document.getElementById('p17Spinner');
  btn.disabled = true; sp.style.display = 'block';

  var data = window._p17SheetData;
  var holdings = data.holdings || [];
  var execPlan = data.executionPlan || [];
  var inputs = data.inputs || {};

  // Build compact summary strings
  var holdingSummary = holdings.map(function(h) {
    return h['Asset'] + '|' + h['Theme'] +
      '|NAV=' + (Number(h['Price'])||0).toFixed(2) +
      '|มูลค่า=' + Math.round(Number(h['Market Value'])||0).toLocaleString() +
      '|P/L=' + ((Number(h['P/L %'])||0)*100).toFixed(1) + '%' +
      '|Drift=' + ((Number(h['Drift %'])||0)*100).toFixed(1) + '%' +
      '|Target=' + ((Number(h['Target Allocation %'])||0)*100).toFixed(0) + '%' +
      '|BuyScore=' + Number(h['Buy Priority Score']||0).toFixed(1) +
      '|ExpReturn=' + ((Number(h['Expected Return %'])||0)*100).toFixed(0) + '%';
  }).join('\n');

  var execSummary = execPlan.filter(function(r) {
    return Number(r['Suggested Monthly Buy (THB)']) > 0;
  }).map(function(r) {
    return r['Asset'] + ' ซื้อ=' + Math.round(Number(r['Suggested Monthly Buy (THB)'])).toLocaleString() + ' BuyScore=' + Number(r['Buy Priority Score']||0).toFixed(1);
  }).join(', ');

  var overweight = holdings.filter(function(h) { return Number(h['Drift %']) > 0.02; })
    .map(function(h) { return h['Asset'] + '(' + (Number(h['Drift %'])*100).toFixed(1) + '% เกิน)'; }).join(', ') || 'ไม่มี';

  var underweight = holdings.filter(function(h) { return Number(h['Drift %']) < -0.02; })
    .map(function(h) { return h['Asset'] + '(' + (Math.abs(Number(h['Drift %']))*100).toFixed(1) + '% ขาด)'; }).join(', ') || 'ไม่มี';

  var panel = document.getElementById('p17panel-summary');
  var result = document.getElementById('p17AiResult');
  var empty = document.getElementById('p17Empty');
  result.style.display = '';
  if (empty) empty.style.display = 'none';
  panel.innerHTML = '<span style="color:var(--text3)">กำลังวิเคราะห์พอร์ตพร้อมค้นหาข่าวสด...</span>';

  try {
    var prompt = 'คุณคือผู้จัดการกองทุนอาวุโส บลจ. ชั้นนำ ประสบการณ์ 20 ปี' +
      '\n\nข้อมูลพอร์ต (จาก Google Sheet อัพเดตล่าสุด):' +
      '\nเป้าหมาย: ' + (inputs['Objective Return'] ? (Number(inputs['Objective Return'])*100).toFixed(0) : '10') + '% YoY' +
      '\nDCA รายเดือน: ' + Number(inputs['Monthly Contribution']||10000).toLocaleString() + ' บาท' +
      '\n\nHoldings ทั้งหมด:\n' + holdingSummary +
      '\n\nแผนซื้อเดือนนี้: ' + (execSummary || 'ไม่มี') +
      '\nOverweight: ' + overweight +
      '\nUnderweight: ' + underweight +
      (taxLockedAssetNames().length ? '\nLOCKED (SSF/RMF — ห้ามแนะนำขาย/ลด ขายแล้วเสียสิทธิภาษี): ' + taxLockedAssetNames().join(', ') : '') +
      '\nRisk Profile ผู้ลงทุน: ' + (_p17bRiskLevel === 'low' ? 'Conservative (อนุรักษ์)' : _p17bRiskLevel === 'high' ? 'Aggressive (เชิงรุก)' : 'Base (สมดุล)') +
      '\n\nโปรดค้นหาข่าวตลาดล่าสุดที่เกี่ยวข้องกับ holdings เหล่านี้ แล้วเขียนรายงานวิเคราะห์ภาษาไทย แบ่งเป็นหัวข้อชัดเจนดังนี้:' +
      '\n\n**สรุปสำหรับผู้บริหาร**' +
      '\nสรุป 3-4 bullet สั้นๆ ต้องมีตัวเลข/ชื่อ asset จริงจากพอร์ต ไม่ใช่คำพูดกว้างๆ: ยอดซื้อ/ลดรวมที่แนะนำเดือนนี้, action ที่สำคัญที่สุด 1 ข้อพร้อมชื่อ asset, ความเสี่ยงหลัก 1 ข้อ ขึ้นบรรทัดใหม่แต่ละ bullet' +
      '\n\n**ภาพรวมตลาดและพอร์ต**' +
      '\nสรุปข่าวตลาดล่าสุดที่กระทบพอร์ต 3-4 ประโยค' +
      '\n\n**ความน่าเชื่อถือของข้อมูลใน Sheet**' +
      '\nวิเคราะห์ว่า NAV/ราคาและ Drift % ใน Sheet สอดคล้องกับสภาวะตลาดปัจจุบันหรือไม่ มี holding ใดที่ข้อมูลอาจล้าสมัยหรือควรตรวจสอบซ้ำ' +
      '\n\n**คำแนะนำซื้อ/ถือ/ลด**' +
      '\nแต่ละรายการขึ้นต้นด้วย [ซื้อ] [ถือ] หรือ [ลด] ตามด้วยชื่อ asset และเหตุผลสั้น อิง BuyScore + ข่าวจริง' +
      '\n\n**แผน Rebalance**' +
      '\nระบุ asset ที่ต้องปรับและจำนวนเงินโดยประมาณ อิง Drift % จริง' +
      '\n\nตอบเป็นภาษาไทย plain text ห้ามใช้ markdown symbols เช่น ** หรือ ## ใช้เพียง header ข้างบนนี้เท่านั้น';

    var d = await callGemini({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 4000 }
    });
    var text = (d.candidates && d.candidates[0] && d.candidates[0].content &&
      d.candidates[0].content.parts && d.candidates[0].content.parts.find(function(p) { return p.text; })) ?
      d.candidates[0].content.parts.find(function(p) { return p.text; }).text : '';

    var headers = ['ภาพรวมตลาดและพอร์ต','ความน่าเชื่อถือของข้อมูลใน Sheet','คำแนะนำซื้อ/ถือ/ลด','แผน Rebalance'];
    var execHeader = 'สรุปสำหรับผู้บริหาร';

    // ดึงส่วน "สรุปสำหรับผู้บริหาร" ออกมาวางเด่นแยกต่างหากด้านบนสุด — เป็น summary จากคำตอบ AI เดียวกันจริงๆ ไม่ใช่คำนวณเอง
    var execSummaryHtml = '';
    var bodyText = text;
    var execIdx = text.indexOf(execHeader);
    if (execIdx !== -1) {
      var afterExec = text.slice(execIdx + execHeader.length);
      var nextIdx = -1;
      headers.forEach(function(h) {
        var idx = afterExec.indexOf(h);
        if (idx !== -1 && (nextIdx === -1 || idx < nextIdx)) nextIdx = idx;
      });
      var execBody = nextIdx !== -1 ? afterExec.slice(0, nextIdx) : afterExec;
      bodyText = nextIdx !== -1 ? text.slice(0, execIdx) + afterExec.slice(nextIdx) : text.slice(0, execIdx);
      var bulletLines = execBody.split('\n').map(function(l){ return l.trim().replace(/^[-•*]\s*/,''); }).filter(Boolean);
      if (bulletLines.length) {
        execSummaryHtml = '<div style="background:var(--accent-light);border-left:3px solid var(--accent);border-radius:8px;padding:12px 14px;margin-bottom:14px;">' +
          '<div style="font-size:10.5px;font-weight:700;color:var(--accent);letter-spacing:0.5px;margin-bottom:8px;">📌 สรุปสำหรับผู้บริหาร</div>' +
          bulletLines.map(function(l){ return '<div style="font-size:12.5px;color:var(--text);line-height:1.7;padding-left:14px;position:relative;"><span style="position:absolute;left:0;">•</span>' + esc(l) + '</div>'; }).join('') +
          '</div>';
      }
    }

    // Format: bold headers, colored buy/hold/sell tags
    var html = esc(bodyText).replace(/\n/g, '<br>');
    // Section headers - make them stand out
    headers.forEach(function(h) {
      html = html.split(h).join('<div style="font-size:11px;font-weight:600;color:var(--accent);margin:14px 0 6px;letter-spacing:0.3px;">' + h + '</div>');
    });
    // Buy/hold/sell tags
    html = html.split('[ซื้อ]').join('<span style="background:var(--green-bg);color:var(--green);border-radius:4px;padding:1px 6px;font-size:10px;font-weight:600;margin-right:4px;">ซื้อ</span>');
    html = html.split('[ถือ]').join('<span style="background:var(--blue-bg);color:var(--blue);border-radius:4px;padding:1px 6px;font-size:10px;font-weight:600;margin-right:4px;">ถือ</span>');
    html = html.split('[ลด]').join('<span style="background:var(--orange-bg);color:var(--orange);border-radius:4px;padding:1px 6px;font-size:10px;font-weight:600;margin-right:4px;">ลด</span>');

    panel.innerHTML = execSummaryHtml + html + aiSourceFooter(true);
    aiCacheSave('p17_analysis', panel.innerHTML);
    var ls = document.getElementById('p17LastSync');
    if (ls) ls.textContent = 'วิเคราะห์เสร็จ ' + new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}) + ' น. -- Gemini + Google Search';
  } catch(e) {
    var msg = e.message === 'no_key' ? 'ใส่ Gemini Key ก่อน' : 'วิเคราะห์ไม่ได้: ' + e.message;
    showToast(msg);
    panel.innerHTML = '<span style="color:var(--red);">' + esc(msg) + '</span>';
  }
  btn.disabled = false; sp.style.display = 'none';
}
var _p17bRiskLevel = localStorage.getItem('folio_riskProfile') || 'base';
p17bApplyRiskUi(_p17bRiskLevel); // HTML ไฮไลต์ Base ไว้ตายตัว — ให้ตรงกับค่าที่บันทึกไว้
function p17bSetRisk(level) {
  _p17bRiskLevel = level;
  localStorage.setItem('folio_riskProfile', level);
  if (window.FB) window.FB.setDoc('settings', 'profile', { riskLevel: level }).catch(function(){});
  p17bApplyRiskUi(level);
}
// ไฮไลต์ปุ่ม Risk ให้ตรงกับค่าที่ใช้อยู่ (ไม่บันทึกอะไร)
function p17bApplyRiskUi(level) {
  var btns = { low: 'p17b-risk-low', base: 'p17b-risk-base', high: 'p17b-risk-high' };
  var colors = { low: ['var(--blue-bg)','var(--blue)','0.5px solid var(--border)'], base: ['var(--accent)','#fff','0.5px solid var(--accent)'], high: ['var(--purple-bg)','var(--purple)','0.5px solid var(--border)'] };
  Object.keys(btns).forEach(function(k) {
    var el = document.getElementById(btns[k]);
    if (!el) return;
    if (k === level) { el.style.background = colors[k][0]; el.style.color = colors[k][1]; el.style.border = colors[k][2]; el.style.fontWeight = '600'; }
    else { el.style.fontWeight = '400'; if (k==='low') { el.style.background='var(--blue-bg)'; el.style.color='var(--blue)'; el.style.border='0.5px solid var(--border)'; } else if (k==='base') { el.style.background='var(--bg)'; el.style.color='var(--text2)'; el.style.border='0.5px solid var(--border)'; } else { el.style.background='var(--purple-bg)'; el.style.color='var(--purple)'; el.style.border='0.5px solid var(--border)'; } }
  });
}


function p17bToggleNote() {
  var box = document.getElementById('p17bNoteBox');
  var arrow = document.getElementById('p17bNoteArrow');
  var open = box.style.display === 'block';
  box.style.display = open ? 'none' : 'block';
  arrow.style.transform = open ? '' : 'rotate(90deg)';
  if (!open) { setTimeout(function(){ var t = document.getElementById('p17bNote'); if(t) t.focus(); }, 50); }
}

function p17bSetBudget(amount) {
  var el = document.getElementById('p17bBudget');
  if (el) { el.value = amount; }
  var presets = document.querySelectorAll('#p17bPresets button');
  presets.forEach(function(b) {
    var txt = b.textContent.trim();
    var val = txt.includes('100K') ? 100000 : txt.includes('50K') ? 50000 : txt.includes('30K') ? 30000 : txt.includes('20K') ? 20000 : txt.includes('10K') ? 10000 : txt.includes('5K') ? 5000 : 0;
    b.style.background = val === amount ? 'var(--accent-light)' : 'var(--bg)';
    b.style.borderColor = val === amount ? 'var(--accent)' : 'var(--border)';
    b.style.color = val === amount ? 'var(--accent)' : 'var(--text2)';
  });
}
function p17bFormatBudget(el) {
  var presets = document.querySelectorAll('#p17bPresets button');
  presets.forEach(function(b) {
    b.style.background = 'var(--bg)';
    b.style.borderColor = 'var(--border)';
    b.style.color = 'var(--text2)';
  });
}

async function p17bRun() {
  var budgetEl = document.getElementById('p17bBudget');
  var budget = budgetEl ? parseInt(budgetEl.value) || 0 : 0;
  if (!budget || budget < 500) { showToast('ใส่งบลงทุนเดือนนี้ก่อน (ขั้นต่ำ ฿500)'); return; }
  var noteEl = document.getElementById('p17bNote');
  var note = noteEl && document.getElementById('p17bNoteBox').style.display === 'block' ? noteEl.value.trim() : '';
  var input = 'งบเดือนนี้ ฿' + budget.toLocaleString() + ' บาท' + (note ? ' | บริบท: ' + note : '');
  var btn = document.getElementById('p17bBtn');
  var sp = document.getElementById('p17bSpinner');
  var result = document.getElementById('p17bResult');
  btn.disabled = true; sp.style.display = 'block';
  result.style.display = '';
  result.innerHTML = '<span style="color:var(--text3)">กำลังดึงข้อมูลพอร์ตและวิเคราะห์ตลาด...</span>';

  var portLines = [];
  if (window._p17SheetData) {
    var sd = window._p17SheetData;
    var holdings = sd.holdings || [];
    var inputs = sd.inputs || {};
    var totalValue = holdings.reduce(function(s,x){ return s+Number(x['Market Value']||0); }, 0);
    var overweight = holdings.filter(function(x){ return Number(x['Drift %'])>0.02; })
      .map(function(x){ return x['Asset']+'(เกิน '+(Number(x['Drift %'])*100).toFixed(1)+'%)'; }).join(', ') || 'ไม่มี';
    var underweight = holdings.filter(function(x){ return Number(x['Drift %'])<-0.02; })
      .map(function(x){ return x['Asset']+'(ขาด '+(Math.abs(Number(x['Drift %']))*100).toFixed(1)+'%)'; }).join(', ') || 'ไม่มี';
    var topBuy = (sd.executionPlan||[]).filter(function(x){ return Number(x['Suggested Monthly Buy (THB)'])>0; })
      .sort(function(a,b){ return Number(b['Buy Priority Score']||0)-Number(a['Buy Priority Score']||0); })
      .slice(0,5).map(function(x){ return x['Asset']+' BuyScore='+Number(x['Buy Priority Score']||0).toFixed(1); }).join(', ') || 'ไม่มี';
    portLines.push('มูลค่าพอร์ตรวม: ' + Math.round(totalValue).toLocaleString() + ' บาท');
    portLines.push('เป้าหมาย: ' + (inputs['Objective Return']?(Number(inputs['Objective Return'])*100).toFixed(0):'10') + '% YoY');
    portLines.push('DCA ปัจจุบัน: ' + Number(inputs['Monthly Contribution']||10000).toLocaleString() + ' บาท/เดือน');
    portLines.push('Overweight (ต้องลด): ' + overweight);
    portLines.push('Underweight (ต้องเพิ่ม): ' + underweight);
    portLines.push('Top BuyScore: ' + topBuy);
    portLines.push('');
    portLines.push('Holdings รายละเอียด (Asset|P/L%|Drift%|BuyScore|ExpReturn%):');
    holdings.slice(0,12).forEach(function(h) {
      portLines.push(h['Asset'] + '|' + ((Number(h['P/L %'])||0)*100).toFixed(1) + '%|' + ((Number(h['Drift %'])||0)*100).toFixed(1) + '%|' + Number(h['Buy Priority Score']||0).toFixed(1) + '|' + ((Number(h['Expected Return %'])||0)*100).toFixed(0) + '%');
    });
  }
  // Trajectory context: load 90-day history and add momentum lines
  var trajectoryLines = [];
  try {
    var snapHistory = typeof window.loadSnapshotHistory === 'function' ? await window.loadSnapshotHistory(90) : [];
    var nowValue = window._p9Data ? window._p9Data.totalValue : 0;
    var nowSnap  = window._p9Data ? window._p9Data.snapshotCost : 0;
    var nowYoy   = window._p9Data ? window._p9Data.currentYoy : null;
    var _objRet  = window._p9Data && state.sheetInputs && state.sheetInputs['Objective Return'];
    var TARGET   = _objRet ? Number(_objRet)*100 : 10;
    if (snapHistory.length >= 2 && nowValue) {
      var s30 = window.snapshotDaysAgo(snapHistory, 30);
      var s90 = window.snapshotDaysAgo(snapHistory, 90);
      if (s30 && s30.totalValue) {
        var chg30 = ((nowValue - s30.totalValue) / s30.totalValue * 100).toFixed(1);
        trajectoryLines.push('มูลค่า 30 วันที่แล้ว: ฿' + Math.round(s30.totalValue).toLocaleString() + ' → ปัจจุบัน ฿' + Math.round(nowValue).toLocaleString() + ' (' + (chg30>=0?'+':'') + chg30 + '%)');
      }
      if (s30 && s30.snapshotCost && nowYoy !== null) {
        var yoy30ago = s30.snapshotCost > 0 ? ((s30.totalValue - s30.snapshotCost) / s30.snapshotCost * 100).toFixed(1) : null;
        if (yoy30ago !== null) {
          var gapTrend = (nowYoy - Number(yoy30ago)).toFixed(1);
          trajectoryLines.push('Gap trend 30 วัน: YoY เปลี่ยน ' + (gapTrend>=0?'+':'') + gapTrend + '% (' + (gapTrend>=0?'กำลังปิด gap ✅':'ห่างเป้ามากขึ้น ⚠️') + ')');
        }
      }
      // Annualized pace — prefer 90d window (less volatile); fall back to "estimate pending"
      var paceBase = (snapHistory.length >= 2 && s90 && s90.totalValue &&
                      Math.abs(new Date(s90.date).getTime() - (Date.now() - 90*86400000)) < 35*86400000)
                     ? { snap: s90, windowDays: 90 }
                     : (s30 && s30.totalValue &&
                        Math.abs(new Date(s30.date).getTime() - (Date.now() - 30*86400000)) < 15*86400000)
                       ? { snap: s30, windowDays: 30 }
                       : null;
      if (paceBase && paceBase.windowDays >= 60) {
        var chgRaw = (nowValue - paceBase.snap.totalValue) / paceBase.snap.totalValue;
        var annualizedPace = (Math.pow(1 + chgRaw, 365 / paceBase.windowDays) - 1) * 100;
        trajectoryLines.push('Annualized pace (อิงจาก ' + paceBase.windowDays + ' วัน): ' + annualizedPace.toFixed(1) + '% vs เป้า ' + TARGET.toFixed(0) + '%' + (annualizedPace >= TARGET ? ' ✅' : ' — ต้องเร่ง'));
      } else {
        trajectoryLines.push('Annualized pace: estimate pending (ต้องการข้อมูล ≥60 วัน — มีอีก ' + Math.max(0, 60 - snapHistory.length) + ' วัน)');
      }
      if (s90 && s90.totalValue) {
        var chg90 = ((nowValue - s90.totalValue) / s90.totalValue * 100).toFixed(1);
        trajectoryLines.push('มูลค่า 90 วันที่แล้ว: ฿' + Math.round(s90.totalValue).toLocaleString() + ' เปลี่ยน ' + (chg90>=0?'+':'') + chg90 + '%');
      }
    } else {
      trajectoryLines.push('ข้อมูล trajectory: เริ่มเก็บวันนี้ (ครบ 30 วันจะเห็น momentum จริง)');
    }
  } catch(e) { /* silent */ }
  if (trajectoryLines.length) {
    portLines.push('');
    portLines.push('Trajectory & Momentum:');
    trajectoryLines.forEach(function(l){ portLines.push(l); });
  }

  // กระแสเงินสดจริงจาก Bill Manager — ให้ AI รู้ว่างบนี้ยั่งยืนเทียบกับเงินเหลือจริงไหม
  if (typeof billCashflowContext === 'function') {
    var billCtx = billCashflowContext();
    if (billCtx) {
      portLines.push('');
      portLines.push('กระแสเงินสดจริงจาก Bill Manager (ใช้ประเมินว่างบลงทุนนี้ยั่งยืนไหม):');
      portLines.push(billCtx);
    }
  }
  var portCtx = portLines.join('\n');

  var analysisLines = [];
  var analysisEl = document.getElementById('p17panel-summary');
  if (analysisEl && analysisEl.innerText && analysisEl.innerText.length > 50) {
    analysisLines.push('');
    analysisLines.push('ผลวิเคราะห์พอร์ตล่าสุด:');
    analysisLines.push(analysisEl.innerText.slice(0, 800));
  }
  var analysisSummary = analysisLines.join('\n');

  // ─── Intent detection (budget always from input field) ───
var isNewMoney = budget > 0;
var isRebalance = false;

// ─── Risk weights (Conservative/Base/Aggressive) ───
var riskNote = _p17bRiskLevel === 'low' ? 'Conservative: ปลอดภัย ลด Vol' :
               _p17bRiskLevel === 'high' ? 'Aggressive: รับเสี่ยงสูง เน้น upside' : 'Base: สมดุล';
var maxPerAsset = _p17bRiskLevel === 'low' ? 0.30 : _p17bRiskLevel === 'high' ? 0.50 : 0.40;
// score weights: buyscore 0.4 | underweight 0.4 | risk_fit 0.2
var wBuy = 0.4, wDrift = 0.4, wRisk = 0.2;

// ─── Build portfolio state ───
var assets = [];
var totalVal = 0;
if (window._p17SheetData && window._p17SheetData.holdings) {
  var sh = window._p17SheetData.holdings;
  totalVal = sh.reduce(function(s,h){ return s+Number(h['Market Value']||0); }, 0);
  sh.forEach(function(h) {
    var currentW = Number(h['Current Allocation %']||0);  // 0-1 scale
    var targetW  = Number(h['Target Allocation %']||0);   // 0-1 scale
    var drift    = (currentW - targetW) * 100;            // % points
    var buyScore = Number(h['Buy Priority Score']||0);    // 0-10
    var expRet   = Number(h['Expected Return %']||0)*100; // %
    var val      = Number(h['Market Value']||0);
    var asset    = h['Asset'];
    var theme    = (h['Theme']||'').toLowerCase();

    // risk_fit: how well asset fits selected risk level
    var riskFit = 1.0;
    if (_p17bRiskLevel === 'low') {
      // conservative: prefer bond/gold, penalize crypto
      riskFit = theme.includes('bond') || theme.includes('gold') ? 1.5 :
                theme.includes('crypto') ? 0.3 : 1.0;
    } else if (_p17bRiskLevel === 'high') {
      // aggressive: prefer crypto/tech/em, penalize bond
      riskFit = theme.includes('crypto') || theme.includes('tech') || theme.includes('em') ? 1.5 :
                theme.includes('bond') ? 0.5 : 1.0;
    }

    // underweight_bonus = abs(drift) if underweight, else 0
    var underweightBonus = drift < 0 ? Math.abs(drift) : 0;  // drift<0 means under-allocated (ขาด)

    // composite score
    var score = (buyScore/10 * 10 * wBuy) +   // normalize buyscore to 0-10 range
                (underweightBonus * wDrift) +
                (riskFit * 10 * wRisk);

    var status = drift > 5 ? 'OVERWEIGHT' : drift < -5 ? 'UNDERWEIGHT' : 'NEUTRAL';

    assets.push({
      asset: asset, theme: theme, drift: drift, buyScore: buyScore,
      score: score, riskFit: riskFit, underweightBonus: underweightBonus,
      status: status, val: val, currentW: currentW*100, targetW: targetW*100,
      expRet: expRet
    });
  });
}

// ─── Filter + Rank ───
var blocked = assets.filter(function(a){ return a.status === 'OVERWEIGHT'; });
var eligible = assets.filter(function(a){ return a.status !== 'OVERWEIGHT'; });
eligible.sort(function(a,b){ return b.score - a.score; });

// ─── Pre-compute allocation (normalize by score) ───
var allocationPlan = [];
var rebalancePlan = blocked.map(function(a) {
  var reduceAmt = Math.round(Math.abs(a.drift/100) * totalVal);
  return { asset: a.asset, drift: a.drift, reduceAmt: reduceAmt };
});

if (budget > 0 && eligible.length > 0) {
  var scoreSum = eligible.slice(0,6).reduce(function(s,a){ return s+a.score; }, 0);
  var remaining = budget;
  eligible.slice(0,6).forEach(function(a) {
    if (remaining <= 0) return;
    var rawShare = scoreSum > 0 ? a.score/scoreSum : 1/eligible.length;
    var cappedShare = Math.min(rawShare, maxPerAsset);
    var amt = Math.min(Math.round(cappedShare * budget / 500) * 500, remaining);
    if (amt < 500) return;
    allocationPlan.push({ asset: a.asset, amt: amt, drift: a.drift, score: a.score, buyScore: a.buyScore, status: a.status,
      currentW: a.currentW, targetW: a.targetW, expRet: a.expRet });
    remaining -= amt;
  });
  // distribute remainder to top pick
  if (remaining >= 500 && allocationPlan.length > 0) {
    allocationPlan[0].amt += remaining;
  }
}

// ─── Expected YoY (weighted by allocation) ───
var weightedExpRet = 0;
if (allocationPlan.length > 0) {
  var totalAlloc = allocationPlan.reduce(function(s,a){ return s+a.amt; }, 0);
  allocationPlan.forEach(function(a) {
    var share = totalAlloc > 0 ? a.amt/totalAlloc : 0;
    weightedExpRet += share * (a.expRet || 8);
  });
} else {
  weightedExpRet = 9; // fallback
}
var yoyConserv = (weightedExpRet * 0.65).toFixed(1) + '-' + (weightedExpRet * 0.80).toFixed(1) + '%';
var yoyBase    = (weightedExpRet * 0.80).toFixed(1) + '-' + (weightedExpRet * 1.10).toFixed(1) + '%';
var yoyAggr    = (weightedExpRet * 1.10).toFixed(1) + '-' + (weightedExpRet * 1.40).toFixed(1) + '%';

// ─── Exposure after buy ───
var exposureLines = allocationPlan.slice(0,4).map(function(a) {
  var addedPct = totalVal > 0 ? (a.amt/totalVal*100).toFixed(1) : '0';
  var afterPct = (a.currentW + parseFloat(addedPct)).toFixed(1);
  return a.asset + ': ' + a.currentW.toFixed(1) + '% -> ' + afterPct + '% (target ' + a.targetW.toFixed(0) + '%)';
});

// ─── Build prompt ───
var promptLines = [];
promptLines.push('CIO ระดับ บลจ. 20 ปี | กรอบ: ' + riskNote);
promptLines.push('');
promptLines.push('Portfolio: ฿' + Math.round(totalVal).toLocaleString());
promptLines.push(portCtx);
if (analysisSummary) promptLines.push(analysisSummary);
promptLines.push('');

  promptLines.push('=== งบเดือนนี้ ฿' + budget.toLocaleString() + ' ===');
  if (note) { promptLines.push('บริบทเพิ่มเติมจากผู้ใช้: ' + note); }
  promptLines.push('');
  promptLines.push('LAYER 1 — กองที่มีในพอร์ต (pre-scored):');
  allocationPlan.forEach(function(a,i){
    promptLines.push((i+1)+'. '+a.asset+': แนะนำ ฿'+a.amt.toLocaleString()+' (Drift='+a.drift.toFixed(1)+'%, BuyScore='+a.buyScore.toFixed(1)+', คะแนนรวม='+a.score.toFixed(1)+', status='+a.status+')');
  });
  if (blocked.length) {
    promptLines.push('BLOCKED (overweight — ห้ามซื้อ): ' + blocked.map(function(a){ return a.asset; }).join(', '));
  }
  var _lockedList = taxLockedAssetNames();
  if (_lockedList.length) {
    promptLines.push('LOCKED (SSF/RMF — ห้ามแนะนำขาย/ลด/trim เด็ดขาด ขายแล้วเสียสิทธิภาษี): ' + _lockedList.join(', '));
  }
  promptLines.push('');
  promptLines.push('LAYER 2 — ใช้ Google Search หาสภาวะตลาดปัจจุบัน แล้วแนะนำ 1-2 กองทุนไทยที่น่าสนใจ เพิ่มเติมจาก LAYER 1 (ไม่ซ้ำกัน, งบ bonus ดึงมาจากส่วนที่เหลือหรือปรับลด LAYER 1 บางส่วน):');
  promptLines.push('- ต้องเป็นกองทุนไทย (ชื่อ เช่น K-GTECHRMF, SCBNDQ(A), KFVRMF ฯลฯ)');
  promptLines.push('- ระบุเหตุผลสั้น ๆ จากข่าวตลาดจริง ว่าทำไมถึงน่าสนใจตอนนี้');
  promptLines.push('');
  promptLines.push('Expected YoY pre-calc: Conservative '+yoyConserv+' / Base '+yoyBase+' / Aggressive '+yoyAggr);
  promptLines.push('Exposure after buy: ');
  exposureLines.forEach(function(e){ promptLines.push('- '+e); });
  promptLines.push('');
  if (typeof sgPromptLines === 'function') { var _sgL = sgPromptLines(); if (_sgL.length) { _sgL.forEach(function(l){ promptLines.push(l); }); promptLines.push(''); } }
  promptLines.push('กฎสำคัญ:');
  promptLines.push('- sum ของทุก allocation.amount ต้องเท่ากับ ' + budget + ' พอดี');
  promptLines.push('- ห้ามซื้อ BLOCKED assets');
  promptLines.push('- ห้ามแนะนำขาย/ลด LOCKED assets (SSF/RMF)');
  promptLines.push('- รวม Layer 1 + Layer 2 ไม่เกิน 6 รายการ');
  promptLines.push('- top_actions = สรุป 3 ข้อที่สำคัญที่สุด (ซื้อ/ถือ/ลด)');
  promptLines.push('- bonus_funds ต้องมี is_new_fund: true เพื่อแยก UI');
  promptLines.push('- ทุก item ต้องมี "source": "sheet" (อิง Drift/BuyScore จากพอร์ต) หรือ "news" (อิงข่าว/สภาวะตลาดที่ค้นเจอจริง)');
  promptLines.push('- reason ของ item ที่ source เป็น news ต้องอ้างเหตุการณ์/ข่าวจริงที่ Google Search เจอ ห้ามอ้างข่าวลอย ๆ ที่ไม่ได้ค้น');
  promptLines.push('');
  promptLines.push('ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น ห้ามใช้ ```json:');
  promptLines.push('{"top_actions":[{"rank":1,"action":"ชื่อ action ภาษาไทย","amount":XXXX,"reason":"เหตุผล 1 ประโยคภาษาไทยที่อ่านเข้าใจ","layer":1,"source":"sheet"}],"allocation":[{"asset":"ชื่อ","amount":XXXX,"reason":"เหตุผล 1 ประโยคภาษาไทยที่อ่านเข้าใจ","is_new_fund":false,"source":"sheet"}],"bonus_funds":[{"asset":"ชื่อกอง","amount":XXXX,"reason":"ทำไมน่าสนใจตอนนี้ อ้างข่าวจริง","is_new_fund":true,"source":"news"}],"expected_yoy":{"conservative":"'+yoyConserv+'","base":"'+yoyBase+'","aggressive":"'+yoyAggr+'"},"risk":{"level":"High/Med/Low","note":"exposure X%"},"triggers":["asset -X% -> action"]}');
var prompt = promptLines.join('\n');

  try {
    var d = await callGemini({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 6000, thinkingConfig: { thinkingBudget: 0 } }
    });
    var text = '';
    var finishReason = (d.candidates && d.candidates[0]) ? d.candidates[0].finishReason : '';
    if (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) {
      var part = d.candidates[0].content.parts.find(function(p){ return p.text; });
      if (part) text = part.text;
    }
    // ─── Parse JSON schema from AI response ───
    var parsed = null;
    var rawText = text || '';
    // Strip markdown code fences if present
    rawText = rawText.replace(/[\`]{3}json\s*/gi,'').replace(/[\`]{3}\s*/g,'').trim();
    try { parsed = JSON.parse(rawText); } catch(_) {
      // Try extracting JSON object
      var jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) { try { parsed = JSON.parse(jsonMatch[0]); } catch(_) {} }
    }

    // Salvage: คำตอบโดนตัดกลาง JSON (มักเกิดตอน MAX_TOKENS) — กู้เท่าที่ array แต่ละตัวพาร์สได้
    var wasPartial = false;
    if (!parsed && rawText) {
      var salvTop = salvageJsonArrayByKey(rawText, 'top_actions');
      var salvAlloc = salvageJsonArrayByKey(rawText, 'allocation');
      var salvBonus = salvageJsonArrayByKey(rawText, 'bonus_funds');
      if (salvTop.length || salvAlloc.length || salvBonus.length) {
        parsed = { top_actions: salvTop, allocation: salvAlloc, bonus_funds: salvBonus };
        wasPartial = true;
      }
    }

    var html = wasPartial ? '<div style="font-size:10.5px;color:var(--amber);margin-bottom:10px;">⚠️ ผลลัพธ์บางส่วน (คำตอบถูกตัดกลาง) — แสดงเท่าที่กู้ได้</div>' : '';

    var hasNewMoneyData = parsed && ((parsed.top_actions && parsed.top_actions.length) || (parsed.allocation && parsed.allocation.length) || (parsed.bonus_funds && parsed.bonus_funds.length));
    if (parsed && (hasNewMoneyData || parsed.rebalance_plan)) {
      // ─── NEW MONEY mode renderer ───
      if (hasNewMoneyData) {
        if (parsed.top_actions && parsed.top_actions.length) {
          html += '<div style="background:var(--accent-light);border:0.5px solid var(--border2);border-radius:10px;padding:14px;margin-bottom:12px;">';
          html += '<div style="font-size:10px;font-weight:700;color:var(--accent);letter-spacing:0.8px;margin-bottom:12px;">🔥 สิ่งที่ควรทำ 3 อันดับแรก — เดือนนี้</div>';
          parsed.top_actions.slice(0,3).forEach(function(a) {
            var colors = ['var(--red)','var(--accent)','var(--amber)'];
            var c = colors[a.rank-1] || 'var(--text2)';
            // layer 2 = กองใหม่จากข่าว; หรือใช้ field source ที่ prompt ขอ
            var src = a.source || (a.layer === 2 ? 'news' : 'sheet');
            html += '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:10px;">';
            html += '<span style="background:'+c+';color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;margin-top:1px;">'+(Number(a.rank)||'')+'</span>';
            html += '<div style="flex:1;">';
            html += '<div style="font-size:13px;font-weight:500;color:var(--text);">'+esc(a.action)+' '+srcBadge(src)+'</div>';
            html += '<div style="font-size:11px;color:var(--text2);margin-top:2px;">฿'+Number(a.amount||0).toLocaleString()+' — '+esc(a.reason)+'</div>';
            html += '</div></div>';
          });
          html += '</div>';
        }

        // Allocation block — existing portfolio + bonus new funds
        // Build whitelist: prefer allocationPlan (Sheet), fall back to Firebase state.holdings
        var portfolioAssetNames = allocationPlan.length > 0
          ? allocationPlan.map(function(a){ return (a.asset||'').toLowerCase(); })
          : (state.holdings||[]).map(function(h){ return (h.name||h.ticker||'').toLowerCase(); });
        var rawAlloc = (parsed.allocation||[]);
        // Split: items matching pre-computed portfolio → allAlloc; unknowns → bonus
        var allAlloc = rawAlloc.filter(function(a){
          return portfolioAssetNames.indexOf((a.asset||'').toLowerCase()) !== -1;
        });
        var aiUnknowns = rawAlloc.filter(function(a){
          return portfolioAssetNames.indexOf((a.asset||'').toLowerCase()) === -1;
        }).map(function(a){ return Object.assign({}, a, {is_new_fund: true}); });
        var bonusFunds = (parsed.bonus_funds||[]).concat(aiUnknowns);
        var grandTotal = allAlloc.reduce(function(s,x){ return s+(Number(x.amount)||0); },0) + bonusFunds.reduce(function(s,x){ return s+(Number(x.amount)||0); },0);
        if (allAlloc.length) {
          html += '<div style="margin-bottom:12px;">';
          html += '<div style="font-size:10px;font-weight:600;color:var(--text2);letter-spacing:0.5px;margin-bottom:8px;">📊 กองที่มีในพอร์ต <span style="font-weight:400;color:var(--text3);">— จัดสรรตาม Drift/BuyScore ใน Sheet</span></div>';
          allAlloc.forEach(function(a) {
            var pct = grandTotal > 0 ? Math.round((Number(a.amount)||0)/grandTotal*100) : 0;
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:0.5px solid var(--border);">';
            html += '<span style="font-size:12px;color:var(--text);">'+esc(a.asset)+' '+srcBadge('sheet')+'<span style="font-size:10px;color:var(--text3);margin-left:6px;">'+esc(a.reason)+'</span></span>';
            html += '<span style="font-size:13px;font-weight:600;color:var(--accent);">฿'+Number(a.amount||0).toLocaleString()+'<span style="font-size:10px;font-weight:400;color:var(--text3);margin-left:4px;">'+pct+'%</span></span>';
            html += '</div>';
          });
          html += '</div>';
        }
        // Bonus new funds block
        if (bonusFunds.length) {
          html += '<div style="margin-bottom:12px;background:var(--green-bg);border-radius:10px;padding:10px 12px;border:0.5px solid var(--border2);">';
          html += '<div style="font-size:10px;font-weight:600;color:var(--green);letter-spacing:0.5px;margin-bottom:8px;">✨ กองแนะนำเพิ่มเติมจากตลาดปัจจุบัน <span style="font-weight:400;">— AI เสริมจากข่าว ไม่ได้อยู่ใน Sheet</span></div>';
          bonusFunds.forEach(function(a) {
            var pct = grandTotal > 0 ? Math.round((Number(a.amount)||0)/grandTotal*100) : 0;
            html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:7px 0;border-bottom:0.5px solid var(--border);">';
            html += '<div style="flex:1;">';
            html += '<span style="font-size:12px;font-weight:500;color:var(--text);">'+esc(a.asset)+' '+srcBadge('news')+'</span>';
            html += '<span style="display:block;font-size:10px;color:var(--text2);margin-top:2px;">'+esc(a.reason)+'</span>';
            html += '</div>';
            html += '<span style="font-size:13px;font-weight:600;color:var(--green);white-space:nowrap;margin-left:10px;">฿'+Number(a.amount||0).toLocaleString()+'<span style="font-size:10px;font-weight:400;color:var(--text3);margin-left:4px;">'+pct+'%</span></span>';
            html += '</div>';
          });
          html += '</div>';
        }

        // Meta row
        html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;">';
        if (parsed.expected_yoy) {
          var ey = parsed.expected_yoy;
          html += '<div style="background:var(--green-bg);border-radius:8px;padding:6px 10px;font-size:11px;font-weight:500;color:var(--green);">📈 ผลตอบแทนคาดคร่าว ๆ ต่อปี: ระมัดระวัง '+esc(ey.conservative)+' / สมดุล '+esc(ey.base)+' / เชิงรุก '+esc(ey.aggressive)+'<div style="font-size:9.5px;font-weight:400;color:var(--text3);">คำนวณจากสูตรคงที่ ไม่ใช่การพยากรณ์</div></div>';
        }
        if (parsed.risk) {
          html += '<div style="background:var(--orange-bg);border-radius:8px;padding:6px 10px;font-size:11px;font-weight:500;color:var(--orange);">⚠️ Risk: '+esc(parsed.risk.level||'')+'  '+esc(parsed.risk.note||'')+'</div>';
        }
        html += '</div>';

        // Triggers
        if ((parsed.triggers||[]).length) {
          html += '<div style="background:var(--bg);border-radius:8px;padding:8px 10px;">';
          html += '<div style="font-size:10px;font-weight:600;color:var(--text2);margin-bottom:6px;">🎯 TRIGGERS</div>';
          (parsed.triggers).forEach(function(t) {
            html += '<div style="font-size:11px;color:var(--text2);padding:2px 0;">• '+esc(t)+'</div>';
          });
          html += '</div>';
        }

      } else if (parsed.rebalance_plan) {
        // ─── REBALANCE mode renderer ───
        html += '<div style="margin-bottom:12px;">';
        html += '<div style="font-size:10px;font-weight:700;color:var(--text);letter-spacing:0.8px;margin-bottom:10px;">⚖️ REBALANCE PLAN</div>';
        (parsed.rebalance_plan||[]).forEach(function(r) {
          var isSell = r.action === 'sell';
          var bg = isSell ? 'var(--red-bg)' : 'var(--green-bg)';
          var color = isSell ? 'var(--red)' : 'var(--green)';
          var label = isSell ? 'ขาย' : 'ซื้อ';
          html += '<div style="display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:0.5px solid var(--border);">';
          html += '<span style="background:'+bg+';color:'+color+';border-radius:4px;padding:2px 7px;font-size:10px;font-weight:600;min-width:32px;text-align:center;">'+label+'</span>';
          html += '<span style="flex:1;font-size:12px;color:var(--text);">'+esc(r.asset)+'<span style="font-size:10px;color:var(--text3);margin-left:6px;">'+esc(r.reason)+'</span></span>';
          html += '<span style="font-size:13px;font-weight:600;color:'+color+';">฿'+Number(r.amount||0).toLocaleString()+'</span>';
          html += '</div>';
        });
        html += '</div>';
        if (parsed.timeline) html += '<div style="font-size:11px;color:var(--text2);margin-bottom:8px;">⏱ '+esc(parsed.timeline)+'</div>';
        if ((parsed.triggers||[]).length) {
          html += '<div style="background:var(--bg);border-radius:8px;padding:8px 10px;">';
          html += '<div style="font-size:10px;font-weight:600;color:var(--text2);margin-bottom:4px;">🎯 Triggers</div>';
          (parsed.triggers).forEach(function(t){ html += '<div style="font-size:11px;color:var(--text2);">• '+esc(t)+'</div>'; });
          html += '</div>';
        }
      }
    } else if (finishReason === 'MAX_TOKENS') {
      // JSON ถูกตัดกลางทาง — บอกให้ลองใหม่แทนการโชว์ text ขาด ๆ
      html = '<div style="color:var(--amber);">⚠️ คำตอบ AI ยาวเกินจนถูกตัด — กด 🤖 แนะนำเลย อีกครั้ง (มักสำเร็จในครั้งที่ 2)</div>';
    } else {
      // Fallback: แปลง markdown ที่ AI ตอบมาเป็น HTML อ่านได้ แทน text ดิบมีขีด/ดาว
      html = mdLiteToHtml(rawText);
    }

    result.innerHTML = html + aiSourceFooter(true);
    aiCacheSave('p17b_advisor', result.innerHTML);
  } catch(e) {
    var msg = e.message==='no_key'?'ใส่ Gemini Key ก่อน':'วิเคราะห์ไม่ได้: '+e.message;
    showToast(msg);
    result.innerHTML = '<span style="color:var(--red);">'+esc(msg)+'</span>';
  }
  btn.disabled = false; sp.style.display = 'none';
}

// ─── News-driven Portfolio Review (no budget) ───
// Gathers live news per holding via Gemini google_search, concludes ADD/HOLD only.
// SELL/trim is NEVER news-driven — trims surface separately as drift-based rebalancing flags.
async function p17ReviewRun() {
  var btn = document.getElementById('p17revBtn');
  var sp = document.getElementById('p17revSpinner');
  var result = document.getElementById('p17revResult');
  if (!result) return;
  // hide the budget-advisor result so the two don't visually collide
  var bres = document.getElementById('p17bResult'); if (bres) bres.style.display = 'none';
  btn.disabled = true; if (sp) sp.style.display = 'block';
  result.style.display = '';
  result.innerHTML = '<span style="color:var(--text3)">กำลังดึงข่าวของกองที่ถืออยู่และสรุป action...</span>';

  // ─── Build holdings list: Sheet when available, Firebase as fallback ───
  var positions = [];   // { asset, val, driftPct, buyScore }
  var totalVal = 0;
  var src = '';
  if (window._p17SheetData && window._p17SheetData.holdings && window._p17SheetData.holdings.length) {
    src = 'Sheet';
    window._p17SheetData.holdings.forEach(function(h) {
      var val = Number(h['Market Value'] || 0);
      positions.push({
        asset: h['Asset'],
        val: val,
        driftPct: (Number(h['Drift %']) || 0) * 100,        // >0 = overweight (Sheet convention)
        buyScore: Number(h['Buy Priority Score'] || 0)
      });
    });
    totalVal = positions.reduce(function(s,p){ return s+p.val; }, 0);
  } else if (state.holdings && state.holdings.length) {
    src = 'Firebase';
    state.holdings.forEach(function(h) {
      var price = h.livePrice || h.avgPrice || 0;
      var valThb = (h.currency === 'USD') ? h.shares*price*(state.usdThb||33) : h.shares*price;
      positions.push({ asset: h.ticker || h.name, val: valThb, driftPct: null, buyScore: null });
    });
    totalVal = positions.reduce(function(s,p){ return s+p.val; }, 0);
  }

  if (!positions.length) {
    result.innerHTML = '<span style="color:var(--red);">ยังไม่มีข้อมูลพอร์ต — เพิ่ม holding หรือกด 🔄 ดึงข้อมูล Sheet ก่อน</span>';
    btn.disabled = false; if (sp) sp.style.display = 'none'; return;
  }

  // ─── Drift-based trim flags (rebalancing only — NOT news-driven) ───
  // Only computable when Sheet drift exists. These are shown separately and clearly labeled.
  var _lockSkipped = positions.filter(function(p){ return p.driftPct !== null && p.driftPct > 5 && taxLockInfo(p.asset); })
    .map(function(p){ return p.asset; });
  var trimFlags = positions.filter(function(p){ return p.driftPct !== null && p.driftPct > 5 && !taxLockInfo(p.asset); })
    .map(function(p){
      var reduceAmt = totalVal > 0 ? Math.round((p.driftPct/100) * totalVal) : 0;
      return { asset: p.asset, driftPct: p.driftPct, reduceAmt: reduceAmt };
    });

  // ─── Build prompt: weights + explicit per-holding news search, ADD/HOLD only ───
  var lines = [];
  lines.push('คุณคือ CIO ระดับ บลจ. 20 ปี วิเคราะห์เป็นภาษาไทย');
  lines.push('งานนี้: ใช้ Google Search หาข่าว/สภาวะตลาดล่าสุดของแต่ละหลักทรัพย์ที่ผู้ใช้ "ถืออยู่จริง" ด้านล่าง แล้วสรุปว่าควร เพิ่ม (ADD) หรือ ถือ (HOLD) เรียงตามผลกระทบต่อพอร์ต');
  lines.push('');
  lines.push('พอร์ตปัจจุบัน (มูลค่ารวม ฿' + Math.round(totalVal).toLocaleString() + ', แหล่งข้อมูล: ' + src + '):');
  positions.forEach(function(p) {
    var w = totalVal > 0 ? (p.val/totalVal*100).toFixed(1) : '0';
    lines.push('- ' + p.asset + ' (น้ำหนัก ' + w + '%' + (p.driftPct !== null ? ', drift ' + p.driftPct.toFixed(1) + '%' : '') + ')');
  });
  lines.push('');
  lines.push('กฎเด็ดขาด:');
  lines.push('- ห้ามแนะนำ "ขาย/ลด/SELL/trim" จากข่าวเด็ดขาด — แนะได้แค่ ADD หรือ HOLD เท่านั้น');
  lines.push('- การลดสัดส่วนเป็นเรื่อง rebalancing ที่ระบบคำนวณแยกเอง ไม่ใช่หน้าที่ของการรีวิวข่าว');
  lines.push('- แนะนำเฉพาะหลักทรัพย์ที่ "อยู่ในพอร์ตด้านบน" เท่านั้น ห้ามเสนอตัวใหม่');
  lines.push('- reason ต้องอ้างอิงข่าว/เหตุการณ์จริงที่ค้นเจอ สั้น ๆ ไม่เกิน 12 คำ');
  lines.push('- ranked ตามผลกระทบต่อพอร์ตจริง (น้ำหนักมาก + ข่าวแรง = อันดับสูง)');
  lines.push('- ตอบไม่เกิน 5 actions ที่สำคัญที่สุด — reason และ headline อย่างละไม่เกิน 12 คำ');
  lines.push('- ตอบ JSON ให้ครบและปิดวงเล็บให้สมบูรณ์เสมอ');
  lines.push('');
  lines.push('ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น ห้ามใช้ code fence:');
  lines.push('{"reviewed_at":"YYYY-MM-DD","actions":[{"rank":1,"asset":"ชื่อกองที่ถืออยู่","stance":"ADD/HOLD","reason":"อ้างข่าวจริงสั้นๆ","headline":"พาดหัวข่าวที่อ้าง"}],"market_note":"สรุปภาพรวมตลาด 1 ประโยค"}');
  var prompt = lines.join('\n');

  try {
    var d = await callGemini({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: 4000, temperature: 0.3 }
    });
    var text = '';
    var finishReason = (d.candidates && d.candidates[0]) ? d.candidates[0].finishReason : '';
    if (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) {
      var part = d.candidates[0].content.parts.find(function(p){ return p.text; });
      if (part) text = part.text;
    }
    var parsed = safeParseJSON(text);

    // Salvage: if Gemini truncated mid-JSON, recover the actions that DID complete.
    if (!parsed && text) {
      var recovered = salvageJsonArrayByKey(text, 'actions');
      if (recovered.length) parsed = { actions: recovered };
    }

    // ─── Guard: drop any AI action that isn't a real holding or sneaks in a SELL ───
    var ownedNames = positions.map(function(p){ return String(p.asset||'').toUpperCase(); });
    var actions = [];
    if (parsed && Array.isArray(parsed.actions)) {
      actions = parsed.actions.filter(function(a) {
        var st = String(a.stance||'').toUpperCase();
        if (st !== 'ADD' && st !== 'HOLD') return false;           // enforce ADD/HOLD only
        return ownedNames.indexOf(String(a.asset||'').toUpperCase()) !== -1; // must be owned
      });
    }

    var html = '';
    if (!parsed || !actions.length) {
      if (finishReason === 'MAX_TOKENS') {
        html += '<div style="color:var(--amber);">⚠️ AI ดึงข่าวเยอะเกินไปจนข้อมูลถูกตัด — กดอีกครั้งเพื่อลองใหม่ (มักสำเร็จในครั้งที่ 2)</div>';
      } else {
        html += '<div style="color:var(--text2);">AI ไม่สามารถสรุป action จากข่าวได้รอบนี้ — ลองใหม่อีกครั้ง หรือกองที่ถืออาจไม่มีข่าวเด่นช่วงนี้</div>';
      }
      if (text) html += '<div style="font-size:10px;color:var(--text3);margin-top:8px;white-space:pre-wrap;">'+esc(String(text).slice(0,300))+'</div>';
    } else {
      if (parsed.market_note) {
        html += '<div style="font-size:11px;color:var(--text2);background:var(--bg);border-radius:8px;padding:8px 10px;margin-bottom:12px;">📰 '+esc(parsed.market_note)+'</div>';
      }
      html += '<div style="font-size:10px;font-weight:700;color:var(--accent);letter-spacing:0.8px;margin-bottom:10px;">🔍 ACTION จากข่าว — เรียงตามผลกระทบ</div>';
      actions.slice(0,6).forEach(function(a) {
        var isAdd = String(a.stance).toUpperCase() === 'ADD';
        var c = isAdd ? 'var(--accent)' : 'var(--text3)';
        var label = isAdd ? 'เพิ่ม' : 'ถือ';
        html += '<div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:10px;">';
        html += '<span style="background:'+c+';color:#fff;border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700;flex-shrink:0;margin-top:1px;">'+label+'</span>';
        html += '<div style="flex:1;">';
        html += '<div style="font-size:13px;font-weight:600;color:var(--text);">'+esc(a.asset||'')+' '+srcBadge('news')+'</div>';
        html += '<div style="font-size:11px;color:var(--text2);margin-top:2px;">'+esc(a.reason||'')+'</div>';
        if (a.headline) html += '<div style="font-size:10px;color:var(--text3);margin-top:2px;">↳ '+esc(a.headline)+'</div>';
        html += '</div></div>';
      });
    }

    // ─── Rebalancing trims (drift-based, shown separately so news never triggers a sell) ───
    if (trimFlags.length) {
      html += '<div style="border-top:0.5px dashed var(--border);margin-top:12px;padding-top:12px;">';
      html += '<div style="font-size:10px;font-weight:700;color:var(--amber);letter-spacing:0.8px;margin-bottom:8px;">⚖️ REBALANCING — ลดเฉพาะตอนปรับสัดส่วน (ไม่ใช่จากข่าว)</div>';
      trimFlags.forEach(function(t) {
        html += '<div style="font-size:11px;color:var(--text2);margin-bottom:4px;">'+esc(t.asset)+' '+srcBadge('sheet')+' เกินเป้า '+t.driftPct.toFixed(1)+'% — พิจารณาลด ~฿'+t.reduceAmt.toLocaleString()+' เมื่อ rebalance</div>';
      });
      if (_lockSkipped.length) {
        html += '<div style="font-size:10px;color:var(--text3);margin-top:4px;">🔒 ข้าม '+esc(_lockSkipped.join(', '))+' — ติดเงื่อนไข SSF/RMF ขายไม่ได้ (ปรับสัดส่วนด้วยการซื้อกองอื่นแทน)</div>';
      }
      html += '</div>';
    } else if (src === 'Firebase') {
      html += '<div style="font-size:10px;color:var(--text3);margin-top:10px;border-top:0.5px dashed var(--border);padding-top:8px;">ℹ️ ไม่มีข้อมูล drift (ยังไม่ได้ sync Sheet) — ส่วนลดสัดส่วน rebalancing จะแสดงเมื่อกด 🔄 ดึงข้อมูล Sheet</div>';
    }

    result.innerHTML = html + aiSourceFooter(true);
    if (typeof aiCacheSave === 'function') aiCacheSave('p17_review', result.innerHTML);
  } catch(e) {
    var msg = e.message==='no_key' ? 'ใส่ Gemini Key ก่อน' : 'รีวิวไม่ได้: '+e.message;
    showToast(msg);
    result.innerHTML = '<span style="color:var(--red);">'+esc(msg)+'</span>';
  }
  btn.disabled = false; if (sp) sp.style.display = 'none';
}

// undo = true → ส่ง UNDO_BUY/UNDO_SELL เพื่อย้อน trade เดิม (ตอนแก้ไข/ลบ trade)
async function p17PostTradeToSheet(trade, undo) {
  const base = window._PORTFOLIO_SHEET_URL || localStorage.getItem('folio_PORTFOLIO_SHEET_URL') || '';
  if (!base) return;
  const params = new URLSearchParams({
    action: 'update_holding',
    asset: trade.asset,
    tradeType: (undo ? 'UNDO_' : '') + trade.type,
    qty: String(trade.qty),
    price: String(trade.price),
    currency: trade.currency || 'THB',
    broker: trade.broker || ''
  });
  try {
    const res = await fetch(base + '?' + params.toString(), { redirect: 'follow', mode: 'cors' });
    const result = await res.json();
    if (!result.ok) {
      showToast(`⚠️ Sheet sync ล้มเหลว: ${result.error || 'ไม่ทราบสาเหตุ'}`);
    } else if (result.row === -1) {
      showToast(`⚠️ ไม่พบ "${trade.asset}" ใน Portfolio_NAV — Cost Basis ในชีตยังไม่อัปเดต`);
    } else if (result.row == null) {
      // Apps Script รุ่นเก่าตอบแค่ {ok:true} ไม่บอกแถว — ไม่ใช่ "ไม่พบ"
      showToast(`✅ ส่ง ${trade.asset} ไป Sheet แล้ว (อัปเดต Apps Script ใน ⚙️ เพื่อดูผลละเอียด)`);
    } else {
      const qtyTxt = result.newQty != null ? Number(result.newQty).toLocaleString('th-TH', { maximumFractionDigits: 6 }) : '';
      const avgTxt = result.newAvgCost != null ? Number(result.newAvgCost).toLocaleString('th-TH', { maximumFractionDigits: 4 }) : '';
      showToast(`✅ Sync Sheet แล้ว: ${trade.asset} Qty ${qtyTxt} @ ฿${avgTxt}`);
    }
  } catch(e) {
    showToast(`⚠️ Sync Sheet ไม่สำเร็จ: ${e.message}`);
    throw e;
  }
}

function p17CopyAppScript() {
  const code = `function doGet(e) {
  // App ส่ง update_holding มาทาง GET query string (ไม่ใช่ POST body) เพื่อเลี่ยงปัญหา CORS preflight
  if (e.parameter && e.parameter.action === 'update_holding') {
    return handleUpdateHolding(e.parameter);
  }
  if (e.parameter && e.parameter.action === 'clear_append') {
    return handleClearAppend(e.parameter);
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const navSheet = ss.getSheetByName('Portfolio_NAV');
  const navData = navSheet.getDataRange().getValues();
  const navHeaders = navData[0];
  const holdings = navData.slice(1).filter(r => r[0]).map(r => {
    const obj = {}; navHeaders.forEach((h, i) => obj[h] = r[i]); return obj;
  });
  const inputSheet = ss.getSheetByName('Inputs');
  const inputData = inputSheet.getDataRange().getValues();
  const inputs = {};
  inputData.forEach(r => { if (r[0]) inputs[r[0]] = r[1]; });
  const epSheet = ss.getSheetByName('Execution_Plan');
  const epData = epSheet.getDataRange().getValues();
  const epHeaders = epData[0];
  const executionPlan = epData.slice(1).filter(r => r[0]).map(r => {
    const obj = {}; epHeaders.forEach((h, i) => obj[h] = r[i]); return obj;
  });
  const result = { timestamp: new Date().toISOString(), inputs, holdings, executionPlan };
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    if (payload.action === 'update_holding') return handleUpdateHolding(payload);
    return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:err.message})).setMimeType(ContentService.MimeType.JSON);
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ล้างแท็บ (สร้างใหม่ถ้ายังไม่มี) แล้วเขียน headers + rows — ใช้กับปุ่มสำรองบิลไป Sheet
function handleClearAppend(p) {
  try {
    const d = JSON.parse(p.data || '{}');
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(p.tab) || ss.insertSheet(p.tab);
    sh.clearContents();
    const rows = [d.headers || []].concat(d.rows || []);
    if (rows.length && rows[0].length) sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    return json({ok:true, rows:(d.rows || []).length});
  } catch(err) {
    return json({ok:false, error:err.message});
  }
}

// payload: {asset, platform/broker, tradeType, qty, price}
// SET = ตั้งค่า qty/avgCost ตรง ๆ (ใช้ตอนเพิ่ม/แก้ไข holding เอง)
// BUY/SELL = ปรับตามธุรกรรม (ใช้ตอนบันทึก trade)
// UNDO_BUY/UNDO_SELL = ย้อน BUY/SELL เดิม (ใช้ตอนแก้ไข/ลบ trade)
// ตอบกลับ {ok, row} — row = -1 ถ้าไม่พบ asset
function handleUpdateHolding(payload) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Portfolio_NAV');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const assetCol = headers.indexOf('Asset');
    const qtyCol = headers.indexOf('Qty');
    const avgCostCol = headers.indexOf('Avg Cost / Unit');
    const brokerCol = headers.indexOf('Broker') !== -1 ? headers.indexOf('Broker') : headers.indexOf('Platform') !== -1 ? headers.indexOf('Platform') : -1;
    const assetLower = String(payload.asset).trim().toLowerCase();
    const brokerLower = String(payload.broker || payload.platform || '').toLowerCase();
    // ชื่อตรงเป๊ะก่อน — ชื่อที่แค่มีคำนี้อยู่ (เช่น K-CHINA ใน K-CHINA-RMF) ใช้เฉพาะเมื่อมีแถวเดียว
    const exact = [], partial = [];
    for (let i = 1; i < data.length; i++) {
      const a = String(data[i][assetCol]).trim().toLowerCase();
      if (a === assetLower) exact.push(i);
      else if (assetLower && a.includes(assetLower)) partial.push(i);
    }
    const cands = exact.length ? exact : (partial.length === 1 ? partial : []);
    let matchRow = cands.length ? cands[0] : -1;
    if (brokerCol !== -1 && brokerLower) {
      const byBroker = cands.filter(i => String(data[i][brokerCol]).toLowerCase() === brokerLower);
      if (byBroker.length) matchRow = byBroker[0];
    }
    const tradeQty = Number(payload.qty) || 0;
    const tradePrice = Number(payload.price) || 0;
    if (matchRow !== -1) {
      const i = matchRow;
      const oldQty = Number(data[i][qtyCol]) || 0;
      const oldAvg = Number(data[i][avgCostCol]) || 0;
      if (payload.tradeType === 'SET') {
        sheet.getRange(i + 1, qtyCol + 1).setValue(tradeQty);
        sheet.getRange(i + 1, avgCostCol + 1).setValue(tradePrice);
      } else if (payload.tradeType === 'BUY') {
        const newQty = oldQty + tradeQty;
        const newAvg = newQty > 0 ? (oldQty * oldAvg + tradeQty * tradePrice) / newQty : tradePrice;
        sheet.getRange(i + 1, qtyCol + 1).setValue(newQty);
        sheet.getRange(i + 1, avgCostCol + 1).setValue(parseFloat(newAvg.toFixed(4)));
      } else if (payload.tradeType === 'SELL') {
        const newQty = Math.max(0, oldQty - tradeQty);
        sheet.getRange(i + 1, qtyCol + 1).setValue(newQty);
      } else if (payload.tradeType === 'UNDO_BUY') {
        const newQty = Math.max(0, oldQty - tradeQty);
        const newAvg = newQty > 0 ? Math.max(0, (oldQty * oldAvg - tradeQty * tradePrice) / newQty) : oldAvg;
        sheet.getRange(i + 1, qtyCol + 1).setValue(newQty);
        sheet.getRange(i + 1, avgCostCol + 1).setValue(parseFloat(newAvg.toFixed(4)));
      } else if (payload.tradeType === 'UNDO_SELL') {
        sheet.getRange(i + 1, qtyCol + 1).setValue(oldQty + tradeQty);
      }
      const newQty = Number(sheet.getRange(i + 1, qtyCol + 1).getValue()) || 0;
      const newAvgCost = Number(sheet.getRange(i + 1, avgCostCol + 1).getValue()) || 0;
      return json({ok:true, row:i + 1, newQty:newQty, newAvgCost:newAvgCost});
    } else if (payload.tradeType === 'SET') {
      // ไม่พบแถวเดิม — เป็น holding ใหม่ เพิ่มแถวท้ายตาราง
      const newRow = new Array(headers.length).fill('');
      newRow[assetCol] = payload.asset;
      newRow[qtyCol] = tradeQty;
      newRow[avgCostCol] = tradePrice;
      if (brokerCol !== -1) newRow[brokerCol] = payload.broker || payload.platform || '';
      sheet.appendRow(newRow);
      return json({ok:true, row:sheet.getLastRow(), newQty:tradeQty, newAvgCost:tradePrice});
    }
    return json({ok:true, row:-1});
  } catch(err) {
    return json({ok:false, error:err.message});
  }
}`;
  navigator.clipboard.writeText(code).then(() => showToast('คัดลอก AppScript Code แล้ว ✓'));
}

const CFG_KEYS = {
  'cfg-proxy':    'PROXY_URL',
  'cfg-sheets':   'SHEETS_URL',
  'cfg-nav-sheet': 'NAV_SHEET_URL',
  'cfg-portfolio-sheet': 'PORTFOLIO_SHEET_URL',
  'cfg-fb-apikey':'FB_API_KEY',
  'cfg-fb-projectid':'FB_PROJECT_ID',
  'cfg-fb-authdomain':'FB_AUTH_DOMAIN',
  'cfg-fb-appid': 'FB_APP_ID',
};

// URL keys that are stored in Firestore (not API keys)
const URL_FIELDS = ['PROXY_URL','SHEETS_URL','NAV_SHEET_URL','PORTFOLIO_SHEET_URL'];

function _applyUrlsToWindow(urls) {
  window._PROXY_URL    = urls.PROXY_URL    || SET_PROXY;
  window._SHEETS_URL   = urls.SHEETS_URL   || SHEETS_URL;
  window._NAV_SHEET_URL = urls.NAV_SHEET_URL || NAV_SHEET_DEFAULT;
  window._PORTFOLIO_SHEET_URL = urls.PORTFOLIO_SHEET_URL || PORTFOLIO_SHEET_DEFAULT;
  // Also update localStorage as offline cache
  URL_FIELDS.forEach(k => {
    if (urls[k]) localStorage.setItem('folio_' + k, urls[k]);
  });
}

function _applyUrlsToInputs(urls) {
  const map = {
    'cfg-proxy': 'PROXY_URL',
    'cfg-sheets': 'SHEETS_URL',
    'cfg-nav-sheet': 'NAV_SHEET_URL',
    'cfg-portfolio-sheet': 'PORTFOLIO_SHEET_URL',
  };
  Object.entries(map).forEach(([elId, key]) => {
    const el = document.getElementById(elId);
    if (el && urls[key]) el.value = urls[key];
  });
  // Show built-in default in the Portfolio field when nothing is stored yet
  const pf = document.getElementById('cfg-portfolio-sheet');
  if (pf && !pf.value) pf.value = PORTFOLIO_SHEET_DEFAULT;
}

async function loadSettings() {
  // 1. Load API keys from localStorage (never go to Firestore)
  Object.entries(CFG_KEYS).forEach(([inputId, storageKey]) => {
    if (URL_FIELDS.includes(storageKey)) return; // handled separately
    const val = localStorage.getItem('folio_' + storageKey) || '';
    const el = document.getElementById(inputId);
    if (el) el.value = val;
  });
  ['AV','GEMINI'].forEach(svc => {
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById(`cfg-${svc.toLowerCase()}-${i}`);
      if (el) el.value = localStorage.getItem(`folio_${svc}_KEY_${i}`) || '';
    }
  });

  // 2. Load URLs: try Firestore first, fallback to localStorage
  const localUrls = {};
  URL_FIELDS.forEach(k => { localUrls[k] = localStorage.getItem('folio_' + k) || ''; });
  _applyUrlsToWindow(localUrls);
  _applyUrlsToInputs(localUrls);

  // ค่าใน Firestore มาทีหลัง — ไม่ await เพื่อไม่ให้แอปค้างรอ Firebase (เช่นตอน offline)
  whenFB().then(FB => FB.getAll('settings')).then(docs => {
    const urlDoc = docs.find(d => d.id === 'urls');
    if (!urlDoc) return;
    const before = window._PORTFOLIO_SHEET_URL;
    _applyUrlsToWindow(urlDoc);
    _applyUrlsToInputs(urlDoc);
    // URL ของ Sheet ต่างจากที่ใช้ดึงตอนเปิดแอป → ดึงใหม่จาก URL ที่ถูกต้อง
    if (window._PORTFOLIO_SHEET_URL !== before) autoFetchNavSheet();
  }).catch(() => {});
}

(async function _loadRiskProfile() {
  try {
    var docs = await (await whenFB()).getAll('settings');
    var prof = docs.find(function(d) { return d.id === 'profile'; });
    if (prof && prof.riskLevel) {
      _p17bRiskLevel = prof.riskLevel;
      localStorage.setItem('folio_riskProfile', prof.riskLevel);
      p17bApplyRiskUi(prof.riskLevel);
    }
    var budgetDoc = docs.find(function(d) { return d.id === 'budget'; });
    if (budgetDoc && typeof budgetDoc.income === 'number') {
      state.budgetIncome = budgetDoc.income;
      localStorage.setItem('folio_budgetIncome', String(budgetDoc.income));
      renderBudget();
    }
  } catch(e) {}
})();

async function saveSettings() {
  // Save API keys to localStorage only
  Object.entries(CFG_KEYS).forEach(([inputId, storageKey]) => {
    if (URL_FIELDS.includes(storageKey)) return; // handled separately
    const el = document.getElementById(inputId);
    if (el) localStorage.setItem('folio_' + storageKey, el.value.trim());
  });
  ['AV','GEMINI'].forEach(svc => {
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById(`cfg-${svc.toLowerCase()}-${i}`);
      if (el) localStorage.setItem(`folio_${svc}_KEY_${i}`, el.value.trim());
    }
  });

  // Save URLs to both Firestore + localStorage
  const urlMap = {
    'cfg-proxy': 'PROXY_URL',
    'cfg-sheets': 'SHEETS_URL',
    'cfg-nav-sheet': 'NAV_SHEET_URL',
    'cfg-portfolio-sheet': 'PORTFOLIO_SHEET_URL',
  };
  const urlData = {};
  Object.entries(urlMap).forEach(([elId, key]) => {
    const el = document.getElementById(elId);
    const val = el ? el.value.trim() : '';
    urlData[key] = val;
    localStorage.setItem('folio_' + key, val);
  });
  try {
    await window.FB.setDoc('settings', 'urls', urlData);
  } catch(e) {
    showToast('⚠️ บันทึก URL ลง Firebase ไม่ได้ (เก็บ local แล้ว)');
  }

  _applyUrlsToWindow(urlData);
  Object.keys(activeKeyIndex).forEach(k => activeKeyIndex[k] = 0);
  showToast('บันทึกเรียบร้อยแล้ว ✓');
  renderApiStatus();
}

function renderApiStatus() {
  const el = document.getElementById('apiStatus');
  if (!el) return;
  const checks = [
    { name: 'Gemini AI', icon: '🤖', has: getKeys('GEMINI').length > 0, keys: getKeys('GEMINI').length },
    { name: 'Alpha Vantage', icon: '📈', has: getKeys('AV').length > 0, keys: getKeys('AV').length },
    { name: 'SET Proxy', icon: '🔌', has: true, keys: 1 },
    { name: 'Google Sheets', icon: '📊', has: true, keys: 1 },
    { name: 'NAV Sheet', icon: '📈', has: !!(window._NAV_SHEET_URL || NAV_SHEET_DEFAULT), keys: 1 },
    { name: 'Portfolio Sheet', icon: '📊', has: !!(window._PORTFOLIO_SHEET_URL || localStorage.getItem('folio_PORTFOLIO_SHEET_URL')), keys: 1 },
  ];
  el.innerHTML = checks.map(c => `
    <div style="text-align:center;padding:10px 6px;background:${c.has?'var(--green-bg)':'var(--bg)'};border-radius:8px;border:0.5px solid ${c.has?'#BBF7D0':'var(--border)'};">
      <div style="font-size:16px;">${c.icon}</div>
      <div style="font-size:10px;font-weight:500;color:${c.has?'var(--green)':'var(--text3)'};margin-top:3px;">${c.name}</div>
      <div style="font-size:9px;color:${c.has?'var(--green)':'var(--text3)'};">${c.has ? (c.keys > 1 ? `✓ ${c.keys} keys` : '✓ พร้อม') : 'ยังไม่ได้ใส่'}</div>
    </div>`).join('');
}

async function testConnections() {
  showToast('กำลังทดสอบ...');
  const proxy = localStorage.getItem('folio_PROXY_URL') || 'https://folio-proxy.ojo0308.workers.dev';
  try {
    const r = await fetch(`${proxy}/?ticker=PTT.BK`);
    const d = await r.json();
    showToast(d.price ? `✓ SET Proxy OK -- PTT.BK ฿${d.price}` : '✗ SET Proxy ผิดปกติ');
  } catch { showToast('✗ SET Proxy เชื่อมต่อไม่ได้'); }
  setTimeout(async () => {
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
      const d = await r.json();
      showToast(d.bitcoin ? `✓ CoinGecko OK -- BTC $${d.bitcoin.usd.toLocaleString()}` : '✗ CoinGecko ผิดปกติ');
    } catch { showToast('✗ CoinGecko เชื่อมต่อไม่ได้'); }
  }, 2000);
}

// --- Google Sheets NAV Fetch ---
// ใช้ Portfolio Sheet (folio_PORTFOLIO_SHEET_URL) เป็น source หลัก
// รองรับ 2 formats: {FUND_NAME:{nav}} (NAV Sheet) หรือ {holdings:[{Asset,Price}]} (Portfolio Sheet)
// ─── Portfolio Sheet = แหล่งข้อมูลจริงหนึ่งเดียว ───────────────────────────────
// ก่อนหน้านี้หน้า "ภาพรวม" คำนวณ มูลค่า = หน่วยใน Firebase x ราคาจาก Sheet
// ส่วนการ์ด Analyzer อ่านคอลัมน์ Market Value จาก Sheet ตรง ๆ → ตัวเลขสองหน้าไม่ตรงกัน
// ตอนนี้ทั้งสองหน้าอ่าน payload ก้อนเดียวกันผ่าน applySheetData()

function sheetAssetKey(name) {
  return String(name == null ? '' : name).trim().toUpperCase().replace(/\s+/g, ' ');
}

// หา row ใน Sheet ที่ตรงกับ holding — exact match ก่อน แล้วค่อย fuzzy ด้วย token แรก
// entries = ทุกแถวของ Sheet (ไม่รวมแถวชื่อซ้ำเป็นแถวเดียว) — แถวที่ holding ตัวก่อนหน้าจับไปแล้วมี claimed = true
// กัน holding สองตัวชี้ row เดียวกันจนมูลค่าซ้ำ
// fuzzy จะยอมรับเฉพาะเมื่อ token แรกชี้ไป row เดียวเท่านั้น ("K CHINA SSF" กับ "K CHINA A" → ไม่เดา)
function matchSheetRow(h, entries) {
  const free = entries.filter(e => !e.claimed);
  const broker = String(h.broker || '').trim().toLowerCase();
  // ชื่อซ้ำหลายแถว (เช่น SCBNDQ(A) ที่ InnovestX กับ KBank) → เลือกแถวที่ Platform ตรงกับ broker ของ holding
  const pick = hits => {
    if (!hits.length) return null;
    if (broker) {
      const b = hits.find(e => e.platform === broker)
        || hits.find(e => e.platform && (e.platform.includes(broker) || broker.includes(e.platform)));
      if (b) return b;
    }
    return hits[0];
  };
  const candidates = [h.name, h.ticker, (h.ticker || '').replace(/_/g, ' ')];
  for (let i = 0; i < candidates.length; i++) {
    const k = sheetAssetKey(candidates[i]);
    const hit = k ? pick(free.filter(e => e.key === k)) : null;
    if (hit) return hit;
  }
  for (let i = 0; i < candidates.length; i++) {
    const first = sheetAssetKey(candidates[i]).split(' ')[0];
    if (!first) continue;
    const keys = [...new Set(free.filter(e => e.key.split(' ')[0] === first).map(e => e.key))];
    if (keys.length === 1) return pick(free.filter(e => e.key === keys[0]));
  }
  return null;
}

// อ่าน payload จาก Sheet → เขียนราคา/มูลค่าลง state.holdings + สรุปยอดรวมลง state.sheetTotals
// รองรับ 2 format: Portfolio Sheet {holdings:[{Asset,Price,Market Value,...}]} และ NAV Sheet {FUND:{nav}}
// NAV Sheet ให้แค่ราคา ไม่มียอดรวม → state.sheetTotals จะไม่ถูกตั้ง และแอปกลับไปคำนวณเองเหมือนเดิม
function applySheetData(data) {
  if (data && data.inputs) state.sheetInputs = data.inputs;
  const rows = (data && Array.isArray(data.holdings)) ? data.holdings : null;
  if (rows) window._p17SheetData = data;

  // เก็บทุกแถวแยกกัน — เดิมใช้ object ที่ key เป็นชื่อ แถวชื่อซ้ำ (คนละ broker) จึงทับกันเหลือแถวเดียว
  const entries = [];
  const addEntry = r => {
    const key = sheetAssetKey(r['Asset']);
    if (key) entries.push({ key, row: r, platform: String(r['Platform'] || r['Broker'] || '').trim().toLowerCase(), claimed: false });
  };
  if (rows) {
    rows.forEach(addEntry);
  } else if (data) {
    Object.keys(data).forEach(k => {
      if (data[k] && data[k].nav) addEntry({ Asset: k, Price: Number(data[k].nav) });
    });
  }

  let updated = 0;
  state.holdings.forEach(h => {
    delete h._sheetValue; delete h._sheetPL; delete h._sheetMatched;
    const entry = matchSheetRow(h, entries);
    if (!entry) { h.value = Math.round(valueThb(h)); return; }
    entry.claimed = true;
    const row = entry.row;
    h._sheetMatched = row['Asset'];
    const price = Number(row['Price']) || 0;
    if (price > 0) {
      // crypto: Sheet เก็บราคาเป็นบาท — แปลงกลับเป็น USD ถ้า holding ถือเป็นสกุล USD
      h.livePrice = (h.type === 'crypto' && h.currency === 'USD' && state.usdThb > 0)
        ? price / state.usdThb : price;
      h.change = h.avgPrice ? ((h.livePrice - h.avgPrice) / h.avgPrice) * 100 : 0;
      updated++;
    }
    const mv = Number(row['Market Value']);
    if (isFinite(mv) && mv > 0) h._sheetValue = mv;
    const pl = Number(row['Unrealized P/L']);
    if (isFinite(pl)) h._sheetPL = pl;
    h.value = Math.round(valueThb(h));
  });

  if (rows && rows.length) {
    const totalValue = rows.reduce((t, r) => t + (Number(r['Market Value']) || 0), 0);
    const totalPL    = rows.reduce((t, r) => t + (Number(r['Unrealized P/L']) || 0), 0);
    state.sheetTotals = {
      totalValue: totalValue,
      totalPL: totalPL,
      totalCost: totalValue - totalPL,
      count: rows.length,
      syncedAt: Date.now(),
      // asset ที่มีใน Sheet แต่ไม่มี holding ในแอป — มูลค่าถูกนับ แต่กราฟสัดส่วนจะไม่เห็น
      unmatchedSheet: entries.filter(e => !e.claimed).map(e => e.row['Asset']),
      // holding ในแอปที่จับคู่กับ Sheet ไม่ได้ — ชื่อน่าจะสะกดไม่ตรงกัน
      unmatchedLocal: state.holdings.filter(h => !h._sheetMatched).map(h => h.name || h.ticker)
    };
    saveSheetTotalsCache();
  }
  return { updated: updated, rows: rows ? rows.length : 0 };
}

// เก็บยอดรวมจาก Sheet ไว้ 1 วัน เพื่อให้ตัวเลขไม่กระโดดตอนเปิดแอปใหม่ก่อน sync เสร็จ
function saveSheetTotalsCache() {
  try {
    localStorage.setItem('folio_sheet_totals', JSON.stringify({
      date: todayISO(), totals: state.sheetTotals
    }));
  } catch(e) {}
}
function loadSheetTotalsCache() {
  try {
    const raw = localStorage.getItem('folio_sheet_totals');
    if (!raw) return false;
    const c = JSON.parse(raw);
    if (c.date !== todayISO() || !c.totals) return false;
    state.sheetTotals = c.totals;
    return true;
  } catch(e) { return false; }
}

// เติมแถวสรุปของการ์ด Portfolio Analyzer จาก state.sheetTotals ชุดเดียวกับ hero
function p17RenderSummaryRow() {
  const st = state.sheetTotals;
  const data = window._p17SheetData;
  if (!st || !st.count || !data) return;
  const execPlan = data.executionPlan || [];
  const monthlyBuy = execPlan.reduce((t, r) => t + (Number(r['Suggested Monthly Buy (THB)']) || 0), 0);
  const tvEl = document.getElementById('p17TotalValue');
  const plEl = document.getElementById('p17UnrealPL');
  const acEl = document.getElementById('p17AssetCount');
  const mbEl = document.getElementById('p17MonthlyBuy');
  if (tvEl) tvEl.textContent = '฿' + Math.round(st.totalValue).toLocaleString();
  if (plEl) {
    plEl.textContent = (st.totalPL >= 0 ? '+' : '') + '฿' + Math.round(st.totalPL).toLocaleString();
    plEl.style.color = st.totalPL >= 0 ? 'var(--green)' : 'var(--red)';
  }
  if (acEl) acEl.textContent = st.count + ' รายการ';
  if (mbEl) mbEl.textContent = '฿' + Math.round(monthlyBuy).toLocaleString();
  const sr = document.getElementById('p17SummaryRow');
  const em = document.getElementById('p17Empty');
  if (sr) sr.style.display = 'grid';
  if (em) em.style.display = 'none';
  const ls = document.getElementById('p17LastSync');
  if (ls && window._p17SyncTime) ls.textContent = 'อัพเดตล่าสุด ' + window._p17SyncTime + ' น. · ' + st.count + ' holdings';
  p17RenderExecTable();
}

async function fetchFromNavSheet(manual = false) {
  const url = window._PORTFOLIO_SHEET_URL || localStorage.getItem('folio_PORTFOLIO_SHEET_URL') ||
              window._NAV_SHEET_URL || NAV_SHEET_DEFAULT;
  if (!url) { if (manual) showToast('ยังไม่ได้ใส่ Portfolio Sheet URL ใน ⚙️ ตั้งค่า'); return; }
  if (manual) showToast('กำลังดึงราคาจาก Google Sheet...');
  try {
    const resp = await fetch(url, { redirect: 'follow', mode: 'cors' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    if (data.error) throw new Error(data.error);

    const res = applySheetData(data);

    window._p17SyncTime = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    savePriceCache();
    updatePortfolioSummary();
    renderHoldings();
    renderAllocation(); initPhase9(); initPhase10(); initPhase11(); initPhase12(); p14TrackDrawdown();
    p17RenderSummaryRow();
    const tc = document.getElementById('todayChange');
    if (tc) { tc.textContent = 'ดึงจาก Sheet เมื่อ ' + window._p17SyncTime + ' น.'; tc.style.color = 'var(--text3)'; }
    if (manual) showToast('อัพเดต ' + res.updated + ' รายการจาก Google Sheet ✓');
  } catch(e) {
    if (manual) showToast('ดึงราคาจาก Sheet ไม่ได้: ' + e.message);
  }
}

// Auto-fetch from sheet on load (after holdings ready)
async function autoFetchNavSheet() {
  if (!window._holdingsLoaded) {
    await new Promise(r => { const t = setInterval(() => { if (window._holdingsLoaded) { clearInterval(t); r(); } }, 200); setTimeout(() => { clearInterval(t); r(); }, 6000); });
  }
  await fetchFromNavSheet(false);
}

function testFirebaseWrite() {
  if (!window.FB) { showToast('Firebase ยังไม่พร้อม'); return; }
  showToast('กำลังทดสอบ Firebase...');
  window.FB.add('_test', { t: Date.now() }).then(ref => {
    window.FB.del('_test', ref.id);
    showToast('Firebase ✅ เชื่อมต่อสำเร็จ');
  }).catch(e => {
    showToast('Firebase ❌ ' + e.message);
  });
}

function copyFirebaseRules() {
  const rules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/nattapat/{document=**} {
      allow read, write: if true;
    }
  }
}`;
  navigator.clipboard.writeText(rules).then(() => showToast('คัดลอก Rules แล้ว ✓'));
}

// --- YoY Snapshot (Time-Weighted baseline) ---
function yoySnapshotKey() { return 'folio_yoy_snapshot_' + new Date().getFullYear(); }

function yoyGetSnapshot() {
  try { return JSON.parse(localStorage.getItem(yoySnapshotKey()) || 'null'); } catch(e) { return null; }
}

// baseline ของปี = สภาพพอร์ต ณ ต้นปี เก็บสองค่า
//   snapshotCost (C0) = ทุน ณ ต้นปี   ใช้วัดว่าหลังจากนั้นใส่เงินใหม่เข้าไปเท่าไร
//   baseValue    (V0) = มูลค่า ณ ต้นปี ใช้เป็นฐานของผลตอบแทน
// ตั้งครั้งเดียวต่อปีตอนเปิดแอปครั้งแรกของปีนั้น แล้วไม่แตะอีกเลยจนขึ้นปีใหม่
function yoyInitSnapshot(totalCost, totalValue) {
  const key = yoySnapshotKey();
  if (localStorage.getItem(key)) return;
  if (!(totalCost > 0)) return;
  localStorage.setItem(key, JSON.stringify({
    year: new Date().getFullYear(),
    snapshotCost: totalCost,
    baseValue: totalValue > 0 ? totalValue : totalCost,
    seedMethod: 'year-start'
  }));
}

// baseline ของปี 2026 ตั้งไว้ผิดมาตั้งแต่ต้น และไม่มี snapshot รายวันของปีนี้ให้ย้อนดู
// (โค้ดเดิม return ก่อนถึงบรรทัดบันทึก snapshot เพราะการ์ดกราฟ p9Chart ถูกถอดออก)
// จึงประมาณทุนต้นปีเป็น "ทุนปัจจุบัน − 6%" ตามที่ตกลงไว้ ทำครั้งเดียวแล้วจบ
// รอจนกว่าจะ sync Sheet ได้ก่อน ไม่งั้นจะ seed จากทุนที่คำนวณในเครื่องซึ่งไม่ตรง
const YOY_SEED_RATIO = 0.94;
function yoyMigrateSnapshot(totalCost, totalValue) {
  const snap = yoyGetSnapshot();
  if (!snap || typeof snap.baseValue === 'number') return;
  if (!(state.sheetTotals && state.sheetTotals.count)) return;
  if (!(totalCost > 0)) return;
  const c0 = totalCost * YOY_SEED_RATIO;
  localStorage.setItem(yoySnapshotKey(), JSON.stringify({
    year: new Date().getFullYear(),
    snapshotCost: c0,
    baseValue: c0,
    seedMethod: 'cost-minus-6pct',
    seededAt: todayISO(),
    previousSnapshotCost: snap.snapshotCost
  }));
}

// กำไรที่รับรู้แล้วปีนี้ — ใช้ทั้งในการ์ดภาพรวมและในการคำนวณเงินเข้าออกของ YoY
function realizedPlThisYear() {
  const y = new Date().getFullYear();
  const sells = (state.trades || []).filter(t => t.type === 'SELL' && tradeYear(t) === y);
  const withCost = sells.filter(t => typeof t.costBasisThb === 'number');
  return {
    pl: withCost.reduce((s, t) => s + (t.totalThb || 0) - t.costBasisThb - (t.fee || 0), 0),
    counted: withCost.length,
    skipped: sells.length - withCost.length,
    sells: sells.length
  };
}

// ผลตอบแทนปีนี้ โดยหักเงินที่ใส่เพิ่มระหว่างปีออกจากกำไร
//   เงินเข้าออกสุทธิ F = (ทุนวันนี้ − ทุนต้นปี) − กำไรที่รับรู้แล้วปีนี้
//     ทุนลดเพราะขาย จะหักแค่ราคาทุนของที่ขาย ส่วนที่ขายได้เกินทุนคือกำไรที่รับรู้
//     จึงลบออกอีกที เพื่อให้ F เท่ากับเงินสดที่ถอนออกจริง ไม่ใช่แค่ราคาทุน
//   ฐาน = V0 + เงินที่ใส่เพิ่ม (ถอนออกไม่ลดฐาน เพราะเงินก้อนนั้นอยู่ในพอร์ตมาก่อนแล้ว)
// ไม่มี baseline → คืน null ให้ผู้เรียกไปแสดงว่ายังคำนวณไม่ได้
function yoyCompute(totalValue, totalCost) {
  const snap = yoyGetSnapshot();
  if (!snap || !(snap.snapshotCost > 0)) return null;
  const c0 = snap.snapshotCost;
  const v0 = typeof snap.baseValue === 'number' && snap.baseValue > 0 ? snap.baseValue : c0;
  const flows = (totalCost - c0) - realizedPlThisYear().pl;
  const base = v0 + Math.max(0, flows);
  if (!(base > 0)) return null;
  return { v0: v0, c0: c0, flows: flows, base: base, pct: (totalValue - v0 - flows) / base * 100 };
}

// SSF/RMF lock check — matches a holding name/ticker; returns lock info or null
function taxLockInfo(assetName) {
  if (!assetName) return null;
  var key = String(assetName).toUpperCase();
  var h = (state.holdings || []).find(function(x) {
    return (x.ticker || '').toUpperCase() === key || (x.name || '').toUpperCase() === key;
  });
  if (!h || !h.taxType) return null;
  var nowY = new Date().getFullYear();
  if (h.taxType === 'SSF') {
    var unlockY = h.taxYear ? h.taxYear + 10 : null;
    if (unlockY && nowY >= unlockY) return null; // ครบ 10 ปีแล้ว
    return { type: 'SSF', until: unlockY, label: 'SSF' + (unlockY ? ' ถึงปี ' + unlockY : '') };
  }
  if (h.taxType === 'RMF') return { type: 'RMF', until: null, label: 'RMF ถึงอายุ 55' };
  return null;
}
function taxLockedAssetNames() {
  return (state.holdings || []).filter(function(h) { return taxLockInfo(h.name || h.ticker); })
    .map(function(h) { return h.name || h.ticker; });
}

function yoyTargetPct() {
  var o = state.sheetInputs && state.sheetInputs['Objective Return'];
  return o ? Number(o) * 100 : 10;
}
// เดิมสองฟังก์ชันนี้ขยับ snapshotCost ทุกครั้งที่บันทึก trade ในแอป
// ซึ่งพลาดเงินที่ DCA ผ่าน Sheet โดยตรง baseline จึงต่ำเกินจริงและ YoY บวมขึ้น
// ตอนนี้ยอดเงินเข้าออกคำนวณจากทุนใน Sheet ใน yoyCompute() แล้ว
// ปล่อยไว้เป็น no-op เพื่อไม่ให้ snapshotCost ซึ่งเป็นทุน "ณ ต้นปี" ถูกแก้ระหว่างปี
function yoyAddBuy() {}
function yoyAddSell() {}


// ─── อ่าน baseline ของ YoY ทุกแหล่งมาเทียบกัน (read-only) ──────────────────────
// ใช้ตัดสินใจว่าจะตั้ง baseline ปีนี้จากอะไร ไม่มีการเขียนค่าใด ๆ ลง storage
async function yoyInspectBaseline() {
  const out = document.getElementById('yoyInspectOut');
  if (!out) return;
  out.style.display = '';
  out.innerHTML = '<span style="color:var(--text3)">กำลังอ่านข้อมูล...</span>';

  const year = new Date().getFullYear();
  const V1 = portfolioValueThb();
  const C1 = portfolioCostThb();
  const fromSheet = !!(state.sheetTotals && state.sheetTotals.count);

  // 1) baseline ที่เก็บใน localStorage
  let snapObj = null, lsErr = '';
  try { snapObj = JSON.parse(localStorage.getItem('folio_yoy_snapshot_' + year) || 'null'); }
  catch(e) { lsErr = e.message; }

  // 2) snapshot รายวันใน Firestore (1 record/วัน)
  let history = [], fbErr = '';
  try {
    history = typeof window.loadSnapshotHistory === 'function' ? await window.loadSnapshotHistory(400) : [];
    if (typeof window.loadSnapshotHistory !== 'function') fbErr = 'Firebase ยังไม่พร้อม ลองใหม่อีกครั้ง';
  } catch(e) { fbErr = e.message || 'อ่านไม่ได้'; }
  const yearRows = history.filter(r => r && typeof r.date === 'string' && r.date.slice(0, 4) === String(year));
  const firstOfYear = yearRows.length ? yearRows[0] : null;
  const oldestAny = history.length ? history[0] : null;

  const bt = n => '฿' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pc = n => (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%';
  const row = (k, v, color) => '<tr><td style="padding:3px 10px 3px 0;color:var(--text3);">' + esc(k) +
    '</td><td style="padding:3px 0;text-align:right;font-weight:500;white-space:nowrap;' +
    (color ? 'color:' + color + ';' : '') + '">' + v + '</td></tr>';
  const tbl = inner => '<table style="width:100%;border-collapse:collapse;">' + inner + '</table>';
  const head = t => '<div style="font-weight:600;color:var(--text);margin:12px 0 4px;">' + t + '</div>';

  let html = head('ตัวเลขปัจจุบัน' + (fromSheet ? ' (จาก Sheet)' : ' (คำนวณในเครื่อง)'));
  html += tbl(row('มูลค่าพอร์ต', bt(V1)) + row('ทุน', bt(C1)) +
              row('กำไรรวม', C1 > 0 ? pc((V1 - C1) / C1 * 100) : '—'));

  html += head('1. baseline ที่เก็บใน localStorage');
  if (snapObj && typeof snapObj.snapshotCost === 'number' && snapObj.snapshotCost > 0) {
    const METHOD = { 'cost-minus-6pct': 'ประมาณจากทุนปัจจุบัน −6%', 'year-start': 'บันทึกตอนต้นปีจริง' };
    const yoy = yoyCompute(V1, C1);
    html += tbl(row('key', '<code>folio_yoy_snapshot_' + year + '</code>') +
                row('ทุนต้นปี (C0)', bt(snapObj.snapshotCost)) +
                row('มูลค่าต้นปี (V0)', typeof snapObj.baseValue === 'number' ? bt(snapObj.baseValue) : '<span style="color:var(--amber)">ยังไม่มี รอ sync Sheet</span>') +
                row('ที่มาของ baseline', esc(METHOD[snapObj.seedMethod] || snapObj.seedMethod || 'รูปแบบเก่า')) +
                (snapObj.seededAt ? row('ตั้งเมื่อ', esc(snapObj.seededAt)) : '') +
                (yoy ? row('เงินใหม่ที่ใส่ปีนี้ (F)', bt(yoy.flows)) +
                       row('ฐานที่ใช้หาร (V0 + F)', bt(yoy.base)) +
                       row('YoY ที่แถบแสดงอยู่', pc(yoy.pct), 'var(--accent)')
                     : row('YoY', 'คำนวณไม่ได้')));
  } else {
    html += '<div style="color:var(--text3)">ไม่มีค่าเก็บไว้' + (lsErr ? ' (' + esc(lsErr) + ')' : '') + '</div>';
  }

  html += head('2. snapshot รายวันใน Firestore');
  if (fbErr) {
    html += '<div style="color:var(--red)">อ่านไม่ได้: ' + esc(fbErr) + '</div>';
  } else if (!history.length) {
    html += '<div style="color:var(--text3)">ยังไม่มี snapshot เลย</div>';
  } else {
    html += tbl(row('จำนวน record ทั้งหมด', history.length + ' วัน') +
                row('เก่าสุดที่มี', oldestAny ? esc(oldestAny.date) : '—') +
                row('record ของปี ' + year, yearRows.length + ' วัน'));
    if (firstOfYear) {
      const V0 = Number(firstOfYear.totalValue) || 0;
      const C0 = Number(firstOfYear.totalCost) || 0;
      const flow = C1 - C0;
      const base = V0 + flow;
      html += head('   record แรกสุดของปี ' + year);
      html += tbl(row('วันที่', esc(firstOfYear.date)) +
                  row('มูลค่าพอร์ตวันนั้น (V0)', bt(V0)) +
                  row('ทุนวันนั้น (C0)', bt(C0)) +
                  row('เงินใหม่ที่ใส่หลังจากนั้น', bt(flow)) +
                  row('YoY แบบหักเงินใหม่', base > 0 ? pc((V1 - base) / base * 100) : '—', 'var(--accent)'));
      html += '<div style="color:var(--amber);margin-top:6px;">⚠️ snapshot ที่เขียนก่อนวันที่ 19 ก.ย. 2026 ใช้สูตรมูลค่าแบบเก่าที่ต่ำกว่าจริง ตัวเลข V0 ข้างบนจึงน่าจะต่ำกว่าความจริง ทำให้ YoY ที่ได้สูงเกินจริงอยู่บ้าง</div>';
    } else {
      html += '<div style="color:var(--text3);margin-top:4px;">ไม่มี record ของปี ' + year + ' เลย</div>';
    }
  }

  html += head('3. ตัวเลขอ้างอิง');
  const guess = C1 * YOY_SEED_RATIO;
  html += tbl(row('ทุนปัจจุบัน −6%', bt(guess)) +
              row('กำไรรวมทั้งพอร์ต', C1 > 0 ? pc((V1 - C1) / C1 * 100) : '—') +
              row('ถ้าหารด้วย baseline ตรง ๆ', pc((V1 - guess) / guess * 100), 'var(--text3)'));

  html += '<div style="color:var(--text3);margin-top:10px;">อ่านอย่างเดียว ยังไม่มีการเปลี่ยนค่าใด ๆ</div>';
  out.innerHTML = html;
}

// --- Phase 9: YoY Gap Calculator ---
function initPhase9() {
  // p9Data computed for Alerts + Monthly Review (UI card removed)
  if (!state.holdings.length) return;
  const totalCost  = portfolioCostThb();
  const totalValue = portfolioValueThb();
  const totalMonthly = dcaMonthly();
  if (totalCost === 0) return;

  // ตั้ง baseline ครั้งแรกของปี แล้วย้ายเรคคอร์ดปี 2026 มาใช้รูปแบบใหม่
  yoyInitSnapshot(totalCost, totalValue);
  yoyMigrateSnapshot(totalCost, totalValue);
  const yoy = yoyCompute(totalValue, totalCost);
  if (!yoy) return;
  const snapshotCost = yoy.base;   // ฐานที่ใช้หาร = มูลค่าต้นปี + เงินที่ใส่เพิ่ม
  const currentYoy = yoy.pct;
  const _objReturn = state.sheetInputs && state.sheetInputs['Objective Return'];
  const TARGET = _objReturn ? Number(_objReturn) * 100 : 10;
  var _tl = document.getElementById('yoyTargetLabel'); if (_tl) _tl.textContent = TARGET.toFixed(0) + '%';
  const gapPct  = TARGET - currentYoy;
  const gapBaht = (gapPct / 100) * snapshotCost;
  const now      = new Date();
  const monthsLeft = Math.max(1, 12 - now.getMonth());
  const dcaNeeded  = gapBaht > 0 ? Math.ceil(gapBaht / monthsLeft) : 0;
  // pace: DCA ต่อจนสิ้นปีโดยยังไม่คิดผลตอบแทนของเงินก้อนใหม่
  // เงินที่ใส่เพิ่มขึ้นทั้งฝั่งมูลค่าและฝั่งฐาน กำไรเท่าเดิม % จึงเจือจางลง
  const projFlows  = yoy.flows + totalMonthly * monthsLeft;
  const projValue  = totalValue + totalMonthly * monthsLeft;
  const projBase   = yoy.v0 + Math.max(0, projFlows);
  const projYoy    = projBase > 0 ? ((projValue - yoy.v0 - projFlows) / projBase) * 100 : 0;

  // Hero bar (top card) - sync with real YoY
  const yoyPctEl = document.getElementById('yoyPct');
  const yoyBarEl = document.getElementById('yoyBar');
  const yoyNoteEl = document.getElementById('yoyNote');
  if (yoyPctEl) { yoyPctEl.textContent = currentYoy.toFixed(1) + '%'; yoyPctEl.style.color = currentYoy >= TARGET ? 'var(--green)' : currentYoy >= 5 ? 'var(--amber)' : 'var(--red)'; }
  if (yoyBarEl) yoyBarEl.style.width = Math.min(100, Math.max(0, (currentYoy / TARGET) * 100)) + '%';
  if (yoyNoteEl) {
    if (gapPct <= 0) {
      yoyNoteEl.textContent = 'เกินเป้าหมาย ' + TARGET.toFixed(0) + '% แล้ว 🎉';
    } else {
      // Pace message: "At current pace you'll hit X% — need ฿Y/month more"
      var paceMsg = 'pace ปัจจุบัน → ' + projYoy.toFixed(1) + '% | ต้องการ DCA เพิ่ม ฿' + dcaNeeded.toLocaleString('th-TH',{maximumFractionDigits:0}) + '/เดือน เพื่อถึง ' + TARGET.toFixed(0) + '%';
      yoyNoteEl.textContent = paceMsg;
    }
  }

  window._p9Data = { holdings: state.holdings, totalCost, snapshotCost, baseValue: yoy.v0, yearStartCost: yoy.c0, flows: yoy.flows, totalValue, totalMonthly, currentYoy, gapPct, gapBaht, dcaNeeded, monthsLeft, projectedYoy: projYoy };

  // Save daily snapshot (1 write/day — foundation for trajectory data)
  if (typeof window.savePortfolioSnapshot === 'function') {
    window.savePortfolioSnapshot().catch(e => console.error('snapshot failed:', e));
  }

}

// --- Phase 10: Rebalancing Engine ---
const P10_TYPES = ['set','us','crypto','fund_thai','fund_us','fund_global','fund_china','fund_asia','fund_bond','fund_mixed','tech'];
const P10_LABELS = {
  set:'หุ้นไทย (SET)', us:'หุ้นสหรัฐ', crypto:'Crypto', tech:'Tech',
  fund_thai:'กองทุนไทย 🇹🇭', fund_us:'กองทุนสหรัฐ 🇺🇸', fund_global:'กองทุนต่างประเทศ 🌍',
  fund_china:'กองทุนจีน 🇨🇳', fund_asia:'กองทุนเอเชีย 🌏', fund_bond:'กองทุนตราสารหนี้', fund_mixed:'กองทุนผสม'
};
const P10_COLORS = {
  set:'var(--blue)', us:'var(--orange)', crypto:'var(--green)', tech:'var(--purple)',
  fund_thai:'#B45309', fund_us:'#0369A1', fund_global:'#7E22CE',
  fund_china:'#DC2626', fund_asia:'#0891B2', fund_bond:'#475569', fund_mixed:'#9333EA'
};
// Map fundRegion → P10 key
const FUND_REGION_KEY = { thai:'fund_thai', us:'fund_us', global:'fund_global', china:'fund_china', asia:'fund_asia', bond:'fund_bond', mixed:'fund_mixed' };
// Expected returns rule-based per P10 type (%/yr)
const P10_EXPECTED_RETURN = { set:8.5, us:12, crypto:25, tech:15, fund_thai:7.5, fund_us:10, fund_global:8, fund_china:9, fund_asia:8, fund_bond:3, fund_mixed:6 };

function p10LoadTargets() {
  const saved = localStorage.getItem('folio_p10_targets');
  return saved ? JSON.parse(saved) : { set:40, us:30, crypto:20, fund_thai:5, fund_us:5, tech:0 };
}

function p10SaveTargets() {
  const targets = {};
  P10_TYPES.forEach(t => {
    const el = document.getElementById('p10t-'+t);
    targets[t] = el ? (parseFloat(el.value) || 0) : 0;
  });
  const sum = Object.values(targets).reduce((a,b)=>a+b,0);
  if (sum > 100) { showToast('รวมเกิน 100% กรุณาตรวจสอบ'); return; }
  localStorage.setItem('folio_p10_targets', JSON.stringify(targets));
  closeModal('p10-target-modal');
  initPhase10();
  showToast('บันทึกเป้าหมายน้ำหนักแล้ว ✓');
}

function p10OpenModal() {
  const t = p10LoadTargets();
  // Show/hide fund region rows based on what's in holdings
  const fundRegionsInUse = new Set(state.holdings.filter(h=>h.type==='fund').map(h=>FUND_REGION_KEY[h.fundRegion]||'fund_thai'));
  P10_TYPES.forEach(type => {
    const el = document.getElementById('p10t-'+type);
    if (el) {
      el.value = t[type] || '';
      // Show fund sub-rows only if that region has holdings or a target
      const row = document.getElementById('p10row-'+type);
      if (row) row.style.display = (fundRegionsInUse.has(type) || (t[type]||0) > 0) ? '' : 'none';
    }
  });
  p10UpdateSum();
  openModal('p10-target-modal');
}

function p10UpdateSum() {
  const sum = P10_TYPES.reduce((a,type) => {
    const el = document.getElementById('p10t-'+type);
    return a + (el ? (parseFloat(el.value)||0) : 0);
  },0);
  const el = document.getElementById('p10TargetSum');
  if(el) { el.textContent='รวม: '+sum+'%'; el.style.color = sum===100?'var(--green)':sum>100?'var(--red)':'var(--text3)'; }
}
// Attach input listeners when modal opens
document.addEventListener('DOMContentLoaded', () => {
  P10_TYPES.forEach(type => {
    const el = document.getElementById('p10t-'+type);
    if (el) el.addEventListener('input', p10UpdateSum);
  });
});
// Migrate old 'fund' key in saved targets → split to fund_thai
(function migrateFundTargets() {
  const saved = localStorage.getItem('folio_p10_targets');
  if (!saved) return;
  const t = JSON.parse(saved);
  if ('fund' in t) {
    t.fund_thai = (t.fund_thai||0) + Math.round((t.fund||0)/2);
    t.fund_us = (t.fund_us||0) + Math.round((t.fund||0)/2);
    delete t.fund;
    localStorage.setItem('folio_p10_targets', JSON.stringify(t));
  }
})();

// --- Phase 10 Fund-Centric Mode ---
let _p10FundMode = false;
function p10ToggleMode() {
  _p10FundMode = !_p10FundMode;
  const btn = document.getElementById('p10ModeBtn');
  if (btn) {
    btn.style.background = _p10FundMode ? 'var(--amber)' : 'var(--amber-bg)';
    btn.style.color = _p10FundMode ? '#fff' : 'var(--amber)';
    btn.textContent = _p10FundMode ? '🏦 Fund Mode ON' : '🏦 Fund Mode';
  }
  initPhase10();
}

function initPhase10() {
  if (!document.getElementById('p10Alert')) return; // not on overview page
  if (!state.holdings.length) return;
  const totalValue = state.holdings.reduce((s,h) => s + valueThb(h), 0);
  if (!totalValue) return;

  // Fund-Centric Mode: only look at fund sub-allocation, ignore SET/Crypto/US
  if (_p10FundMode) {
    const fundHoldings = state.holdings.filter(h => h.type === 'fund');
    const fundTotal = fundHoldings.reduce((s,h) => s + valueThb(h),0);
    if (!fundTotal) { document.getElementById('p10Rows').innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center;padding:12px;">ยังไม่มีกองทุน</div>'; return; }
    const FUND_KEYS = ['fund_thai','fund_us','fund_global','fund_china','fund_asia','fund_bond','fund_mixed'];
    const actual = {}; FUND_KEYS.forEach(k => actual[k]=0);
    fundHoldings.forEach(h => { const k = FUND_REGION_KEY[h.fundRegion]||'fund_thai'; actual[k]+=valueThb(h); });
    FUND_KEYS.forEach(k => actual[k]=(actual[k]/fundTotal)*100);
    const saved = localStorage.getItem('folio_p10_fund_targets');
    const targets = saved ? JSON.parse(saved) : { fund_thai:10, fund_us:40, fund_global:0, fund_china:10, fund_asia:20, fund_bond:10, fund_mixed:10 };
    window._p10Data = { actual, targets, activeTypes: FUND_KEYS.filter(k=>actual[k]>0||targets[k]>0) };
    const rows = document.getElementById('p10Rows');
    rows.innerHTML = window._p10Data.activeTypes.map(t => {
      const act=actual[t]||0, tgt=targets[t]||0, dev=act-tgt;
      const devColor=Math.abs(dev)<3?'var(--green)':dev>0?'var(--orange)':'var(--accent)';
      const devLabel=Math.abs(dev)<3?'✓ ดี':dev>0?'▲ เกิน '+dev.toFixed(1)+'%':'▼ ขาด '+Math.abs(dev).toFixed(1)+'%';
      return '<div style="margin-bottom:10px;"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px;"><span style="font-weight:500;">'+P10_LABELS[t]+'</span><div style="display:flex;gap:10px;font-size:11px;"><span style="color:var(--text3);">จริง <strong style="color:var(--text);">'+act.toFixed(1)+'%</strong></span><span style="color:var(--text3);">เป้า <strong style="color:'+P10_COLORS[t]+';">'+tgt+'%</strong></span><span style="font-weight:500;color:'+devColor+';">'+devLabel+'</span></div></div><div style="position:relative;height:8px;background:var(--bg2);border-radius:99px;overflow:hidden;"><div style="position:absolute;left:0;top:0;height:100%;width:'+Math.min(100,act).toFixed(1)+'%;background:'+P10_COLORS[t]+';border-radius:99px;opacity:0.6;"></div>'+(tgt>0?'<div style="position:absolute;top:-2px;height:12px;width:2px;background:'+P10_COLORS[t]+';left:'+Math.min(100,tgt).toFixed(1)+'%;"></div>':'')+'</div></div>';
    }).join('');
    const alertEl = document.getElementById('p10Alert');
    const maxDev = window._p10Data.activeTypes.reduce((mx,t)=>Math.max(mx,Math.abs((actual[t]||0)-(targets[t]||0))),0);
    if (alertEl) { if (maxDev<3) { alertEl.style.background='var(--green-bg)'; alertEl.style.borderColor='#86EFAC'; alertEl.style.color='var(--green)'; alertEl.innerHTML='✅ สัดส่วนกองทุนสมดุลดีแล้ว'; }
    else { const worst=window._p10Data.activeTypes.reduce((mx,t)=>Math.abs((actual[t]||0)-(targets[t]||0))>Math.abs((actual[mx]||0)-(targets[mx]||0))?t:mx,window._p10Data.activeTypes[0]); const dev=(actual[worst]||0)-(targets[worst]||0); alertEl.style.background='var(--amber-bg)'; alertEl.style.borderColor='#FCD34D'; alertEl.style.color='var(--amber)'; alertEl.innerHTML='⚡ <strong>'+P10_LABELS[worst]+'</strong>'+(dev>0?' มากเกินไป '+dev.toFixed(1)+'%':' ขาดอยู่ '+Math.abs(dev).toFixed(1)+'%')+' ในพอร์ตกองทุน'; } }
    document.getElementById('p10ActionPlan').style.display='none';
    return;
  }

  // Normal Mode: compute actual weights per type (funds split by fundRegion)
  const actual = {};
  P10_TYPES.forEach(t => actual[t] = 0);
  state.holdings.forEach(h => {
    let key = h.type || 'set';
    if (key === 'fund') {
      key = FUND_REGION_KEY[h.fundRegion] || 'fund_thai';
    }
    if (actual[key] !== undefined) actual[key] += valueThb(h);
  });
  P10_TYPES.forEach(t => actual[t] = (actual[t]/totalValue)*100);

  const targets = p10LoadTargets();
  const activeTypes = P10_TYPES.filter(t => targets[t] > 0 || actual[t] > 0);
  window._p10Data = { actual, targets, activeTypes };

  // Render rows
  const rows = document.getElementById('p10Rows');
  rows.innerHTML = activeTypes.map(t => {
    const act = actual[t]||0;
    const tgt = targets[t]||0;
    const dev = act - tgt;
    const devColor = Math.abs(dev)<2?'var(--green)':dev>0?'var(--orange)':'var(--accent)';
    const devLabel = Math.abs(dev)<2?'✓ ดี': dev>0?`▲ เกิน ${dev.toFixed(1)}%`:`▼ ขาด ${Math.abs(dev).toFixed(1)}%`;
    const barWidth = Math.min(100, act).toFixed(1);
    const tgtBarPos = Math.min(100, tgt).toFixed(1);
    return `
    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
        <span style="font-size:12px;font-weight:500;color:var(--text);">${P10_LABELS[t]}</span>
        <div style="display:flex;gap:10px;align-items:center;font-size:11px;">
          <span style="color:var(--text3);">จริง <strong style="color:var(--text);">${act.toFixed(1)}%</strong></span>
          <span style="color:var(--text3);">เป้า <strong style="color:${P10_COLORS[t]};">${tgt}%</strong></span>
          <span style="font-weight:500;color:${devColor};">${devLabel}</span>
        </div>
      </div>
      <div style="position:relative;height:8px;background:var(--bg2);border-radius:99px;overflow:hidden;">
        <div style="position:absolute;left:0;top:0;height:100%;width:${barWidth}%;background:${P10_COLORS[t]};border-radius:99px;opacity:0.5;transition:width 0.8s ease;"></div>
        ${tgt>0?`<div style="position:absolute;top:-2px;height:12px;width:2px;background:${P10_COLORS[t]};border-radius:1px;left:${tgtBarPos}%;"></div>`:''}
      </div>
    </div>`;
  }).join('');

  // Alert
  const alertEl = document.getElementById('p10Alert');
  const maxDev = activeTypes.reduce((mx,t) => Math.max(mx, Math.abs((actual[t]||0)-(targets[t]||0))),0);
  if (alertEl) {
    if (maxDev < 2) {
      alertEl.style.background='var(--green-bg)'; alertEl.style.borderColor='#86EFAC'; alertEl.style.color='var(--green)';
      alertEl.innerHTML='✅ พอร์ตสมดุลดีแล้ว -- น้ำหนักทุก asset อยู่ในช่วงเป้าหมาย';
    } else {
      const worst = activeTypes.reduce((mx,t) => Math.abs((actual[t]||0)-(targets[t]||0)) > Math.abs((actual[mx]||0)-(targets[mx]||0)) ? t : mx, activeTypes[0]);
      const dev = (actual[worst]||0)-(targets[worst]||0);
      alertEl.style.background='var(--amber-bg)'; alertEl.style.borderColor='#FCD34D'; alertEl.style.color='var(--amber)';
      alertEl.innerHTML=`⚡ <strong>${P10_LABELS[worst]}</strong>${dev>0?' มากเกินไป '+dev.toFixed(1)+'%':' ขาดอยู่ '+Math.abs(dev).toFixed(1)+'%'} -- ควรปรับ Rebalance`;
    }
  }

  // Action plan
  const actionEl = document.getElementById('p10ActionPlan');
  const actionsEl = document.getElementById('p10Actions');
  const underweight = activeTypes.filter(t => (targets[t]||0) - (actual[t]||0) > 2);
  const overweight  = activeTypes.filter(t => (actual[t]||0) - (targets[t]||0) > 2);
  if ((underweight.length || overweight.length) && actionEl) {
    actionEl.style.display='block';
    const lines = [];
    underweight.forEach(t => {
      const needed = ((targets[t]-actual[t])/100) * totalValue;
      lines.push(`<div style="display:flex;align-items:center;gap:8px;"><span style="background:var(--green-bg);color:var(--green);border-radius:5px;padding:2px 8px;font-size:10px;font-weight:500;flex-shrink:0;">ซื้อ</span><span><strong>${P10_LABELS[t]}</strong> เพิ่ม <strong>฿${Math.round(needed).toLocaleString()}</strong> เพื่อให้ได้ ${targets[t]}%</span></div>`);
    });
    overweight.forEach(t => {
      const excess = ((actual[t]-targets[t])/100) * totalValue;
      lines.push(`<div style="display:flex;align-items:center;gap:8px;"><span style="background:var(--orange-bg);color:var(--orange);border-radius:5px;padding:2px 8px;font-size:10px;font-weight:500;flex-shrink:0;">ลด</span><span><strong>${P10_LABELS[t]}</strong> เกิน <strong>฿${Math.round(excess).toLocaleString()}</strong> vs เป้าหมาย ${targets[t]}%</span></div>`);
    });
    actionsEl.innerHTML = lines.join('');
  } else {
    actionEl.style.display='none';
  }

  window._p10Data = { actual, targets, totalValue, activeTypes };
}

async function p10RefreshAI() {
  if (!window._p10Data) { showToast('โหลด Holdings ก่อนนะครับ'); return; }
  const btn = document.getElementById('p10AiBtn');
  const sp  = document.getElementById('p10Spinner');
  const box = document.getElementById('p10AiBox');
  const txt = document.getElementById('p10AiText');
  btn.disabled=true; sp.style.display='block';
  box.style.display='block';
  txt.innerHTML='<span style="color:var(--text3);">AI กำลังวิเคราะห์...</span>';

  const { actual, targets, totalValue, activeTypes } = window._p10Data;
  const classSummary = activeTypes.map(t => {
    const dev = (actual[t]||0)-(targets[t]||0);
    const devBaht = Math.round(Math.abs(dev)/100 * totalValue);
    return `${P10_LABELS[t]}: จริง ${(actual[t]||0).toFixed(1)}% เป้า ${targets[t]||0}% (${dev>=0?'เกิน':'ขาด'} ${Math.abs(dev).toFixed(1)}% ≈ ฿${devBaht.toLocaleString()})`;
  }).join('\n');

  // รายตัว holding พร้อมมูลค่า (THB) เพื่อให้ AI ระบุชื่อจริงได้ ไม่ใช่แค่ asset class
  const holdingLines = state.holdings.map(h => {
    const v = Math.round(valueThb(h));
    const w = totalValue > 0 ? (v/totalValue*100).toFixed(1) : '0';
    const cls = h.type === 'fund' ? (FUND_REGION_KEY[h.fundRegion]||'fund_thai') : h.type;
    return `- ${h.name||h.ticker} [${P10_LABELS[cls]||cls}] มูลค่า ฿${v.toLocaleString()} (${w}%)` + (h.change ? ` P/L ${h.change.toFixed(1)}%` : '');
  }).join('\n');

  const monthlyDca = Math.round(dcaMonthly());
  const yoyData = window._p9Data;
  const yoyLine = yoyData ? `YoY ปัจจุบัน: ${yoyData.currentYoy.toFixed(1)}% (เป้า ${yoyTargetPct().toFixed(0)}%, gap ${yoyData.gapPct.toFixed(1)}%)` : '';
  const lockedNames = taxLockedAssetNames();

  // BuyScore/Drift รายตัวจาก Sheet (ถ้า sync แล้ว) ช่วยให้จัดลำดับแม่นขึ้น
  let sheetLines = '';
  if (window._p17SheetData && window._p17SheetData.holdings) {
    sheetLines = '\nข้อมูลจาก Google Sheet (Drift รายตัว, BuyScore 0-10):\n' +
      window._p17SheetData.holdings.map(sh =>
        `- ${sh['Asset']}: Drift ${((Number(sh['Drift %'])||0)*100).toFixed(1)}%, BuyScore ${Number(sh['Buy Priority Score']||0).toFixed(1)}`
      ).join('\n');
  }

  const prompt = `คุณคือที่ปรึกษาลงทุนอาวุโส วางแผน Rebalance พอร์ตด้วยเงินใหม่เป็นหลัก (ซื้อฝั่งที่ขาดก่อน ขายเฉพาะจำเป็น)
${yoyLine}
มูลค่าพอร์ตรวม: ฿${Math.round(totalValue).toLocaleString()} · งบ DCA ต่อเดือน: ฿${monthlyDca.toLocaleString()}
สัดส่วนราย asset class เทียบเป้า:
${classSummary}

Holdings รายตัว:
${holdingLines}${sheetLines}
${lockedNames.length ? '\nLOCKED (SSF/RMF ห้ามแนะนำขาย/ลด): ' + lockedNames.join(', ') : ''}

กติกา:
- ยอดซื้อรวมทั้งแผนต้องไม่เกินงบ DCA ต่อเดือน (฿${monthlyDca.toLocaleString()}) ถ้างบ 0 ให้เสนอแผนขั้นต่ำ ฿5,000
- ระบุชื่อ holding จริงจากรายการข้างบน ห้ามแต่งชื่อใหม่
- action "ลด" ใช้เฉพาะตัวที่เกินเป้าชัดเจนและไม่ติด LOCKED
- source = "sheet" เมื่ออิง Drift/BuyScore/สัดส่วน, "news" เมื่ออิงสภาวะตลาด

ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น ห้ามใช้ code fence:
{"summary":"ภาพรวม 1 ประโยค","actions":[{"asset":"ชื่อจริง","action":"ซื้อ/ลด/ถือ","amountThb":NUMBER,"priority":1,"reason":"เหตุผลสั้น ไม่เกิน 15 คำ","source":"sheet"}]}`;

  try {
    const data = await callGemini({ contents:[{parts:[{text:prompt}]}], generationConfig:{maxOutputTokens:3000,temperature:0.3,thinkingConfig:{thinkingBudget:0}} });
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const finishReason = data.candidates?.[0]?.finishReason || '';
    let parsed = safeParseJSON(text);
    let partial = false;
    if ((!parsed || !Array.isArray(parsed.actions) || !parsed.actions.length) && text) {
      // คำตอบโดนตัดกลาง JSON — กู้เท่าที่ action พาร์สได้แทนที่จะทิ้งทั้งหมด
      const recovered = salvageJsonArrayByKey(text, 'actions');
      if (recovered.length) { parsed = { actions: recovered }; partial = true; }
    }
    if (!parsed || !Array.isArray(parsed.actions) || !parsed.actions.length) {
      txt.innerHTML = finishReason === 'MAX_TOKENS'
        ? '<span style="color:var(--amber);">⚠️ คำตอบ AI ยาวเกินจนถูกตัด — กด 🤖 อีกครั้งเพื่อลองใหม่</span>'
        : '<span style="color:var(--amber);">AI ตอบไม่อยู่ในรูปแบบที่อ่านได้ — กด 🤖 อีกครั้งเพื่อลองใหม่</span>';
    } else {
      const actColor = { 'ซื้อ':'var(--green)', 'ลด':'var(--orange)', 'ถือ':'var(--text3)' };
      const actBg = { 'ซื้อ':'var(--green-bg)', 'ลด':'var(--orange-bg)', 'ถือ':'var(--bg2)' };
      let html = partial ? '<div style="font-size:10.5px;color:var(--amber);margin-bottom:8px;">⚠️ ผลลัพธ์บางส่วน (คำตอบถูกตัดกลาง) — แสดงเท่าที่กู้ได้</div>' : '';
      html += parsed.summary ? '<div style="font-size:12px;color:var(--text);margin-bottom:10px;line-height:1.7;">' + esc(parsed.summary) + '</div>' : '';
      parsed.actions
        .slice().sort((a,b) => (a.priority||9) - (b.priority||9))
        .slice(0, 6)
        .forEach(a => {
          const act = String(a.action||'ถือ');
          html += '<div style="display:flex;gap:8px;align-items:flex-start;padding:7px 0;border-bottom:0.5px solid var(--border);">' +
            '<span style="background:' + (actBg[act]||'var(--bg2)') + ';color:' + (actColor[act]||'var(--text2)') + ';border-radius:4px;padding:2px 8px;font-size:10px;font-weight:600;min-width:32px;text-align:center;flex-shrink:0;">' + esc(act) + '</span>' +
            '<div style="flex:1;">' +
              '<div style="font-size:12px;font-weight:500;color:var(--text);">' + esc(a.asset||'') +
                (a.amountThb ? ' <strong style="color:var(--accent);">฿' + Number(a.amountThb).toLocaleString() + '</strong>' : '') + ' ' + srcBadge(a.source) + '</div>' +
              (a.reason ? '<div style="font-size:11px;color:var(--text2);margin-top:1px;">' + esc(a.reason) + '</div>' : '') +
            '</div></div>';
        });
      html += aiSourceFooter(false);
      txt.innerHTML = html;
      aiCacheSave('p10_rebalance', txt.innerHTML);
    }
  } catch(e) {
    txt.innerHTML=`<span style="color:var(--red);">${e.message==='no_key'?'ใส่ Gemini Key ในหน้า ⚙️ ตั้งค่าก่อน':e.message==='all_quota'?'Gemini ทุก key หมด quota':'เกิดข้อผิดพลาด กรุณาลองใหม่'}</span>`;
  }
  btn.disabled=false; sp.style.display='none';
}

// --- Phase 11: Decision Alerts ---
function initPhase11() {
  const alerts = [];

  // 1. Holdings with significant moves (>10% -- actionable only)
  const liveHoldings = state.holdings.filter(h => h.livePrice && h.change !== undefined);
  // Sort by abs change, take top 3 movers only
  const topMovers = liveHoldings.slice().sort((a,b) => Math.abs(b.change||0)-Math.abs(a.change||0)).slice(0,3);
  topMovers.forEach(h => {
    const chg = h.change || 0;
    if (Math.abs(chg) < 10) return; // only alert if >10%
    const label = h.name && h.type === 'fund' ? h.name : h.ticker;
    if (chg <= -10) {
      var action = chg <= -20 ? 'ขายทั้งหมด / Cut Loss' : 'ขาย 30-50% หรือตั้ง Stop Loss';
      alerts.push({ type: 'danger', icon: '📉', msg: '<strong>' + esc(label) + '</strong> ร่วง <strong>' + chg.toFixed(1) + '%</strong> -- ' + action });
    } else if (chg >= 10) {
      var profitAct = chg >= 20 ? 'ขาย 30-50% Take Profit' : 'ขาย 20-30% หรือตั้ง Trailing Stop';
      alerts.push({ type: 'info', icon: '📈', msg: '<strong>' + esc(label) + '</strong> พุ่ง <strong>+' + chg.toFixed(1) + '%</strong> -- ' + profitAct });
    }
  });

  // 2. DCA due (today or overdue)
  state.dcaSchedules.forEach(d => {
    const overdueDays = dcaDueDays(d);
    if (overdueDays === null || overdueDays < 0) return;
    const label = overdueDays === 0 ? 'ครบกำหนดวันนี้' : 'เลยกำหนด ' + overdueDays + ' วัน';
    alerts.push({ type: 'warn', icon: '💰', msg: 'DCA <strong>' + esc(d.ticker) + '</strong> ' + label + ' -- ซื้อ ฿' + Number(d.amount).toLocaleString() + ' เดี๋ยวนี้' });
  });

  // 3. YoY gap alert
  if (window._p9Data) {
    const { currentYoy, gapPct } = window._p9Data;
    if (gapPct > 7) {
      var extraDca = window._p9Data ? '฿' + Math.round(window._p9Data.dcaNeeded).toLocaleString() + '/เดือน' : 'เพิ่ม DCA'; alerts.push({ type: 'danger', icon: '🎯', msg: 'YoY Gap วิกฤต <strong>' + gapPct.toFixed(1) + '%</strong> -- เพิ่ม DCA ' + extraDca + ' ทันที' });
    } else if (gapPct > 4) {
      alerts.push({ type: 'warn', icon: '⚡', msg: 'YoY ห่างเป้า <strong>' + gapPct.toFixed(1) + '%</strong> -- พิจารณาเพิ่ม DCA' });
    } else if (currentYoy >= yoyTargetPct()) {
      alerts.push({ type: 'info', icon: '🎉', msg: 'ถึงเป้า ' + yoyTargetPct().toFixed(0) + '% YoY แล้ว! YoY ปัจจุบัน <strong>' + currentYoy.toFixed(1) + '%</strong>' });
    }
  }

  // 4. Portfolio all-time loss >10%
  if (state.holdings.length) {
    const total = portfolioValueThb();
    const cost  = portfolioCostThb();
    if (cost > 0 && total < cost * 0.9) {
      alerts.push({ type: 'danger', icon: '🔴', msg: 'พอร์ตติดลบมากกว่า 10% จากต้นทุน -- ควรทบทวนกลยุทธ์' });
    }
  }

  // 5. Drift alert from Sheet data (not p10) -- top 2 most drifted
  if (window._p17SheetData && window._p17SheetData.holdings) {
    const sheetHoldings = window._p17SheetData.holdings;
    const sheetTotalVal = sheetHoldings.reduce((s,h) => s + (Number(h['Market Value']) || 0), 0);
    const highDrift = sheetHoldings
      .map(h => ({ name: h['Asset'], drift: Number(h['Drift %']||0)*100 }))
      .filter(h => Math.abs(h.drift) > 15)
      .sort((a,b) => Math.abs(b.drift)-Math.abs(a.drift))
      .slice(0,2);
    highDrift.forEach(h => {
      const dir = h.drift > 0 ? 'เกินเป้า' : 'ขาดเป้า';
      var _lk = h.drift > 0 ? taxLockInfo(h.name) : null;
      var driftAction = h.drift > 0
        ? (_lk ? '🔒 ติด ' + _lk.label + ' ขายไม่ได้ — ปรับด้วยการซื้อกองอื่นแทน' : 'ขาย ' + Math.abs(h.drift).toFixed(0) + '% ของ position')
        : 'ซื้อเพิ่ม ฿' + Math.round((Math.abs(h.drift)/100) * sheetTotalVal).toLocaleString() + (sheetTotalVal ? '' : ' (est.)');
      alerts.push({ type: 'warn', icon: '⚖️', msg: '<strong>' + esc(h.name) + '</strong> ' + dir + ' <strong>' + Math.abs(h.drift).toFixed(1) + '%</strong> -- ' + driftAction });
    });
  }

  // Limit to 5 most important alerts total
  const ordered = [
    ...alerts.filter(a => a.type === 'danger'),
    ...alerts.filter(a => a.type === 'warn'),
    ...alerts.filter(a => a.type === 'info'),
  ].slice(0, 5);

  const wrap = document.getElementById('p11AlertsWrap');
  const list = document.getElementById('p11AlertsList');
  if (!wrap || !list) return;
  if (!ordered.length) { wrap.style.display = 'none'; return; }

  const colors = {
    danger: { bg:'var(--red-bg)', border:'#FECACA' },
    warn:   { bg:'var(--amber-bg)', border:'#FCD34D' },
    info:   { bg:'var(--blue-bg)', border:'#BFDBFE' }
  };

  list.innerHTML = ordered.map(a => {
    const c = colors[a.type];
    return '<div style="display:flex;align-items:center;gap:10px;background:' + c.bg + ';border:0.5px solid ' + c.border + ';border-radius:9px;padding:10px 14px;font-size:12px;color:var(--text);">' +
      '<span style="font-size:15px;flex-shrink:0;">' + a.icon + '</span>' +
      '<span style="flex:1;line-height:1.5;">' + a.msg + '</span>' +
      '</div>';
  }).join('');
  wrap.style.display = 'block';
}
function initPhase12() {
  if (!document.getElementById('p12MonthLabel')) return; // not on overview page
  const now = new Date();
  const monthNames = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const label = `${monthNames[now.getMonth()]} ${now.getFullYear() + 543}`;
  document.getElementById('p12MonthLabel').textContent = `ข้อมูลสรุป ${label}`;

  // P&L เดือนนี้ = กำไรที่รับรู้จากการขาย (ยอดขาย − ต้นทุน − ค่าธรรมเนียม) สูตรเดียวกับ realizedPlThisYear
  // อ่านวันที่ด้วย tradeDate — dateStr เป็นข้อความไทย ("17 ต.ค.") ที่ new Date() อ่านไม่ได้
  const thisMonth = now.getMonth(); const thisYear = now.getFullYear();
  const monthSells = state.trades.filter(t => {
    const d = tradeDate(t);
    return t.type === 'SELL' && typeof t.costBasisThb === 'number' && d && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });
  const monthPL = monthSells.reduce((s, t) => s + (t.totalThb || 0) - t.costBasisThb - (t.fee || 0), 0);
  const plEl = document.getElementById('p12Pl');
  plEl.textContent = (monthPL >= 0 ? '+' : '') + '฿' + Math.abs(Math.round(monthPL)).toLocaleString();
  plEl.style.color = monthPL >= 0 ? 'var(--green)' : 'var(--red)';

  // Monthly DCA total
  const dcaTotal = Math.round(dcaMonthly());
  document.getElementById('p12Dca').textContent = '฿' + dcaTotal.toLocaleString();

  // Expenses this month — มีรายการจาก 🧾 บิล เดือนนี้ → ใช้รายจ่ายจริง, ไม่มี → ใช้รายการงบประมาณแบบเดิม
  const billM = typeof billMonthTotals === 'function' ? billMonthTotals(isoFromDate(now).slice(0, 7)) : null;
  const useBill = !!(billM && (billM.income > 0 || billM.consumption > 0));
  const monthExpenses = useBill ? billM.consumption : state.budgetExpenses.reduce((s,e) => s + Number(e.amount||0), 0);
  document.getElementById('p12Expense').textContent = '฿' + Math.round(monthExpenses).toLocaleString();

  // Save rate: มีรายรับจริงจากบิล → (รายรับ − รายจ่าย) / รายรับ; ไม่มี → DCA / (DCA + expenses) แบบเดิม
  const total = dcaTotal + monthExpenses;
  const saveRate = useBill && billM.income > 0 ? billM.savingsRate.toFixed(0)
    : total > 0 ? ((dcaTotal / total) * 100).toFixed(0) : '--';
  const srEl = document.getElementById('p12SaveRate');
  srEl.textContent = saveRate !== '--' ? saveRate + '%' : '--';
  srEl.title = useBill && billM.income > 0 ? 'จากรายรับ-รายจ่ายจริงใน 🧾 บิล' : 'DCA ÷ (DCA + รายจ่าย)';
  srEl.style.color = saveRate >= 20 ? 'var(--green)' : saveRate >= 10 ? 'var(--amber)' : 'var(--red)';

  // Top/Bottom performers from holdings
  const sortedHoldings = [...state.holdings].filter(h => h.change !== undefined).sort((a,b) => (b.change||0)-(a.change||0));
  const top = sortedHoldings[0];
  const bot = sortedHoldings[sortedHoldings.length - 1];
  const perfEl = document.getElementById('p12Performers');
  perfEl.innerHTML = [
    // change = กำไร/ขาดทุนเทียบต้นทุน (avgPrice) ไม่ใช่การเปลี่ยนแปลงของวันนี้ — สีและเครื่องหมายตามค่าจริง
    top ? { label:'🏆 กำไรดีสุด (เทียบทุน)', name: top.name||top.ticker, val: `${(top.change||0) >= 0 ? '+' : ''}${(top.change||0).toFixed(2)}%`, color: (top.change||0) >= 0 ? 'var(--green)' : 'var(--red)' } : null,
    bot && bot !== top ? { label:'📉 แย่สุด (เทียบทุน)', name: bot.name||bot.ticker, val: `${(bot.change||0) >= 0 ? '+' : ''}${(bot.change||0).toFixed(2)}%`, color: (bot.change||0) >= 0 ? 'var(--green)' : 'var(--red)' } : null
  ].filter(Boolean).map(p => `
    <div style="background:var(--bg);border-radius:10px;padding:12px;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;">${p.label}</div>
      <div style="font-size:13px;font-weight:500;color:var(--text);margin-bottom:2px;">${esc(p.name)}</div>
      <div style="font-size:16px;font-family:var(--font-serif);color:${p.color};">${p.val}</div>
    </div>`).join('');

  window._p12Data = { monthPL, dcaTotal, monthExpenses, saveRate, label, top, bot };
}

async function p12RunReview() {
  initPhase12();
  if (!window._p12Data) return;
  const btn = document.getElementById('p12AiBtn');
  const sp  = document.getElementById('p12Spinner');
  const box = document.getElementById('p12AiBox');
  const txt = document.getElementById('p12AiText');
  btn.disabled = true; sp.style.display = 'block';
  box.style.display = 'block';
  txt.innerHTML = '<span style="color:var(--text3);">AI กำลังสรุปเดือนนี้...</span>';

  const { monthPL, dcaTotal, monthExpenses, saveRate, label, top, bot } = window._p12Data;
  const yoy = window._p9Data;
  const rebal = window._p10Data;

  const sheetCtx = window._p17SheetData ? (function() {
    var h = window._p17SheetData;
    var holdings = h.holdings || [];
    var totalValue = holdings.reduce(function(s,x){ return s+Number(x['Market Value']||0); }, 0);
    var topGain = holdings.reduce(function(a,b){ return (Number(b['P/L %'])||0)>(Number(a['P/L %'])||0)?b:a; }, holdings[0]||{});
    var topLoss = holdings.reduce(function(a,b){ return (Number(b['P/L %'])||0)<(Number(a['P/L %'])||0)?b:a; }, holdings[0]||{});
    var lines = [];
    lines.push('- มูลค่าพอร์ตรวม: ' + Math.round(totalValue).toLocaleString() + ' บาท');
    if (topGain['Asset']) lines.push('- Holding ดีสุด: ' + topGain['Asset'] + ' P/L ' + ((Number(topGain['P/L %'])||0)*100).toFixed(1) + '%');
    if (topLoss['Asset'] && topLoss['Asset'] !== topGain['Asset']) lines.push('- Holding แย่สุด: ' + topLoss['Asset'] + ' P/L ' + ((Number(topLoss['P/L %'])||0)*100).toFixed(1) + '%');
    return lines.join('\n');
  })() : '';

  const promptLines2 = [];
  promptLines2.push('คุณคือที่ปรึกษาการลงทุน AI');
  promptLines2.push('สรุปรีวิวประจำเดือน ' + label + ' สำหรับนักลงทุน DCA เป้าหมาย 10% YoY');
  promptLines2.push('');
  promptLines2.push('ข้อมูลเดือนนี้:');
  promptLines2.push('- กำไรที่รับรู้จากการขายเดือนนี้: ' + (monthPL >= 0 ? '+' : '') + '฿' + Math.round(monthPL).toLocaleString());
  promptLines2.push('- DCA รวม: ฿' + dcaTotal.toLocaleString() + '/เดือน');
  promptLines2.push('- รายจ่าย: ฿' + Math.round(monthExpenses).toLocaleString());
  promptLines2.push('- อัตราออม: ' + saveRate + '%');
  if (typeof billCashflowContext === 'function') {
    const billCtx = billCashflowContext();
    if (billCtx) { promptLines2.push('- กระแสเงินสดจริงจาก Bill Manager:'); promptLines2.push(billCtx); }
  }
  promptLines2.push('- holding กำไรดีสุด (เทียบต้นทุน): ' + (top ? (top.name||top.ticker) + ' ' + (top.change||0).toFixed(1) + '%' : '--'));
  promptLines2.push('- holding แย่สุด (เทียบต้นทุน): ' + (bot ? (bot.name||bot.ticker) + ' ' + (bot.change||0).toFixed(1) + '%' : '--'));
  if (yoy) { promptLines2.push('- YoY ปัจจุบัน: ' + yoy.currentYoy.toFixed(1) + '% (เป้า ' + yoyTargetPct().toFixed(0) + '%, gap ' + yoy.gapPct.toFixed(1) + '%)'); }
  if (sheetCtx) { promptLines2.push(''); promptLines2.push('ข้อมูลพอร์ตจาก Google Sheet:'); promptLines2.push(sheetCtx); }
  promptLines2.push('');
  promptLines2.push('เขียนสรุป 5-6 ประโยค ภาษาไทย ชมเชยสิ่งที่ดี และแนะนำสิ่งที่ต้องปรับเดือนหน้า โดยใช้ทั้งข้อมูล Firebase และ Sheet ประกอบกัน');
  const prompt = promptLines2.join('\n');

  try {
    const data = await callGemini({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 800, temperature: 0.6 } });
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    txt.innerHTML = esc(text).replace(/\n/g, '<br>');
    aiCacheSave('p12_review', txt.innerHTML);
  } catch(e) {
    txt.innerHTML = `<span style="color:var(--red);">${e.message === 'no_key' ? 'ใส่ Gemini Key ในหน้า ⚙️ ตั้งค่าก่อน' : e.message === 'all_quota' ? 'Gemini ทุก key หมด quota' : 'เกิดข้อผิดพลาด กรุณาลองใหม่'}</span>`;
  }
  btn.disabled = false; sp.style.display = 'none';
}

// ─── AI Result Cache (persists until next day) ───
function aiCacheSave(key, html) {
  var today = todayISO();
  try { localStorage.setItem('folio_ai_' + key, JSON.stringify({ date: today, html: html })); } catch(e) {}
}
function aiCacheLoad(key) {
  try {
    var raw = localStorage.getItem('folio_ai_' + key);
    if (!raw) return null;
    var obj = JSON.parse(raw);
    var today = todayISO();
    if (obj.date !== today) { localStorage.removeItem('folio_ai_' + key); return null; }
    return obj.html;
  } catch(e) { return null; }
}
function aiCacheRestore() {
  var keys = ['p17_analysis', 'p17b_advisor', 'p17_review', 'p10_rebalance', 'p12_review'];
  keys.forEach(function(k) {
    var html = aiCacheLoad(k);
    if (!html) return;
    var el;
    if (k === 'p17_analysis') { el = document.getElementById('p17panel-summary'); if (el) { el.innerHTML = html; document.getElementById('p17AiResult').style.display=''; document.getElementById('p17Empty').style.display='none'; var ls=document.getElementById('p17LastSync'); if(ls) ls.textContent='โหลดจาก cache วันนี้'; } }
    if (k === 'p17b_advisor') { el = document.getElementById('p17bResult'); if (el) { el.innerHTML = html; el.style.display=''; } }
    if (k === 'p17_review') { el = document.getElementById('p17revResult'); if (el) { el.innerHTML = html; el.style.display=''; } }
    if (k === 'p10_rebalance') { el = document.getElementById('p10AiBox'); if (el) { el.style.display=''; document.getElementById('p10AiText').innerHTML = html; } }
    if (k === 'p12_review') { el = document.getElementById('p12AiBox'); if (el) { el.style.display=''; document.getElementById('p12AiText').innerHTML = html; } }
  });
}


async function init() {
  await loadSettings();
  aiCacheRestore();
  autoFetchNavSheet();
  renderApiStatus();
  renderBudget();
  startApp();
  fetchUsdThb().then(() => {
    if (!state.holdings.some(h => h.currency === 'USD')) return;
    updatePortfolioSummary(); renderHoldings(); renderAllocation(); initPhase10();
  });
  if ('serviceWorker' in navigator) {
    // controllerchange also fires on the very first install (when clients.claim() first takes control) —
    // only reload when a controller already existed, i.e. this is a genuine update replacing an older SW
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.update(); // check for a newer sw.js right away instead of waiting for the browser's own schedule
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded || !hadController) return; // avoid a reload loop, and skip the initial no-op claim
        reloaded = true;
        window.location.reload();
      });
      folioSwReg = reg;
    }).catch(()=>{});
  }
}

// ─── ตรวจเวอร์ชันใหม่ทุกครั้งที่กลับเข้าแอป ───
// Android/PWA: สลับแอปกลับมา = หน้าเดิมในหน่วยความจำ ไม่ได้โหลดใหม่ → ดึง index.html ล่าสุดมาเทียบลายเซ็นของ script/style
// ต่างกัน = มี deploy ใหม่ → โหลดใหม่ให้เอง (ถ้ากำลังกรอกฟอร์ม/เปิดหน้าต่างอยู่ แสดงแถบให้แตะเองแทน)
let folioSwReg = null, folioSig0 = '', folioLastCheck = 0;
function folioSig(doc) {
  let s = '';
  doc.querySelectorAll('script:not([src]), style').forEach(n => { if (!n.dataset.dyn) s += n.textContent; });
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h + ':' + s.length;
}
function folioShowUpdateBar() {
  if (document.getElementById('folioUpdateBar')) return;
  const b = document.createElement('button');
  b.id = 'folioUpdateBar';
  b.textContent = '✨ มีเวอร์ชันใหม่ — แตะเพื่ออัปเดต';
  b.style.cssText = 'position:fixed;left:50%;top:calc(10px + env(safe-area-inset-top));transform:translateX(-50%);z-index:9999;background:var(--accent);color:#fff;border:none;border-radius:99px;padding:9px 16px;font-family:var(--font);font-size:13px;font-weight:600;box-shadow:0 6px 20px rgba(0,0,0,.2);cursor:pointer;';
  b.onclick = () => location.reload();
  document.body.appendChild(b);
}
async function folioCheckUpdate() {
  if (!folioSig0 || Date.now() - folioLastCheck < 30000) return;
  folioLastCheck = Date.now();
  if (folioSwReg) folioSwReg.update().catch(() => {});
  try {
    const r = await fetch(location.pathname, { cache: 'no-cache' });
    if (!r.ok) return;
    const sig = folioSig(new DOMParser().parseFromString(await r.text(), 'text/html'));
    if (sig === folioSig0) return;
    // กันวนโหลดซ้ำ: ถ้าเพิ่งโหลดใหม่เพราะลายเซ็นนี้แล้วยังไม่ตรง ไม่ต้องโหลดอีก ให้แถบไว้แตะเอง
    const busy = document.querySelector('.modal-overlay.open') || (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
    if (busy || sessionStorage.getItem('folio_reload_sig') === sig) { folioShowUpdateBar(); return; }
    sessionStorage.setItem('folio_reload_sig', sig);
    location.reload();
  } catch (e) {}
}
document.addEventListener('DOMContentLoaded', () => { folioSig0 = folioSig(document); folioLastCheck = Date.now(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') folioCheckUpdate(); });
window.addEventListener('pageshow', e => { if (e.persisted) folioCheckUpdate(); });
window.addEventListener('online', folioCheckUpdate);

init();

// --- Phase 14: Max Drawdown Tracking (extends Phase 11) ---
function p14TrackDrawdown() {
  if (!state.holdings.length) return;
  const totalValue = portfolioValueThb();
  const totalCost  = portfolioCostThb();
  if (!totalCost) return;

  // Track peak value in localStorage
  const peakKey = 'folio_peak_value';
  const storedPeak = parseFloat(localStorage.getItem(peakKey) || '0');
  const peak = Math.max(storedPeak, totalValue);
  localStorage.setItem(peakKey, peak.toString());

  const drawdown = peak > 0 ? ((totalValue - peak) / peak) * 100 : 0;
  window._p14Data = { totalValue, totalCost, peak, drawdown };

  // Update Phase 10 card with expected returns per asset type
  const expReturnEl = document.getElementById('p14ExpectedReturn');
  if (expReturnEl) {
    if (window._p10Data) {
      const { actual } = window._p10Data;
      const weightedReturn = Object.entries(actual).reduce((sum, [type, weight]) => {
        return sum + (weight / 100) * (P10_EXPECTED_RETURN[type] || 8);
      }, 0);
      expReturnEl.textContent = `Expected Return: ${weightedReturn.toFixed(1)}%/ปี`;
      expReturnEl.style.color = weightedReturn >= 10 ? 'var(--green)' : 'var(--amber)';
    }
  }

  // Inject drawdown alert into Phase 11 if severe
  // ถูกเรียกหลายรอบต่อการอัปเดต (initPhase11 ถูก hook ให้เรียกตัวนี้ด้วย) — ลบอันเดิมก่อน กัน alert ซ้ำ
  const oldDd = document.getElementById('p14DrawdownAlert');
  if (oldDd) oldDd.remove();
  if (drawdown < -10) {
    const list = document.getElementById('p11AlertsList');
    const wrap = document.getElementById('p11AlertsWrap');
    if (list) {
      const ddAlert = document.createElement('div');
      ddAlert.id = 'p14DrawdownAlert';
      ddAlert.style.cssText = 'display:flex;align-items:center;gap:10px;background:var(--red-bg);border:0.5px solid #FECACA;border-radius:9px;padding:10px 14px;font-size:12px;color:var(--text);';
      ddAlert.innerHTML = `<span style="font-size:15px;flex-shrink:0;">⚠️</span><span style="flex:1;line-height:1.5;">Max Drawdown <strong>${drawdown.toFixed(1)}%</strong> จากจุดสูงสุด ฿${Math.round(peak).toLocaleString()} -- พิจารณา Hedge หรือลด Exposure</span>`;
      list.prepend(ddAlert);
      wrap.style.display = 'block';
    }
  }
}


// ─────────── BENCHMARK PAGE JS ───────────
let _bmPeriod = '12m';
let _bmChart = null;
let _bmData = {};


// ─── Custom ticker for Benchmark ───
let _bmCustomTickers = []; // [{symbol, label, color}]
const BM_COLORS = ['#10B981','#EC4899','#F97316','#06B6D4','#84CC16','#A78BFA'];

async function bmAddCustom() {
  const input = document.getElementById('bmCustomInput');
  if (!input) return;
  const raw = input.value.trim().toUpperCase();
  if (!raw) return;
  if (_bmCustomTickers.find(t => t.symbol === raw)) { input.value = ''; return; }
  const colorIdx = _bmCustomTickers.length % BM_COLORS.length;
  _bmCustomTickers.push({ symbol: raw, label: raw, color: BM_COLORS[colorIdx] });
  localStorage.setItem('folio_bmCustomTickers', JSON.stringify(_bmCustomTickers));
  input.value = '';
  bmRenderCustomTags();
  // Reset cache and re-fetch everything so new ticker gets data in context of current period
  _bmData = {};
  await bmFetch();
}

function bmRemoveCustom(symbol) {
  _bmCustomTickers = _bmCustomTickers.filter(t => t.symbol !== symbol);
  localStorage.setItem('folio_bmCustomTickers', JSON.stringify(_bmCustomTickers));
  delete _bmData['custom_' + symbol];
  bmRenderCustomTags();
  bmDrawChart(bmGetReturns());
}

function bmRenderCustomTags() {
  const el = document.getElementById('bmCustomTags');
  if (!el) return;
  el.innerHTML = _bmCustomTickers.map(t =>
    '<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;padding:2px 8px;border-radius:99px;background:' + t.color + '22;color:' + t.color + ';border:0.5px solid ' + t.color + '44;">'
    + esc(t.label)
    + '<span onclick="bmRemoveCustom(' + esc(JSON.stringify(t.symbol)) + ')" style="cursor:pointer;font-size:11px;opacity:0.7;">×</span></span>'
  ).join('');
}

// ราคาย้อนหลังจาก Alpha Vantage: 1 เดือนใช้รายวัน (compact = 100 วันทำการล่าสุด ≈ 5 เดือน)
// 6/12 เดือนใช้รายสัปดาห์ (ฟรี มีย้อนหลังครบ) — เดิมใช้รายวัน compact ทุกช่วง ช่วง 6/12 เดือนจึงได้แค่ ~5 เดือน
// คืน { pts } หรือ { limited: true } เมื่อโดน rate limit หรือ { pts: [] } เมื่อไม่พบ
async function bmAvSeries(symbol, days, avKey) {
  const weekly = days > 120;
  const fn = weekly ? 'TIME_SERIES_WEEKLY' : 'TIME_SERIES_DAILY&outputsize=compact';
  const r = await fetch('https://www.alphavantage.co/query?function=' + fn + '&symbol=' + encodeURIComponent(symbol) + '&apikey=' + avKey);
  const d = await r.json();
  if (d.Note || d.Information) return { limited: true };
  const ts = d[weekly ? 'Weekly Time Series' : 'Time Series (Daily)'];
  if (!ts) return { pts: [], missing: true };
  const cutoff = new Date(Date.now() - days * 86400 * 1000);
  const pts = Object.entries(ts)
    .filter(([dt]) => new Date(dt) >= cutoff)
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([dt,v]) => [new Date(dt).getTime(), parseFloat(v['4. close'])]);
  return { pts };
}

async function bmFetchCustomTickers() {
  const CRYPTO_IDS = {
    'BTC':'bitcoin','ETH':'ethereum','BNB':'binancecoin','SOL':'solana',
    'XRP':'ripple','ADA':'cardano','DOGE':'dogecoin','AVAX':'avalanche-2',
    'DOT':'polkadot','MATIC':'matic-network','LINK':'chainlink'
  };
  const now = new Date();
  const days = _bmPeriod === '1m' ? 30 : _bmPeriod === '6m' ? 180 : 365;
  const fromUnix = Math.floor((now.getTime() - days*86400*1000)/1000);
  const nowUnix = Math.floor(now.getTime()/1000);

  for (const t of _bmCustomTickers) {
    const key = 'custom_' + t.symbol;
    const geckoId = CRYPTO_IDS[t.symbol];

    // ─── 1. Known crypto → CoinGecko (full series) ───
    if (geckoId) {
      try {
        const r = await fetch('https://api.coingecko.com/api/v3/coins/' + geckoId + '/market_chart/range?vs_currency=usd&from=' + fromUnix + '&to=' + nowUnix);
        const d = await r.json();
        if (d.prices && d.prices.length >= 2) {
          _bmData[key] = { label: t.label, icon: '', color: t.color, prices: d.prices };
        }
      } catch(e) {}
      continue;
    }

    // ─── 2. Detect Thai fund/stock: not purely uppercase letters (no dot) or ends with Thai fund patterns ───
    const isThaiFund = /(-A|-B|RMF|LTF|SSF|PLUS|DIV|D|AI|BOND|TECH|GOLD|PROP)$/i.test(t.symbol) || /^[A-Z]{1,3}[0-9]/.test(t.symbol);
    const hasExchange = t.symbol.includes('.');

    if (isThaiFund && !hasExchange) {
      // Thai fund → proxy → synthetic 2-point series
      try {
        const r = await fetch(SET_PROXY + '/?ticker=' + encodeURIComponent(t.symbol));
        const d = await r.json();
        if (d.price && d.change !== undefined) {
          const endPrice = d.price;
          const startPrice = endPrice / (1 + d.change / 100);
          const startTs = new Date(now.getTime() - days * 86400 * 1000).getTime();
          _bmData[key] = {
            label: t.label, icon: '', color: t.color,
            prices: [[startTs, startPrice], [now.getTime(), endPrice]],
            synthetic: true
          };
        } else {
          showToast('ไม่พบข้อมูล ' + t.symbol + ' — ตรวจสอบชื่อกอง');
        }
      } catch(e) {
        showToast('ดึงข้อมูล ' + t.symbol + ' ไม่ได้: ' + e.message);
      }
      continue;
    }

    // ─── 3. US stock / SET stock with exchange → Alpha Vantage ───
    try {
      const avKey = getActiveKey('AV');
      if (!avKey) { showToast('ใส่ Alpha Vantage Key ก่อน (ตั้งค่า)'); continue; }
      const res = await bmAvSeries(t.symbol, days, avKey);
      if (res.limited) {
        showToast('Alpha Vantage rate limit — ' + t.symbol + ' ดึงไม่ได้ (25 req/day)');
        continue;
      }
      if (!res.missing) {
        const pts = res.pts;
        if (pts.length >= 2) {
          _bmData[key] = { label: t.label, icon: '', color: t.color, prices: pts };
        } else {
          showToast('ไม่มีข้อมูล ' + t.symbol + ' ในช่วง ' + _bmPeriod);
        }
      } else {
        showToast('ไม่พบ ' + t.symbol + ' บน Alpha Vantage — ตรวจสอบ ticker');
      }
    } catch(e) {
      showToast('ดึงข้อมูล ' + t.symbol + ' ไม่ได้: ' + e.message);
    }
  }
}

function bmToggleChart(wrapperId) {
  const el = document.getElementById(wrapperId);
  if (!el) return;
  const isHidden = el.style.display === 'none';
  el.style.display = isHidden ? '' : 'none';
  // update arrow via stable ID (derived from wrapperId e.g. bmChartWrap_0 → bmArrow_0)
  const arrowId = wrapperId.replace('bmChartWrap_', 'bmArrow_');
  const arrow = document.getElementById(arrowId);
  if (arrow) arrow.textContent = isHidden ? '▲' : '▼';
}

function bmGetReturns() {
  const returns = [];
  Object.values(_bmData).forEach(item => {
    if (!item.prices || item.prices.length < 2) return;
    const s = item.prices[0][1], e = item.prices[item.prices.length-1][1];
    returns.push({ ...item, ret: ((e-s)/s)*100 });
  });
  return returns;
}

function bmSetPeriod(p) {
  _bmPeriod = p;
  const labels = {'1m':'1 เดือน','6m':'6 เดือน','12m':'12 เดือน'};
  const el = document.getElementById('bmPeriodLabel');
  if (el) el.textContent = labels[p] || p;
  ['1m','6m','12m'].forEach(x => {
    const b = document.getElementById('bm-btn-'+x);
    if (!b) return;
    if (x === p) { b.style.background='var(--accent)'; b.style.color='#fff'; b.style.borderColor='var(--accent)'; }
    else { b.style.background='var(--bg)'; b.style.color='var(--text2)'; b.style.borderColor='var(--border)'; }
  });
  // Re-fetch with new period (ล้าง cache เพื่อดึงใหม่ตาม period)
  _bmData = {};
  bmFetch();
}

async function bmFetch() {
  const btn = document.getElementById('bmRefreshBtn');
  if (btn) btn.disabled = true;
  const legendEl = document.getElementById('bmLegend');
  if (legendEl) legendEl.innerHTML = '<span style="font-size:11px;color:var(--text3);">กำลังดึงข้อมูล...</span>';

  const ce = document.getElementById('bmChartEmpty');
  if (ce) ce.style.display = 'block';
  const now = new Date();
  const days = _bmPeriod === '1m' ? 30 : _bmPeriod === '6m' ? 180 : 365;
  const fromUnix = Math.floor((now.getTime() - days*86400*1000)/1000);
  const nowUnix = Math.floor(now.getTime()/1000);
  _bmData = {};

  // BTC via CoinGecko
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart/range?vs_currency=usd&from='+fromUnix+'&to='+nowUnix);
    const d = await r.json();
    if (d.prices && d.prices.length >= 2)
      _bmData.btc = { label:'BTC', icon:'🟡', color:'#F59E0B', prices: d.prices };
  } catch(e) {}

  // S&P500 via Alpha Vantage
  try {
    const avKey = getActiveKey('AV');
    if (avKey) {
      const res = await bmAvSeries('SPY', days, avKey);
      if (res.pts && res.pts.length >= 2) _bmData.spy = { label:'S&P500 (SPY)', icon:'🇺🇸', color:'#3B82F6', prices: res.pts };
    }
  } catch(e) {}

  // SET Index via proxy (daily snapshot — proxy returns single price+change, build synthetic series)
  try {
    const r = await fetch(SET_PROXY + '/?ticker=^SET.BK');
    const d = await r.json();
    if (d.price && d.change !== undefined) {
      // Proxy only gives current price+change%; build 2-point synthetic series so chart renders
      const endPrice = d.price;
      const startPrice = endPrice / (1 + d.change / 100);
      const startTs = new Date(now.getTime() - days * 86400 * 1000).getTime();
      _bmData.set = { label:'SET Index', icon:'🇹🇭', color:'#7C3AED', prices: [[startTs, startPrice],[now.getTime(), endPrice]], synthetic: true };
    }
  } catch(e) {}

  // Custom tickers (restore from localStorage then fetch)
  _bmCustomTickers = JSON.parse(localStorage.getItem('folio_bmCustomTickers') || '[]');
  bmRenderCustomTags();
  await bmFetchCustomTickers();

  bmDrawChart(bmGetReturns());
  if (btn) btn.disabled = false;
}

function bmDrawChart(returns) {
  const wrap = document.getElementById('bmChartsWrap');
  const emptyEl = document.getElementById('bmChartEmpty');
  if (!wrap) return;

  // destroy existing charts
  if (!window._bmCharts) window._bmCharts = [];
  window._bmCharts.forEach(ch => ch.destroy());
  window._bmCharts = [];

  const seriesData = Object.values(_bmData).filter(item => item.prices && item.prices.length >= 2);

  if (!seriesData.length) {
    wrap.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  // ── Risk metrics: MDD + Volatility per series ──
  var riskRow = document.getElementById('bmRiskRow');
  if (riskRow) {
    var riskHtml = seriesData.map(function(item) {
      var prices = item.prices.map(function(p) { return p[1]; });
      if (prices.length < 3) return '';
      var peak = prices[0], mdd = 0;
      for (var pi = 1; pi < prices.length; pi++) {
        if (prices[pi] > peak) peak = prices[pi];
        var dd = (peak - prices[pi]) / peak * 100;
        if (dd > mdd) mdd = dd;
      }
      var dailyRets = [];
      for (var ri = 1; ri < prices.length; ri++) { dailyRets.push((prices[ri] - prices[ri-1]) / prices[ri-1]); }
      var mean = dailyRets.reduce(function(a,b){ return a+b; }, 0) / dailyRets.length;
      var variance = dailyRets.reduce(function(a,b){ return a + Math.pow(b - mean, 2); }, 0) / dailyRets.length;
      var vol = Math.sqrt(variance) * Math.sqrt(252) * 100;
      return '<div style="background:var(--bg);border-radius:8px;padding:7px 10px;flex:1;min-width:120px;">' +
        '<div style="font-size:9px;color:var(--text3);margin-bottom:3px;">'+(item.icon?item.icon+' ':'')+esc(item.label)+'</div>' +
        '<div style="font-size:10px;color:var(--text);">MDD <span style="color:var(--red);font-weight:600;">-'+mdd.toFixed(1)+'%</span></div>' +
        '<div style="font-size:10px;color:var(--text);">Vol <span style="font-weight:600;">'+vol.toFixed(1)+'%</span>/ปี</div>' +
        '</div>';
    }).filter(Boolean).join('');
    if (riskHtml) { riskRow.innerHTML = riskHtml; riskRow.style.display = 'flex'; }
  }

  // สร้าง card + canvas แยกต่อ series
  // First 2 charts expanded, rest collapsed by default
  wrap.innerHTML = seriesData.map((item, idx) => {
    const colorStr = item.color.startsWith('var(') ? '#D95070' : item.color;
    const base = item.prices[0][1];
    const last = item.prices[item.prices.length - 1][1];
    const retPct = ((last - base) / base) * 100;
    const isPos = retPct >= 0;
    const collapsed = idx >= 3;
    // synthetic = proxy ให้แค่ราคาล่าสุด + % ของวันเดียว — ไม่มีราคาย้อนหลัง จึงไม่วาดเส้น และบอกให้ชัดว่าไม่ใช่ผลตอบแทนทั้งช่วง
    if (item.synthetic) {
      return '<div style="background:var(--bg);border-radius:12px;padding:12px 14px;border:0.5px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
        '<div style="display:flex;align-items:center;gap:6px;"><div style="width:10px;height:10px;border-radius:50%;background:'+colorStr+';"></div>' +
        '<span style="font-size:12px;font-weight:600;color:var(--text);">'+(item.icon?item.icon+' ':'')+esc(item.label)+' <span style="font-size:9px;color:var(--text3);font-weight:400;">เปลี่ยนแปลงวันล่าสุด (ไม่มีข้อมูลย้อนหลัง)</span></span></div>' +
        '<span style="font-size:14px;font-family:var(--font-serif);color:'+(isPos?'var(--green)':'var(--red)')+';font-weight:600;">'+(isPos?'+':'')+retPct.toFixed(1)+'%</span></div>';
    }
    return [
      '<div style="background:var(--bg);border-radius:12px;padding:12px 14px;border:0.5px solid var(--border);">',
      '<div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;" onclick="bmToggleChart(\'bmChartWrap_'+idx+'\');">',
      '<div style="display:flex;align-items:center;gap:6px;">',
      '<div style="width:10px;height:10px;border-radius:50%;background:'+colorStr+';"></div>',
      '<span style="font-size:12px;font-weight:600;color:var(--text);">'+(item.icon?item.icon+' ':'')+esc(item.label)+'</span>',
      '</div>',
      '<div style="display:flex;align-items:center;gap:8px;">',
      '<span style="font-size:14px;font-family:var(--font-serif);color:'+(isPos?'var(--green)':'var(--red)')+';font-weight:600;">'+(isPos?'+':'')+retPct.toFixed(1)+'%</span>',
      '<span id="bmArrow_'+idx+'" style="font-size:10px;color:var(--text3);">'+(collapsed?'▼':'▲')+'</span>',
      '</div>',
      '</div>',
      '<div id="bmChartWrap_'+idx+'" style="'+(collapsed?'display:none;':'')+'margin-top:8px;">',
      '<canvas id="bmChart_'+idx+'" style="height:100px;max-height:100px;"></canvas>',
      '</div>',
      '</div>'
    ].join('');
  }).join('');

  // วาด chart แต่ละอัน
  seriesData.forEach((item, idx) => {
    const canvas = document.getElementById('bmChart_'+idx);
    if (!canvas || item.synthetic) return;
    const colorStr = item.color.startsWith('var(') ? '#D95070' : item.color;
    const base = item.prices[0][1];
    const normalized = item.prices.map(p => ((p[1] - base) / base) * 100);
    const step = Math.max(1, Math.floor(normalized.length / 60));
    const sampled = normalized.filter((_, i) => i % step === 0 || i === normalized.length - 1);
    const labels = item.prices
      .filter((_, i) => i % step === 0 || i === item.prices.length - 1)
      .map(p => { const d = new Date(p[0]); return (d.getMonth()+1)+'/'+(d.getDate()); });
    const isPos = sampled[sampled.length-1] >= 0;
    const ch = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: sampled,
          borderColor: colorStr,
          backgroundColor: colorStr + '18',
          tension: 0.3, pointRadius: 0, borderWidth: 2, fill: true
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: {
          callbacks: { label: ctx => (ctx.parsed.y >= 0 ? '+' : '') + ctx.parsed.y.toFixed(1) + '%' }
        }},
        scales: {
          x: { ticks: { font: { size: 9 }, maxTicksLimit: 6, color: '#9CA3AF' }, grid: { display: false } },
          y: { ticks: { font: { size: 9 }, color: '#9CA3AF', callback: v => (v>=0?'+':'')+v.toFixed(0)+'%' }, grid: { color: '#F3F4F6' } }
        }
      }
    });
    window._bmCharts.push(ch);
  });
}

async function bmFetchAiHot() {
  const resultEl = document.getElementById('bmAiResult');
  if (!resultEl) return;
  const btn = document.querySelector('#bmAiCard .action');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }
  resultEl.innerHTML = '<div style="color:var(--text3);font-size:11px;">กำลังวิเคราะห์ข่าวตลาด...</div>';

  const prompt = [
    'คุณเป็น Senior Fund Manager ชาวไทย ใช้ Google Search หาข่าวตลาดหุ้นล่าสุดวันนี้',
    'แล้วระบุ asset/กองทุนไทย/หุ้น ที่น่าติดตามช่วงนี้ 3-5 รายการ พร้อมเหตุผลจากข่าวจริง 1 บรรทัดต่อรายการ เขียนเป็นภาษาไทย',
    '',
    'ตอบในรูปแบบนี้เท่านั้น ห้ามมีข้อความอื่น:',
    '🔵 [ชื่อ asset] -- [เหตุผลจากข่าวจริง]',
    '🔵 [ชื่อ asset] -- [เหตุผลจากข่าวจริง]'
  ].join('\n');

  try {
    const _aiRaw = await callGemini({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { maxOutputTokens: 1500, temperature: 0.4 } });
    const _aiPart = (_aiRaw.candidates&&_aiRaw.candidates[0]&&_aiRaw.candidates[0].content&&_aiRaw.candidates[0].content.parts||[]).find(p=>p.text);
    const txt = _aiPart ? _aiPart.text : '';
    resultEl.innerHTML = txt.split('\n').filter(Boolean).map(l =>
      '<div style="padding:4px 0;border-bottom:0.5px solid var(--bg2);">' + esc(l) + '</div>'
    ).join('');
  } catch(e) {
    resultEl.innerHTML = '<div style="color:var(--red);font-size:11px;">เกิดข้อผิดพลาด: ' + esc(e.message) + '</div>';
  }
  if (btn) { btn.disabled = false; btn.textContent = '🤖 วิเคราะห์'; }
}


// --- Hook Phase 14: initPhase11 เรียก p14TrackDrawdown ต่อท้ายเสมอ ---
window._p14Hooked = false;
document.addEventListener('DOMContentLoaded', () => {
  if (!window._p14Hooked) {
    window._p14Hooked = true;
    const origInit11 = initPhase11;
    window.initPhase11 = function() {
      origInit11();
      p14TrackDrawdown();
    };
  }
});

// --- Manual Price Feature ---
let _mpImageBase64 = null;
let _mpImageResults = [];

function mpSwitchTab(tab) {
  document.getElementById('mp-panel-manual').style.display = tab === 'manual' ? '' : 'none';
  document.getElementById('mp-panel-image').style.display  = tab === 'image'  ? '' : 'none';
  const btnM = document.getElementById('mp-tab-manual');
  const btnI = document.getElementById('mp-tab-image');
  btnM.style.background = tab === 'manual' ? 'var(--accent)' : 'var(--bg)';
  btnM.style.color      = tab === 'manual' ? '#fff' : 'var(--text2)';
  btnI.style.background = tab === 'image'  ? 'var(--accent)' : 'var(--bg)';
  btnI.style.color      = tab === 'image'  ? '#fff' : 'var(--text2)';
}

// Open modal and build manual input rows
const _origOpenModal = openModal;
window.openModal = function(id) {
  if (id === 'trade-modal') {
    document.getElementById('t-edit-id').value = '';
    document.getElementById('trade-modal-title').textContent = 'บันทึกธุรกรรม';
    document.getElementById('trade-submit-btn').textContent = 'บันทึก';
    const ta = document.getElementById('t-asset'); if (ta) ta.value = '';
    const tb = document.getElementById('t-broker'); if (tb) tb.value = '';
    const tam = document.getElementById('t-amount'); if (tam) tam.value = '';
    const tpv = document.getElementById('t-qty-preview'); if (tpv) tpv.textContent = '';
  }
  _origOpenModal(id);
  if (id === 'manual-price-modal') mpBuildManualList();
};

function mpBuildManualList() {
  const el = document.getElementById('mp-manual-list');
  if (!state.holdings.length) {
    el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text3);font-size:12px;">ยังไม่มี Holdings</div>';
    return;
  }
  const seen = {};
  const unique = state.holdings.filter(h => {
    const k = (h.name || h.ticker).toUpperCase();
    if (seen[k]) return false;
    seen[k] = true; return true;
  });
  el.innerHTML = unique.map((h, i) => {
    const label = h.name || h.ticker;
    const liveVal = h.livePrice || '';
    const costLabel = h.avgPrice ? '฿' + h.avgPrice.toLocaleString(undefined, {maximumFractionDigits:4}) : '--';
    const plPct = h.livePrice && h.avgPrice > 0
      ? ((h.livePrice - h.avgPrice) / h.avgPrice * 100).toFixed(1)
      : null;
    const plColor = plPct === null ? '' : parseFloat(plPct) >= 0 ? 'var(--green)' : 'var(--red)';
    return `<div style="background:var(--bg);border-radius:8px;padding:8px 10px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="flex:1;font-size:12px;font-weight:500;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(label)}">${esc(label)}</div>
        <input type="number" step="0.0001" id="mp-inp-${i}" value="${liveVal}"
          style="width:100px;font-family:var(--font);font-size:12px;color:var(--text);background:var(--surface);border:0.5px solid var(--border2);border-radius:7px;padding:5px 8px;text-align:right;outline:none;"
          placeholder="${h.type==='fund'?'NAV':'ราคา'}">
      </div>
      <div style="display:flex;gap:8px;margin-top:4px;font-size:10px;color:var(--text3);">
        <span>ต้นทุน: <strong style="color:var(--text2);">${costLabel}</strong></span>
        ${plPct !== null ? `<span>P&L: <strong style="color:${plColor};">${parseFloat(plPct) >= 0 ? '+' : ''}${plPct}%</strong></span>` : ''}
      </div>
    </div>`;
  }).join('');
  window._mpUniqueHoldings = unique;
}

function mpSaveManual() {
  const unique = window._mpUniqueHoldings || [];
  let count = 0;
  unique.forEach((h, i) => {
    const val = parseFloat(document.getElementById('mp-inp-' + i)?.value);
    if (!val || val <= 0) return;
    const nameKey = (h.name || h.ticker).toUpperCase();
    state.holdings.forEach(holding => {
      if ((holding.name || holding.ticker).toUpperCase() !== nameKey) return;
      // livePrice = ราคาตลาด, avgPrice = ต้นทุน (ไม่แตะ)
      holding.livePrice = val;
      holding.change = holding.avgPrice > 0
        ? parseFloat(((val - holding.avgPrice) / holding.avgPrice * 100).toFixed(2))
        : 0;
      holding.value = Math.round(valueThb(holding)); // แปลง USD→THB เหมือนตอนดึงจาก Sheet
      count++;
    });
  });
  if (count > 0) {
    savePriceCache();
    updatePortfolioSummary(); renderHoldings();
    renderAllocation(); initPhase9(); initPhase10(); initPhase11(); initPhase12(); p14TrackDrawdown();
    showToast('บันทึกราคา ' + count + ' รายการแล้ว ✓');
    closeModal('manual-price-modal');
  } else {
    showToast('ยังไม่ได้กรอกราคา');
  }
}

// -- Image upload --
function mpHandleImage(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    _mpImageBase64 = dataUrl.split(',')[1];
    document.getElementById('mp-img-thumb').src = dataUrl;
    document.getElementById('mp-img-preview').style.display = '';
    document.getElementById('mp-img-result').style.display = 'none';
    document.getElementById('mp-img-save-btn').style.display = 'none';
    _mpImageResults = [];
  };
  reader.readAsDataURL(file);
  // Style dropzone
  document.getElementById('mp-dropzone').style.background = 'var(--accent-light)';
}

// Drag-and-drop
document.addEventListener('DOMContentLoaded', () => {
  const dz = document.getElementById('mp-dropzone');
  if (!dz) return;
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.background='var(--accent-light)'; });
  dz.addEventListener('dragleave', () => { dz.style.background='var(--bg)'; });
  dz.addEventListener('drop', e => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    const inp = document.getElementById('mp-img-input');
    const dt = new DataTransfer(); dt.items.add(file); inp.files = dt.files;
    mpHandleImage(inp);
  });
});

async function mpAnalyzeImage() {
  if (!_mpImageBase64) { showToast('เลือกรูปก่อน'); return; }
  const btn = document.getElementById('mp-analyze-btn');
  const sp  = document.getElementById('mp-spinner');
  btn.disabled = true; sp.style.display = 'block';

  // Build holding name list with short aliases for fuzzy match
  const holdingNames = [...new Set(state.holdings.map(h => h.name || h.ticker))];

  const prompt = `รูปนี้มีข้อมูล NAV / ราคากองทุนหรือหุ้น
กรุณาอ่านชื่อกองทุน/หุ้น และราคา/NAV ทุกรายการที่เห็นในรูป
ไม่ต้องสนใจว่าตรงกับรายการด้านล่างหรือไม่ -- ให้ดึงทุกรายการที่มีราคา

ตอบ JSON เท่านั้น ห้าม backtick หรือ markdown:
{"ชื่อกองทุน/ticker ตามที่เห็นในรูป": {"price": NUMBER, "date": "YYYY-MM-DD หรือว่าง"}, ...}

รายการที่ต้องการ (ใช้ประกอบการอ่านเท่านั้น): ${holdingNames.join(', ')}`;

  try {
    // Detect mime type from base64 header
    const mimeType = _mpImageBase64.startsWith('/9j/') ? 'image/jpeg'
      : _mpImageBase64.startsWith('iVBOR') ? 'image/png'
      : _mpImageBase64.startsWith('UklGR') ? 'image/webp'
      : 'image/jpeg';

    const d = await callGemini({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: _mpImageBase64 } },
            { text: prompt }
          ]
        }],
        generationConfig: { maxOutputTokens: 1500, temperature: 0 }
      });
    const txt = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = safeParseJSON(txt);
    if (!parsed) { showToast('Raw: ' + txt.substring(0,120)); throw new Error('Gemini ตอบผิดรูปแบบ'); }

    // Smart matching: score each parsed key against each holding
    function matchScore(parsedKey, holding) {
      const pk = parsedKey.trim().toUpperCase().replace(/[-_\s]/g,'');
      const hn = (holding.name || holding.ticker).toUpperCase().replace(/[-_\s]/g,'');
      const ht = (holding.ticker || '').toUpperCase().replace(/[-_\s]/g,'');
      if (pk === hn || pk === ht) return 100;                          // exact
      if (hn.startsWith(pk) || pk.startsWith(hn)) return 80;          // prefix
      if (hn.includes(pk) || pk.includes(hn)) return 60;              // contains
      // token overlap
      const pkTokens = pk.match(/[A-Z0-9]+/g) || [];
      const hnTokens = hn.match(/[A-Z0-9]+/g) || [];
      const overlap = pkTokens.filter(t => t.length > 2 && hnTokens.some(h => h.includes(t) || t.includes(h)));
      return overlap.length > 0 ? 40 : 0;
    }

    _mpImageResults = [];
    Object.entries(parsed).forEach(([rawKey, val]) => {
      if (!val || !val.price || isNaN(val.price)) return;
      // Find best matching holding
      let bestHolding = null, bestScore = 0;
      state.holdings.forEach(h => {
        const sc = matchScore(rawKey, h);
        if (sc > bestScore) { bestScore = sc; bestHolding = h; }
      });
      // Only auto-link if score is good enough, else show as unmatched for manual fix
      _mpImageResults.push({
        name: rawKey,
        price: parseFloat(val.price),
        date: val.date || '',
        holding: bestScore >= 40 ? bestHolding : null,
        score: bestScore
      });
    });

    if (!_mpImageResults.length) {
      showToast('ไม่พบราคาในรูป -- ลองรูปที่ชัดกว่า');
      btn.disabled=false; sp.style.display='none'; return;
    }

    // Build holding selector options
    const holdingOptions = ['<option value="">-- ไม่จับคู่ --</option>',
      ...state.holdings.map((h,i) => `<option value="${i}">${esc(h.name||h.ticker)}</option>`)
    ].join('');

    // Render editable result rows with dropdown for manual rematch
    const listEl = document.getElementById('mp-img-list');
    listEl.innerHTML = _mpImageResults.map((r, i) => {
      const matchedIdx = r.holding ? state.holdings.indexOf(r.holding) : -1;
      const matchLabel = r.score >= 80 ? '✅' : r.score >= 40 ? '⚠️ โปรดตรวจสอบ' : '❌ เลือกเอง';
      return `<div style="background:var(--bg);border-radius:8px;padding:10px;margin-bottom:4px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <div style="flex:1;font-size:12px;font-weight:500;color:var(--text);">${esc(r.name)}</div>
          <span style="font-size:10px;color:${r.score>=80?'var(--green)':r.score>=40?'var(--amber)':'var(--red)'};">${matchLabel}</span>
          <input type="number" step="0.0001" id="mp-img-inp-${i}" value="${r.price}"
            style="width:90px;font-family:var(--font);font-size:12px;color:var(--text);background:var(--surface);border:0.5px solid var(--border2);border-radius:7px;padding:5px 8px;text-align:right;outline:none;">
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:10px;color:var(--text3);">จับคู่กับ:</span>
          <select id="mp-img-sel-${i}" style="flex:1;font-family:var(--font);font-size:11px;color:var(--text);background:var(--surface);border:0.5px solid var(--border2);border-radius:6px;padding:3px 6px;outline:none;">
            ${state.holdings.map((h,hi) => `<option value="${hi}" ${hi===matchedIdx?'selected':''}>${esc(h.name||h.ticker)}</option>`).join('')}
            <option value="-1" ${matchedIdx===-1?'selected':''}>-- ไม่จับคู่ (ข้ามไป) --</option>
          </select>
        </div>
        ${r.date ? `<div style="font-size:10px;color:var(--text3);margin-top:3px;">วันที่: ${esc(r.date)}</div>` : ''}
      </div>`;
    }).join('');

    document.getElementById('mp-img-result').style.display = '';
    document.getElementById('mp-img-save-btn').style.display = '';
    const autoMatched = _mpImageResults.filter(r => r.score >= 40).length;
    showToast(`พบ ${_mpImageResults.length} รายการ จับคู่อัตโนมัติ ${autoMatched} รายการ ✓`);
  } catch(e) {
    showToast('Error: ' + e.message);
  }
  btn.disabled=false; sp.style.display='none';
}

function mpSaveFromImage() {
  let count = 0;
  _mpImageResults.forEach((r, i) => {
    const val = parseFloat(document.getElementById('mp-img-inp-' + i)?.value);
    if (!val || val <= 0) return;
    const selIdx = parseInt(document.getElementById('mp-img-sel-' + i)?.value ?? '-1');
    if (selIdx < 0 || selIdx >= state.holdings.length) return;
    const targetHolding = state.holdings[selIdx];
    if (!targetHolding) return;
    const nameKey = (targetHolding.name || targetHolding.ticker).toUpperCase();
    state.holdings.forEach(h => {
      if ((h.name||h.ticker).toUpperCase() !== nameKey) return;
      // livePrice = ราคาตลาด, avgPrice = ต้นทุน (ไม่แตะ)
      h.livePrice = val;
      h.change = h.avgPrice > 0
        ? parseFloat(((val - h.avgPrice) / h.avgPrice * 100).toFixed(2))
        : 0;
      h.value = Math.round(valueThb(h)); // แปลง USD→THB เหมือนตอนดึงจาก Sheet
      count++;
    });
  });
  if (count > 0) {
    savePriceCache();
    updatePortfolioSummary(); renderHoldings();
    renderAllocation(); initPhase9(); initPhase10(); initPhase11(); initPhase12(); p14TrackDrawdown();
    showToast('บันทึกราคาจากรูป ' + count + ' รายการ ✓');
    closeModal('manual-price-modal');
  } else {
    showToast('ไม่มีรายการที่บันทึกได้ -- เลือก holding ให้ครบก่อน');
  }
}
