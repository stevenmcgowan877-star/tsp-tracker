import { test } from "node:test";
import assert from "node:assert/strict";
import { runBacktest, alignSeries, START_VALUE } from "../lib/backtest.js";

// Deterministic synthetic history: C trends up with a wobble, S trends down,
// I and F sideways, G accrues steadily. 700 trading days.
function synthetic(days = 700) {
  const mk = (fn) => Array.from({ length: days }, (_, i) => ({ date: dateAt(i), close: +fn(i).toFixed(4), volume: 0 }));
  return {
    G: mk((i) => 15 + i * 0.001),
    C: mk((i) => 30 + i * 0.03 + 1.5 * Math.sin(i / 9)),
    S: mk((i) => 60 - i * 0.02 + 1.2 * Math.cos(i / 7)),
    I: mk((i) => 25 + 0.8 * Math.sin(i / 11)),
    F: mk((i) => 20 + 0.3 * Math.sin(i / 13)),
  };
}
function dateAt(i) {
  const d = new Date(Date.UTC(2020, 0, 1) + i * 86400000);
  return d.toISOString().slice(0, 10);
}

test("alignSeries keeps only dates present in every fund", () => {
  const s = synthetic(50);
  s.F = s.F.slice(5); // F missing the first five days
  const { dates, closes } = alignSeries(s);
  assert.equal(dates.length, 45);
  assert.equal(closes.C.length, 45);
  assert.equal(closes.C[0], s.C[5].close);
});

test("runBacktest replays both strategies with consistent curves and stats", () => {
  const r = runBacktest(synthetic(), { lookback: 100 });
  assert.equal(r.days, 700 - 1 - 200, "warm-up is the longer of lookback and the 200-day trend window");
  assert.equal(r.curve[0].trend, START_VALUE);
  assert.equal(r.curve[0].composite, START_VALUE);
  assert.equal(r.curve[0].C, START_VALUE);
  for (const key of ["trend", "composite"]) {
    const s = r.strategies[key];
    assert.ok(s.final > 0);
    assert.ok(s.maxDrawdown <= 0 && s.maxDrawdown >= -1);
    const share = Object.values(s.timeIn).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(share - 1) < 1e-9, `${key} time-in shares sum to one`);
    assert.ok(s.annual.length >= 1);
    assert.ok(Array.isArray(s.recentSwitches));
  }
  assert.ok(r.benchmarks.C.final > START_VALUE, "C trends up in the synthetic data");
  assert.equal(r.benchmarks.G.maxDrawdown, 0, "G never draws down");
  assert.ok(r.curve.every((p) => ["G", "C", "S", "I", "F"].includes(p.held)));
  assert.deepEqual(r.trendRule, { n: 200, band: 0.03 });
});

test("the trend strategy only ever holds C or G and rides the C uptrend", () => {
  const r = runBacktest(synthetic(), { lookback: 100 });
  const t = r.strategies.trend;
  assert.equal(t.timeIn.S + t.timeIn.I + t.timeIn.F, 0);
  assert.ok(t.timeIn.C > 0.5, `expected mostly C, got ${JSON.stringify(t.timeIn)}`);
  assert.ok(t.switches <= 6, `trend rule should switch rarely, got ${t.switches}`);
  for (const sw of t.recentSwitches) assert.ok(["C", "G"].includes(sw.to));
});

test("both strategies respect the two-transfers-per-month rule", () => {
  const r = runBacktest(synthetic(), { lookback: 100 });
  for (const key of ["trend", "composite"]) {
    const perMonth = {};
    for (const sw of r.strategies[key].recentSwitches) {
      if (sw.to === "G") continue; // moves into G are unrestricted
      const m = sw.date.slice(0, 7);
      perMonth[m] = (perMonth[m] || 0) + 1;
    }
    for (const [m, c] of Object.entries(perMonth)) assert.ok(c <= 2, `${key}: ${c} restricted transfers in ${m}`);
  }
});

test("runBacktest honours a start/end window and rejects an empty one", () => {
  const r = runBacktest(synthetic(), { lookback: 100, start: "2020-09-01", end: "2021-03-01" });
  assert.ok(r.start >= "2020-09-01");
  assert.ok(r.end <= "2021-03-01");
  assert.throws(() => runBacktest(synthetic(300), { lookback: 100, start: "2030-01-01" }), /empty|Not enough/);
});

test("runBacktest needs more history than the warm-up", () => {
  assert.throws(() => runBacktest(synthetic(150), { lookback: 100 }), /Not enough history/);
});
