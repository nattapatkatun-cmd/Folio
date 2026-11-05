# folio-proxy (Cloudflare Worker)

`folio-proxy.js` replaces the old Worker code. The 3 existing routes (`?ticker=`, `?nav_proj=&nav_date=`, `?index=SET`) **still return data in the same format**. New routes for the signals dashboard are added on top.

## Deploy steps (through the Cloudflare Dashboard)

1. Cloudflare Dashboard → **Workers & Pages** → `folio-proxy` → **Edit code**
2. Delete the old code, paste in all of `folio-proxy.js`, then press **Deploy**
3. Go to **Settings → Variables and Secrets → Add**
   - Type: **Secret** · Name: `SEC_KEY` · Value: your key from api-portal.sec.or.th
   - The SEC key is no longer hardcoded. Without this secret, the fund routes will return `SEC_KEY secret not set`
4. On api-portal.sec.or.th, check that the key is subscribed to **Fund Factsheet API** and **Fund Daily Info API** (the newer V2 versions). NAV history and dividends use V2

## Quick test after deploying (open in a browser)

| URL | What you should see |
|---|---|
| `…workers.dev/?ticker=PTT.BK` | `{"price":…,"change":…,"prev":…}` (same as before) |
| `…workers.dev/?macro=1` | `items` with 9 entries (US10Y … BRENT) |
| `…workers.dev/?chart=VOO&range=1y` | arrays `t` and `c` |
| `…workers.dev/?calendar=1` | `events` (only High/Medium impact items) |
| `…workers.dev/?fund_search=K-US500X` | `funds` with `proj_id` |
| `…workers.dev/?nav_hist=<proj_id>&from=2025-01-01&to=2025-12-31` | `rows` with `d`, `v` |

If you get `SEC 401/403`, the key isn't subscribed to the V2 API yet. If `calendar` comes back with an empty `events`, the Forex Factory feed couldn't be reached.

## Notes
- Responses are cached at the Cloudflare edge (macro 15 min, chart 1 hr, calendar 1 hr, NAV 3 hr, fund search 7 days) to avoid hitting Yahoo/SEC too often
- Fed and กนง. meeting dates live in the app (`SG_CB_EVENTS` in index.html). They need updating at the start of each year from federalreserve.gov and bot.or.th
- The Forex Factory feed is unofficial and could change or disappear at any time
