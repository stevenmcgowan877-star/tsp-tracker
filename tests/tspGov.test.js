import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTspCsv, fetchTspPrices, _resetTspCache, TSP_CSV_URL } from "../lib/tspGov.js";

const HEADER = "Date,L Income,L 2030,L 2035,L 2040,L 2045,L 2050,L 2055,L 2060,L 2065,L 2070,L 2075,G Fund,F Fund,C Fund,S Fund,I Fund";

// Build a tsp.gov-shaped CSV: newest first, blank trailing row, as the real feed does.
function sampleCsv(days = 40) {
  const rows = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.UTC(2026, 9, 5) - i * 86400000).toISOString().slice(0, 10);
    const g = (20.27 - i * 0.001).toFixed(4);
    const c = (125.44 - i * 0.3).toFixed(4);
    rows.push(`${d},31.15,63.77,19.63,75.74,21.06,46.92,24.74,24.74,24.74,14.66,12.80,${g},20.29,${c},114.72,65.16`);
  }
  rows.push("2003-05-31,,,,,,,,,,,,10.0000,10.0000,10.0000,10.0000,10.0000");
  rows.push(",,,,,,,,,,,,,,,,");
  return [HEADER, ...rows].join("\r\n") + "\r\n";
}

test("parseTspCsv returns the five funds oldest-first and trimmed", () => {
  const series = parseTspCsv(sampleCsv(200), 120);
  assert.deepEqual(Object.keys(series).sort(), ["C", "F", "G", "I", "S"]);
  assert.equal(series.C.length, 120);
  assert.ok(series.C[0].date < series.C[119].date);
  assert.equal(series.C[119].date, "2026-10-05");
  assert.equal(series.C[119].close, 125.44);
  assert.equal(series.G[119].close, 20.27);
  assert.equal(series.C[119].volume, 0);
});

test("parseTspCsv ignores blank rows and the L-fund columns", () => {
  const series = parseTspCsv(sampleCsv(40));
  // 40 daily rows + the 2003 row; the empty trailing row is dropped.
  assert.equal(series.G.length, 41);
  assert.equal(series.G[0].date, "2003-05-31");
  assert.equal(series.G[0].close, 10);
});

test("parseTspCsv rejects a CSV without fund columns", () => {
  assert.throws(() => parseTspCsv("Date,Foo\n2026-10-05,1\n"), /missing fund columns/);
  assert.throws(() => parseTspCsv("Date,Foo\n"), /missing fund columns|empty/);
});

test("fetchTspPrices sends a browser-like User-Agent and caches the result", async () => {
  _resetTspCache();
  let calls = 0;
  let seenUrl = null;
  let seenUA = null;
  const fetchImpl = async (url, opts) => {
    calls++;
    seenUrl = url;
    seenUA = opts.headers["User-Agent"];
    return { ok: true, status: 200, text: async () => sampleCsv(50) };
  };
  const first = await fetchTspPrices({ fetchImpl, now: 1000 });
  const second = await fetchTspPrices({ fetchImpl, now: 2000 });
  assert.equal(calls, 1);
  assert.equal(seenUrl, TSP_CSV_URL);
  assert.match(seenUA, /^Mozilla\/5\.0/);
  assert.equal(first, second);
  assert.equal(first.I.length, 51);
});

test("fetchTspPrices returns null on HTTP errors or bad bodies instead of throwing", async () => {
  _resetTspCache();
  const forbidden = await fetchTspPrices({ fetchImpl: async () => ({ ok: false, status: 403, text: async () => "" }), now: 1 });
  assert.equal(forbidden, null);
  const garbage = await fetchTspPrices({ fetchImpl: async () => ({ ok: true, status: 200, text: async () => "<html>nope</html>" }), now: 2 });
  assert.equal(garbage, null);
});
