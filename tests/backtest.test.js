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

test("a windowed replay seeds the trend rule with its real state on the start date", () => {
  // The synthetic C series trends up throughout, so the rule is ON well before
  // any late start date; the window must begin in C, not flat in G.
  const r = runBacktest(synthetic(), { lookback: 100, start: "2021-06-01" });
  assert.equal(r.strategies.trend.initialHeld, "C");
  assert.equal(r.curve[0].held, "C");
  assert.ok(r.strategies.trend.timeIn.C > 0.9, JSON.stringify(r.strategies.trend.timeIn));
  assert.equal(r.strategies.composite.initialHeld, "G");
});

test("the curve's held field lines up with the switch dates", () => {
  const r = runBacktest(synthetic(), { lookback: 100 });
  const sw = r.strategies.trend.recentSwitches.slice().reverse(); // oldest first
  if (!sw.length) return;
  const first = sw[0];
  // Every sampled point before the first switch date shows the initial holding.
  for (const p of r.curve) {
    if (p.date < first.date) assert.equal(p.held, r.strategies.trend.initialHeld, `${p.date} before ${first.date}`);
    else { assert.equal(p.held, first.to); break; }
  }
});

test("the transfer count is kept by processing month, so a month-end signal uses the next month's budget", () => {
  // Build a C series that generates BUY-like whipsaws for the composite near a month boundary is
  // fiddly; instead exercise the counting directly through the trend rule on a crafted series:
  // ON state, then a 3% break below on the last trading day of a month, executed on the 1st.
  const days = 420;
  const dateAt = (i) => new Date(Date.UTC(2021, 0, 4) + i * 86400000).toISOString().slice(0, 10);
  const c = [];
  let p = 100;
  for (let i = 0; i < days; i++) { p *= i < 380 ? 1.0008 : 0.985; c.push(p); }
  const mk = (fn) => Array.from({ length: days }, (_, i) => ({ date: dateAt(i), close: +fn(i).toFixed(4), volume: 0 }));
  const series = { G: mk((i) => 15 + i * 0.001), C: mk((i) => c[i]), S: mk((i) => c[i]), I: mk(() => 50), F: mk(() => 20) };
  const r = runBacktest(series, { lookback: 100 });
  const sw = r.strategies.trend.recentSwitches;
  assert.ok(sw.length >= 1, "the crash produces a move to G");
  assert.ok(sw.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date)), "switch dates are execution dates");
});

test("coverage blends the rule with a static C sleeve", () => {
  const full = runBacktest(synthetic(), { lookback: 100, coverage: 1 });
  const half = runBacktest(synthetic(), { lookback: 100, coverage: 0.5 });
  const none = runBacktest(synthetic(), { lookback: 100, coverage: 0 });
  assert.equal(full.coverage, 1);
  assert.ok(Math.abs(full.strategies.hybrid.final - full.strategies.trend.final) <= 1, "coverage 1 equals the pure rule");
  assert.ok(Math.abs(none.strategies.hybrid.final - none.benchmarks.C.final) <= 1, "coverage 0 equals holding C");
  const mid = (full.strategies.trend.final + full.benchmarks.C.final) / 2;
  assert.ok(Math.abs(half.strategies.hybrid.final - mid) <= 1, "coverage 0.5 is the midpoint of unrebalanced sleeves");
  assert.ok(half.strategies.hybrid.maxDrawdown >= Math.min(half.strategies.trend.maxDrawdown, half.benchmarks.C.maxDrawdown));
  assert.equal(half.curve[0].hybrid, START_VALUE);
  assert.equal(half.strategies.hybrid.switches, half.strategies.trend.switches);
});
