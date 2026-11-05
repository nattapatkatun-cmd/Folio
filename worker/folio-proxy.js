// Folio proxy — Cloudflare Worker
// เส้นทางเดิม (ห้ามเปลี่ยนรูปแบบ response — หน้าเว็บเดิมใช้อยู่):
//   ?ticker=SYM                      → { price, change, prev }
//   ?nav_proj=PROJ&nav_date=YYYY-MM-DD → { last_val, previous_val, nav_date }   (SEC V1)
//   ?index=SET                       → { price, prev }
// เส้นทางใหม่ (แดชบอร์ดสัญญาณ):
//   ?macro=1                         → การ์ด Macro 9 ตัว (ค่าล่าสุด / เปลี่ยน 1 วัน / 7 วัน)
//   ?chart=SYM[&range=10y]           → ราคาปิดรายวันย้อนหลัง (Yahoo) + เงินปันผลในอดีต
//   ?calendar=1                      → ปฏิทินเศรษฐกิจสัปดาห์นี้+หน้า (Forex Factory feed)
//   ?fund_search=ABBR                → หา proj_id ของกองทุนจากชื่อย่อ (SEC)
//   ?nav_hist=PROJ&from=&to=[&cls=]  → NAV รายวันย้อนหลัง (SEC V2)
//   ?dividend=PROJ                   → ประวัติปันผลกองทุน (SEC V2)
//
// Secret ที่ต้องตั้ง (Cloudflare → Worker → Settings → Variables and Secrets):
//   SEC_KEY = subscription key ของ api-portal.sec.or.th   (ห้ามใส่ในโค้ด)

const YH = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const UA = { 'User-Agent': 'Mozilla/5.0' };

// symbol ของ Yahoo: ตัวแรกคือตัวหลัก ตัวถัดไปคือตัวสำรองถ้าตัวหลักไม่มีข้อมูล
const MACRO = [
  { key: 'US10Y',  syms: ['^TNX'] },
  { key: 'DXY',    syms: ['DX-Y.NYB'] },
  { key: 'USDTHB', syms: ['THB=X', 'USDTHB=X'] },
  { key: 'SPX',    syms: ['^GSPC'] },
  { key: 'NDX',    syms: ['^IXIC'] },
  { key: 'SET',    syms: ['^SET.BK', '^SETI', '^SET'] },
  { key: 'GOLD',   syms: ['GC=F'] },
  { key: 'VIX',    syms: ['^VIX'] },
  { key: 'BRENT',  syms: ['BZ=F'] },
];

export default {
  async fetch(req, env, ctx) {
    const h = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    const j = (o, ttl) => new Response(JSON.stringify(o), {
      headers: ttl ? { ...h, 'Cache-Control': 'public, max-age=' + ttl } : h,
    });
    if (req.method === 'OPTIONS') return new Response(null, { headers: h });
    const p = new URL(req.url).searchParams;
    const SEC_KEY = env && env.SEC_KEY ? String(env.SEC_KEY).trim() : '';  // ตัดช่องว่าง/ขึ้นบรรทัดที่ติดมาตอนวาง
    const secHeaders = { accept: 'application/json', 'Ocp-Apim-Subscription-Key': SEC_KEY || '' };

    // ─── เดิม: ราคาล่าสุด ───
    if (p.get('ticker')) {
      try {
        const url = YH + encodeURIComponent(p.get('ticker')) + '?interval=1d&range=2d';
        const r = await fetch(url, { headers: UA });
        const d = await r.json();
        const m = d && d.chart && d.chart.result && d.chart.result[0] && d.chart.result[0].meta;
        if (!m) return j({ error: 'no data' });
        const price = m.regularMarketPrice;
        const prev = m.previousClose || m.chartPreviousClose;
        return j({ price: price, change: parseFloat(((price - prev) / prev * 100).toFixed(2)), prev: prev });
      } catch (e) { return j({ error: e.message }); }
    }

    // ─── เดิม: NAV วันเดียว (SEC V1) ───
    if (p.get('nav_proj') && p.get('nav_date')) {
      if (!SEC_KEY) return j({ error: 'SEC_KEY secret not set' });
      try {
        const url = 'https://api.sec.or.th/FundDailyInfo/' + p.get('nav_proj') + '/dailynav/' + p.get('nav_date');
        const r = await fetch(url, { headers: secHeaders });
        if (r.status === 204) return j({ error: 'no NAV', status: 204, proj: p.get('nav_proj'), date: p.get('nav_date') });
        if (r.status === 401) return j({ error: 'invalid key', status: 401 });
        if (r.status === 404) return j({ error: 'proj_id not found', status: 404, proj: p.get('nav_proj') });
        const text = await r.text();
        if (!text || !text.trim()) return j({ error: 'empty', status: r.status });
        let d;
        try { d = JSON.parse(text); }
        catch (e) { return j({ error: 'invalid JSON', status: r.status, raw: text.substring(0, 200) }); }
        if (Array.isArray(d) && d.length > 0) d = d[0];
        if (d && d.last_val) return j({ last_val: d.last_val, previous_val: d.previous_val, nav_date: d.nav_date });
        return j({ error: 'no last_val', status: r.status, raw: JSON.stringify(d).substring(0, 200) });
      } catch (e) { return j({ error: e.message }); }
    }

    // ─── เดิม: SET Index ───
    if (p.get('index') === 'SET') {
      try {
        const url = YH + '%5ESETI?interval=1d&range=2d';
        const r = await fetch(url, { headers: UA });
        const d = await r.json();
        const m = d && d.chart && d.chart.result && d.chart.result[0] && d.chart.result[0].meta;
        if (!m) return j({ error: 'no data' });
        return j({ price: m.regularMarketPrice, prev: m.previousClose });
      } catch (e) { return j({ error: e.message }); }
    }

    // ─── ใหม่: การ์ด Macro ───
    if (p.get('macro')) {
      return cached(req, ctx, 900, async () => {
        const items = await Promise.all(MACRO.map(async m => {
          for (const s of m.syms) {
            const s1 = await yahooSeries(s, '1mo', false).catch(() => null);
            if (s1 && s1.c.length >= 2) {
              const n = s1.c.length;
              const price = s1.price != null ? s1.price : s1.c[n - 1];
              const lastT = s1.t[n - 1];
              // ใช้ราคาปิด "วันก่อนหน้าจริง" ไม่ใช่ chartPreviousClose (อันนั้นคือก่อนต้นช่วง range)
              // แท่งสุดท้ายเป็นของ session เดียวกับราคาล่าสุด (ห่างกันไม่ถึง 20 ชม.) → วันก่อนหน้าคือแท่ง n-2
              const mt = s1.marketTime || lastT;
              const sameSession = mt >= lastT && mt - lastT < 20 * 3600;
              const prev = sameSession ? s1.c[n - 2] : s1.c[n - 1];
              // 7 วันปฏิทิน: ราคาปิดล่าสุดที่ไม่เกิน lastT - 7 วัน
              let wk = null;
              for (let i = n - 1; i >= 0; i--) if (s1.t[i] <= lastT - 7 * 86400) { wk = s1.c[i]; break; }
              return {
                key: m.key, symbol: s, price, prev, week: wk,
                asOf: s1.marketTime || lastT, currency: s1.currency,
                spark: s1.c.slice(-22),
              };
            }
          }
          // บางดัชนี Yahoo ให้แค่ meta ไม่มีแท่งรายวัน → ใช้ราคาล่าสุด + ราคาปิดก่อนหน้าจาก meta
          for (const s of m.syms) {
            const mm = await yahooMeta(s).catch(() => null);
            if (mm && mm.price != null) return { key: m.key, symbol: s, price: mm.price, prev: mm.prev, week: null, asOf: mm.time, currency: mm.currency, spark: [] };
          }
          return { key: m.key, error: 'no data (' + m.syms.join(', ') + ')' };
        }));
        return { items, fetchedAt: Math.floor(Date.now() / 1000) };
      }, j);
    }

    // ─── ใหม่: ราคาย้อนหลังรายวัน ───
    if (p.get('chart')) {
      const range = /^(1y|2y|5y|10y|max)$/.test(p.get('range') || '') ? p.get('range') : '10y';
      return cached(req, ctx, 3600, async () => {
        const s = await yahooSeries(p.get('chart'), range, true);
        if (!s || s.c.length < 2) return { error: 'no data', symbol: p.get('chart') };
        return s;
      }, j);
    }

    // ─── ใหม่: ปฏิทินเศรษฐกิจ ───
    if (p.get('calendar')) {
      return cached(req, ctx, 3600, async () => {
        const hosts = ['https://nfs.faireconomy.media/', 'https://cdn-nfs.faireconomy.media/'];
        const out = []; const notes = [];
        for (const wk of ['ff_calendar_thisweek.json', 'ff_calendar_nextweek.json']) {
          let ok = false;
          for (const host of hosts) {
            try {
              const r = await fetch(host + wk, { headers: UA });
              const text = await r.text();
              if (!r.ok) { notes.push(wk + ' ' + host.slice(8, -1) + ': HTTP ' + r.status); continue; }
              let d; try { d = JSON.parse(text); } catch (e) { notes.push(wk + ' ' + host.slice(8, -1) + ': not JSON'); continue; }
              if (Array.isArray(d)) { d.forEach(e => out.push(e)); ok = true; break; }
            } catch (e) { notes.push(wk + ' ' + host.slice(8, -1) + ': ' + e.message); }
          }
          if (!ok) notes.push(wk + ' unavailable');
        }
        const events = out
          .filter(e => e && (e.impact === 'High' || e.impact === 'Medium'))
          .map(e => ({ title: e.title, country: e.country, date: e.date, impact: e.impact, forecast: e.forecast || '', previous: e.previous || '' }));
        return { events, notes, source: 'Forex Factory' };
      }, j);
    }

    // ─── ใหม่: ค้นหา proj_id กองทุน ───
    if (p.get('fund_search')) {
      if (!SEC_KEY) return j({ error: 'SEC_KEY secret not set' });
      const q = p.get('fund_search').trim();
      return cached(req, ctx, 86400 * 7, async () => {
        let v2 = '';
        // V2
        try {
          const r = await fetch('https://api.sec.or.th/v2/fund/general-info/profiles?project_info=' + encodeURIComponent(q), { headers: secHeaders });
          v2 = 'HTTP ' + r.status;
          if (!r.ok) v2 += ' ' + (await r.text()).slice(0, 120).replace(/\s+/g, ' ');
          if (r.ok) {
            const rows = pickRows(await r.json());
            if (rows.length) return { source: 'v2', funds: rows.map(f => ({ proj_id: f.proj_id, abbr: f.proj_abbr_name, name: f.proj_name_th || f.proj_name_en, cls: f.fund_class_name || '' })) };
          }
        } catch (e) { v2 = e.message; }
        // V1
        try {
          const r = await fetch('https://api.sec.or.th/FundFactsheet/fund', {
            method: 'POST', headers: { ...secHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: q }),
          });
          if (r.ok) {
            const rows = pickRows(await r.json());
            if (rows.length) return { source: 'v1', funds: rows.map(f => ({ proj_id: f.proj_id, abbr: f.proj_abbr_name, name: f.proj_name_th || f.proj_name_en, cls: '' })) };
          }
          return { error: r.status === 401 ? 'invalid key (401)' : 'not found', status: r.status, v2, v1: 'HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120).replace(/\s+/g, ' ') };
        } catch (e) { return { error: e.message }; }
      }, j);
    }

    // ─── ใหม่: NAV ย้อนหลัง (SEC V2) ───
    if (p.get('nav_hist')) {
      if (!SEC_KEY) return j({ error: 'SEC_KEY secret not set' });
      const proj = p.get('nav_hist'), from = p.get('from'), to = p.get('to'), cls = p.get('cls') || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) return j({ error: 'from/to must be YYYY-MM-DD' });
      return cached(req, ctx, 3 * 3600, async () => {
        const rows = []; let cursor = ''; let status = 0;
        for (let page = 0; page < 40; page++) {
          let url = 'https://api.sec.or.th/v2/fund/daily-info/nav?proj_id=' + encodeURIComponent(proj) +
            '&start_nav_date=' + from + '&end_nav_date=' + to;
          if (cls) url += '&fund_class_name=' + encodeURIComponent(cls);
          if (cursor) url += '&cursor=' + encodeURIComponent(cursor);
          const r = await fetch(url, { headers: secHeaders });
          status = r.status;
          if (r.status === 204) break;
          if (!r.ok) return { error: 'SEC ' + r.status, status: r.status, raw: (await r.text()).substring(0, 200) };
          const d = await r.json();
          pickRows(d).forEach(x => rows.push({ d: x.nav_date, v: Number(x.last_val), cls: x.fund_class_name || '' }));
          cursor = d && (d.next_cursor || (d.pagination && d.pagination.next_cursor)) || '';
          if (!cursor) break;
        }
        return { proj, rows, status };
      }, j);
    }

    // ─── ใหม่: ประวัติปันผลกองทุน (SEC V2) ───
    if (p.get('dividend')) {
      if (!SEC_KEY) return j({ error: 'SEC_KEY secret not set' });
      const proj = p.get('dividend');
      const to = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
      const from = new Date(Date.now() - 3 * 365 * 86400000).toISOString().slice(0, 10);
      return cached(req, ctx, 12 * 3600, async () => {
        const r = await fetch('https://api.sec.or.th/v2/fund/daily-info/dividend-history?proj_id=' + encodeURIComponent(proj) +
          '&start_dividend_date=' + from + '&end_dividend_date=' + to, { headers: secHeaders });
        if (r.status === 204) return { proj, rows: [] };
        if (!r.ok) return { error: 'SEC ' + r.status, status: r.status };
        const rows = pickRows(await r.json()).map(x => ({
          cls: x.class_abbr_name || '', bookClose: x.book_close_date || '', payDate: x.dividend_date || '', value: Number(x.dividend_value) || 0,
        }));
        return { proj, rows };
      }, j);
    }

    return j({ error: 'unknown route' });
  },
};

// Yahoo chart → { symbol, currency, t[], c[], price, marketTime, div[] }
async function yahooSeries(sym, range, withDiv) {
  const url = YH + encodeURIComponent(sym) + '?interval=1d&range=' + range + (withDiv ? '&events=div' : '');
  const r = await fetch(url, { headers: UA });
  if (!r.ok) return null;
  const d = await r.json();
  const res = d && d.chart && d.chart.result && d.chart.result[0];
  if (!res || !res.timestamp) return null;
  const q = res.indicators && res.indicators.quote && res.indicators.quote[0];
  const adj = res.indicators && res.indicators.adjclose && res.indicators.adjclose[0] && res.indicators.adjclose[0].adjclose;
  const t = [], c = [];
  res.timestamp.forEach((ts, i) => {
    const v = q && q.close ? q.close[i] : null;
    if (v != null && isFinite(v)) { t.push(ts); c.push(v); }
  });
  const div = [];
  if (withDiv && res.events && res.events.dividends) {
    Object.values(res.events.dividends).forEach(x => div.push({ t: x.date, v: x.amount }));
    div.sort((a, b) => a.t - b.t);
  }
  const m = res.meta || {};
  return {
    symbol: m.symbol || sym, currency: m.currency || '', tz: m.exchangeTimezoneName || '',
    t, c, price: m.regularMarketPrice != null ? m.regularMarketPrice : null,
    marketTime: m.regularMarketTime || null, div, hasAdj: !!adj,
  };
}

async function yahooMeta(sym) {
  const r = await fetch(YH + encodeURIComponent(sym) + '?interval=1d&range=5d', { headers: UA });
  if (!r.ok) return null;
  const d = await r.json();
  const m = d && d.chart && d.chart.result && d.chart.result[0] && d.chart.result[0].meta;
  if (!m || m.regularMarketPrice == null) return null;
  return { price: m.regularMarketPrice, prev: m.previousClose || m.chartPreviousClose || null, time: m.regularMarketTime || null, currency: m.currency || '' };
}

// SEC บางเวอร์ชันส่ง array ตรง ๆ บางเวอร์ชันห่อใน data/items/result
function pickRows(d) {
  if (Array.isArray(d)) return d;
  if (!d || typeof d !== 'object') return [];
  for (const k of ['data', 'items', 'result', 'results', 'value']) if (Array.isArray(d[k])) return d[k];
  return [];
}

// แคช response ที่สำเร็จไว้ใน edge cache — ลดการยิง Yahoo/SEC/FF ซ้ำ
async function cached(req, ctx, ttl, build, j) {
  const cache = caches.default;
  const key = new Request(req.url, { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;
  let body;
  try { body = await build(); } catch (e) { body = { error: e.message }; }
  const res = j(body, body && body.error ? 0 : ttl);
  if (!(body && body.error)) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}
