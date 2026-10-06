import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTspCsv } from "../lib/tspGov.js";
import { lFundNames, compareLFunds } from "../lib/lfunds.js";

const HEADER = "Date,L Income,L 2030,L 2035,L 2040,L 2045,L 2050,L 2055,L 2060,L 2065,L 2070,L 2075,G Fund,F Fund,C Fund,S Fund,I Fund";
function csv(days) {
  const rows = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.UTC(2026, 9, 5) - i * 86400000).toISOString().slice(0, 10);
    const k = days - i;
    // L 2075 only exists for the last 100 rows (a young fund); L 2050 always.
    const l2075 = k > days - 100 ? (12 + k * 0.001).toFixed(4) : "";
    rows.push(`${d},${(31 + k * 0.002).toFixed(4)},63,19,75,21,${(46 + k * 0.01).toFixed(4)},24,24,24,14,${l2075},${(20 + k * 0.001).toFixed(4)},20.29,${(100 + k * 0.05).toFixed(4)},114.72,65.16`);
  }
  return [HEADER, ...rows, ",,,,,,,,,,,,,,,,"].join("\n");
}

test("parseTspCsv keeps the L Funds under series.L and drops ones with no history", () => {
  const s = parseTspCsv(csv(700));
  assert.ok(s.L, "L bucket present");
  assert.equal(s.L["L 2050"].length, 700);
  assert.equal(s.L["L 2075"].length, 100, "young fund keeps only its rows");
  assert.equal(s.L["L Income"][0].date < s.L["L Income"][699].date, true, "oldest first");
  assert.deepEqual(lFundNames(s).slice(0, 2), ["L Income", "L 2030"]);
  assert.equal(s.C.length, 700);
});

test("parseTspCsv still works on a CSV with no L columns", () => {
  const text = "Date,G Fund,F Fund,C Fund,S Fund,I Fund\n" + Array.from({ length: 40 }, (_, i) => `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, "0")},20,20,100,110,60`).join("\n");
  const s = parseTspCsv(text);
  assert.equal(s.L, undefined);
  assert.equal(s.C.length, 40);
});

test("compareLFunds reports stats on the same window as the benchmarks and flags young funds", () => {
  const s = parseTspCsv(csv(700));
  const r = compareLFunds(s, { start: "2025-10-01" });
  assert.ok(r.start >= "2025-10-01");
  assert.equal(r.benchmarks.C.curve.length, r.dates.length);
  assert.equal(r.benchmarks.trend.curve.length, r.dates.length);
  assert.ok(r.benchmarks.C.vol > 0, "benchmarks carry volatility too");
  assert.equal(r.benchmarks.G.vol >= 0, true);
  assert.equal(typeof r.benchmarks.trend.switches, "number");
  assert.equal("_dateIndex" in r, false);
  const l2050 = r.funds.find((f) => f.name === "L 2050");
  assert.equal(l2050.available, true);
  assert.equal(l2050.partial, false);
  assert.ok(l2050.cagr > 0 && l2050.maxDrawdown <= 0);
  assert.equal(l2050.curve.length, r.dates.length);
  assert.equal(l2050.curve[0], 10000);
  const l2075 = r.funds.find((f) => f.name === "L 2075");
  assert.equal(l2075.available, true);
  assert.equal(l2075.partial, true, "young fund starts after the window");
  assert.equal(l2075.curve[0], null, "no value before its first date");
});
