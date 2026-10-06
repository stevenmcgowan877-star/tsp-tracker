import { test } from "node:test";
import assert from "node:assert/strict";
import { runBacktest, alignSeries, START_VALUE } from "../lib/backtest.js";

// Deterministic synthetic history: C trends up with a wobble, S trends down,
// I and F sideways, G accrues steadily. 600 trading days.
function synthetic(days = 600) {
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

test("runBacktest produces consistent curves, stats and benchmarks", () => {
  const r = runBacktest(synthetic(), { lookback: 100 });
  assert.equal(r.lookback, 100);
  assert.equal(r.days, 600 - 1 - 100);
  assert.equal(r.curve[0].strategy, START_VALUE);
  assert.equal(r.curve[0].C, START_VALUE);
  assert.ok(r.strategy.final > 0);
  assert.ok(r.benchmarks.C.final > START_VALUE, "C trends up in the synthetic data");
  assert.ok(r.benchmarks.G.final > START_VALUE && r.benchmarks.G.maxDrawdown === 0, "G never draws down");
  assert.ok(r.strategy.maxDrawdown <= 0 && r.strategy.maxDrawdown >= -1);
  const share = Object.values(r.strategy.timeIn).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(share - 1) < 1e-9, "time-in shares sum to one");
  assert.ok(r.annual.strategy.length >= 2);
  assert.ok(r.curve.every((p) => ["G", "C", "S", "I", "F"].includes(p.held)));
});

test("the strategy respects the two-transfers-per-month rule", () => {
  const r = runBacktest(synthetic(), { lookback: 100 });
  const perMonth = {};
  // Count only moves between non-G funds or into a non-G fund; moves into G are unrestricted.
  for (const sw of r.switches) {
    if (sw.to === "G") continue;
    const m = sw.date.slice(0, 7);
    perMonth[m] = (perMonth[m] || 0) + 1;
  }
  for (const [m, c] of Object.entries(perMonth)) assert.ok(c <= 2, `${c} restricted transfers in ${m}`);
});

test("runBacktest honours a start/end window and rejects an empty one", () => {
  const r = runBacktest(synthetic(), { lookback: 100, start: "2020-08-01", end: "2021-02-01" });
  assert.ok(r.start >= "2020-08-01");
  assert.ok(r.end <= "2021-02-01");
  assert.throws(() => runBacktest(synthetic(200), { lookback: 100, start: "2030-01-01" }), /empty|Not enough/);
});

test("runBacktest needs more history than the lookback", () => {
  assert.throws(() => runBacktest(synthetic(50), { lookback: 100 }), /Not enough history/);
});
