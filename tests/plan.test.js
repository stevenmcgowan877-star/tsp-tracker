import { test } from "node:test";
import assert from "node:assert/strict";
import { samplePaths, runPlan, PATHS, TRADING_DAYS } from "../lib/plan.js";

// Synthetic history: C drifts up with noise (deterministic), G accrues 3%/yr.
function history(days = 2000) {
  let seed = 3;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const C = [], G = [];
  let c = 100, g = 10;
  for (let i = 0; i < days; i++) {
    c *= 1 + 0.0004 + (rnd() - 0.5) * 0.02;
    g *= 1 + 0.03 / 252;
    const date = new Date(Date.UTC(2015, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    C.push({ date, close: c }); G.push({ date, close: g });
  }
  return { C, G };
}

test("samplePaths is deterministic, joint, and sized to the horizon", () => {
  const h = history();
  const a = samplePaths(h, 2, { paths: 20, seed: 1 });
  const b = samplePaths(h, 2, { paths: 20, seed: 1 });
  assert.equal(a, b, "cached and identical for the same inputs");
  assert.equal(a.c.length, 20);
  assert.equal(a.c[0].length, 2 * TRADING_DAYS);
  assert.equal(a.g[0].length, 2 * TRADING_DAYS);
  // G returns are tiny and positive in the synthetic history; C returns vary.
  assert.ok(a.g[0].every((r) => r > 0 && r < 0.001));
  assert.ok(a.c[0].some((r) => r < 0));
});

test("runPlan returns percentile bands per year and sensible aggregates", () => {
  const r = runPlan(history(), { balance: 100000, contribution: 500, years: 3 });
  assert.equal(r.paths, PATHS);
  for (const key of ["trend", "C", "G"]) {
    const s = r.strategies[key];
    assert.equal(s.yearly.length, 4);
    assert.equal(s.yearly[0].p50, 100000, "year 0 is the starting balance");
    assert.ok(s.final.p10 <= s.final.p50 && s.final.p50 <= s.final.p90, "percentiles ordered");
    assert.ok(s.worstDrawdown.p50 <= 0);
  }
  // G never loses value, so its band is tight and its drawdown is zero.
  assert.equal(r.strategies.G.worstDrawdown.p10, 0);
  assert.ok(r.strategies.G.final.p90 - r.strategies.G.final.p10 < 0.02 * r.strategies.G.final.p50);
  assert.ok(r.strategies.G.final.p50 > 100000 + 500 * 70, "contributions plus interest");
  assert.ok(r.ruleBeatsC >= 0 && r.ruleBeatsC <= 1);
  assert.ok(r.ruleWithin20pctOfC >= r.ruleBeatsC);
  assert.ok(["ON", "OFF"].includes(r.startState));
  assert.equal(r.contributed, 500 * Math.floor((3 * TRADING_DAYS) / 10));
});

test("runPlan validates its inputs", () => {
  assert.throws(() => runPlan(history(), { balance: -1, contribution: 0, years: 5 }), /required/);
  assert.throws(() => runPlan(history(), { balance: 1, contribution: 0, years: 0 }), /required/);
  assert.throws(() => runPlan(history(), { balance: 1, contribution: 0, years: 41 }), /required/);
});
