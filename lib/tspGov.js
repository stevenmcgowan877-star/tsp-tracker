// Official TSP share prices from tsp.gov.
//
// The endpoint returns the full daily history for every fund as CSV (about
// 560 KB, newest row first, blank trailing row). It ignores the date-range
// query parameters, so we fetch once, keep the whole history (the backtest
// needs it; the dashboard slices the last MAX_BARS), and cache for
// CACHE_TTL_MS. tsp.gov sits behind CloudFront, which
// rejects requests without a browser-like User-Agent.

export const TSP_CSV_URL = "https://www.tsp.gov/data/fund-price-history.csv";
export const MAX_BARS = 120;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // prices update once per trading day
const USER_AGENT = "Mozilla/5.0 (compatible; tsp-tracker/1.0; +https://github.com/stevenmcgowan877-star/tsp-tracker)";

// Column header -> fund id
const FUND_COLUMNS = { "G Fund": "G", "F Fund": "F", "C Fund": "C", "S Fund": "S", "I Fund": "I" };

let cache = null;    // { data, fetchedAt }
let inflight = null; // Promise shared by concurrent callers while a fetch is running

// Parse the tsp.gov CSV into { G: [{date, close, volume}], ... } ordered
// oldest -> newest, optionally trimmed to the last maxBars rows. Rows with a
// missing or non-numeric price for a fund are skipped for that fund only.
export function parseTspCsv(text, maxBars = Infinity) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("tsp.gov CSV is empty");

  const headers = lines[0].split(",").map((h) => h.trim());
  const dateIdx = headers.findIndex((h) => /^date$/i.test(h));
  if (dateIdx === -1) throw new Error("tsp.gov CSV has no Date column");

  const columns = [];
  const lColumns = []; // Lifecycle funds: "L Income", "L 2030" ... "L 2075"
  headers.forEach((h, i) => {
    const id = FUND_COLUMNS[h];
    if (id) columns.push({ id, idx: i });
    else if (/^L (Income|\d{4})$/.test(h)) lColumns.push({ name: h, idx: i });
  });
  if (columns.length !== 5) throw new Error(`tsp.gov CSV missing fund columns (found ${columns.length})`);

  const series = {};
  for (const { id } of columns) series[id] = [];
  const lSeries = {};
  for (const { name } of lColumns) lSeries[name] = [];

  for (let r = 1; r < lines.length; r++) {
    const cells = lines[r].split(",");
    const date = (cells[dateIdx] || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    for (const { id, idx } of columns) {
      const close = parseFloat(cells[idx]);
      if (Number.isFinite(close) && close > 0) series[id].push({ date, close, volume: 0 });
    }
    for (const { name, idx } of lColumns) {
      const close = parseFloat(cells[idx]);
      if (Number.isFinite(close) && close > 0) lSeries[name].push({ date, close, volume: 0 });
    }
  }

  const sortTrim = (arr) => {
    arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return Number.isFinite(maxBars) ? arr.slice(-maxBars) : arr;
  };
  for (const id of Object.keys(series)) {
    series[id] = sortTrim(series[id]);
    if (series[id].length < 30) throw new Error(`tsp.gov CSV has too few rows for ${id} Fund`);
  }
  // L Funds are optional extras: keep those with any history, newest funds included.
  const L = {};
  for (const name of Object.keys(lSeries)) {
    const arr = sortTrim(lSeries[name]);
    if (arr.length >= 30) L[name] = arr;
  }
  if (Object.keys(L).length) series.L = L;
  return series;
}

// Returns the parsed series for all five funds, or null when tsp.gov is
// unreachable or unparseable. Callers fall back to ETF proxies on null.
// Concurrent callers share one download; `fresh` bypasses the cache (the
// daily flip check must see today's close, not a copy from hours earlier).
export async function fetchTspPrices({ fetchImpl = fetch, now = Date.now(), fresh = false } = {}) {
  if (!fresh && cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetchImpl(TSP_CSV_URL, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/csv,text/plain,*/*" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const data = parseTspCsv(text);
      cache = { data, fetchedAt: now };
      return data;
    } catch (e) {
      console.warn(`tsp.gov fetch failed, falling back to ETF proxies: ${e.message}`);
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function _resetTspCache() {
  cache = null;
  inflight = null;
}
