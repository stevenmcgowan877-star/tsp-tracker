import { test } from "node:test";
import assert from "node:assert/strict";
import { runPlan, sampleBlockStarts, yearContributions, agencyRate, electiveLimit, rmdDivisor, rmdStartAge, PATHS, TRADING_DAYS, PAY_PERIOD } from "../lib/plan.js";
import { trendStateAt } from "../lib/trendRule.js";

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

test("match follows the FERS formula and needs an employee deposit", () => {
  assert.equal(agencyRate(0), 0.01);
  assert.ok(Math.abs(agencyRate(0.03) - 0.04) < 1e-12);
  assert.ok(Math.abs(agencyRate(0.05) - 0.05) < 1e-12);
  assert.ok(Math.abs(agencyRate(0.10) - 0.05) < 1e-12, "match caps at 5% of pay");
});

test("2026 elective limits include the age-based catch-up", () => {
  assert.equal(electiveLimit(40), 24500);
  assert.equal(electiveLimit(55), 32500);
  assert.equal(electiveLimit(61), 35750);
  assert.equal(electiveLimit(65), 32500);
});

test("front-loading forfeits match once the limit is reached", () => {
  // $200k salary at 20%: $1,538 per pay, limit $24,500 reached in pay 16.
  const yr = yearContributions({ salary: 200000, pct: 0.2, age: 40 });
  const employee = yr.reduce((a, c) => a + c.employee, 0);
  const agency = yr.reduce((a, c) => a + c.agency, 0);
  assert.ok(Math.abs(employee - 24500) < 1e-6);
  assert.ok(agency < 200000 * 0.05 - 1, "some match forfeited");
  assert.ok(agency >= 200000 * 0.01 - 1e-6, "the automatic 1% is never forfeited");
  // At 5% the full 5% agency contribution arrives.
  const even = yearContributions({ salary: 100000, pct: 0.05, age: 40 });
  assert.ok(Math.abs(even.reduce((a, c) => a + c.agency, 0) - 5000) < 1e-6);
});

test("RMD start age and divisors follow SECURE 2.0 and the Uniform Lifetime Table", () => {
  assert.equal(rmdStartAge(1955), 73);
  assert.equal(rmdStartAge(1965), 75);
  assert.equal(rmdDivisor(70), null);
  assert.equal(rmdDivisor(75), 24.6);
  assert.equal(rmdDivisor(104), 6.4);
});

test("block starts are deterministic and sized to the horizon", () => {
  const a = sampleBlockStarts(5000, 2520, { paths: 10, block: 250 });
  const b = sampleBlockStarts(5000, 2520, { paths: 10, block: 250 });
  assert.deepEqual(a.map((x) => Array.from(x)), b.map((x) => Array.from(x)));
  assert.equal(a[0].length, Math.ceil(2520 / 250));
  assert.ok(a.every((s) => Array.from(s).every((i) => i >= 0 && i < 5000 - 250)));
});

test("legacy flat contributions still work and report percentile bands", () => {
  const r = runPlan(history(), { balance: 100000, contribution: 500, years: 3, block: 60 });
  assert.equal(r.paths, PATHS);
  for (const key of ["trend", "C", "G"]) {
    const s = r.strategies[key];
    assert.equal(s.yearly.length, 4);
    assert.equal(s.yearly[0].p50, 100000);
    assert.ok(s.final.p10 <= s.final.p50 && s.final.p50 <= s.final.p90);
    assert.equal(s.depletedShare, 0);
  }
  assert.equal(r.strategies.G.worstDrawdown.p10, 0);
  assert.ok(r.strategies.G.final.p50 > 100000 + 500 * 70);
  assert.equal(r.contributed, 500 * Math.floor(TRADING_DAYS / PAY_PERIOD) * 3);
});

test("salary mode adds the employee deposit and the agency match", () => {
  const r = runPlan(history(), { balance: 0, years: 2, salary: 100000, pct: 0.05, age: 40, paths: 20 });
  assert.ok(Math.abs(r.employeeTotal - 10000) < 1e-6);
  assert.ok(Math.abs(r.agencyTotal - 10000) < 1e-6);
  // G grows slowly, so its median is just above the $20k deposited.
  assert.ok(r.strategies.G.final.p50 > 20000 && r.strategies.G.final.p50 < 21500);
});

test("retirement withdrawals draw the balance down and can deplete it", () => {
  const gentle = runPlan(history(), { balance: 500000, years: 1, retireYears: 10, withdrawalRate: 0.04, age: 64, paths: 30 });
  assert.equal(gentle.retireYears, 10);
  assert.equal(gentle.strategies.G.yearly.length, 12);
  assert.equal(gentle.strategies.G.depletedShare, 0);
  const brutal = runPlan(history(), { balance: 100000, years: 1, retireYears: 20, withdrawalRate: 0.2, age: 64, paths: 30 });
  assert.equal(brutal.strategies.G.depletedShare, 1, "20% a year rising 2.5% empties G within 20 years");
  assert.equal(brutal.strategies.G.final.p50, 0);
});

test("coverage 0 makes the rule strategy identical to holding C", () => {
  const r = runPlan(history(), { balance: 100000, contribution: 200, years: 3, coverage: 0, paths: 20 });
  assert.ok(Math.abs(r.strategies.trend.final.p50 - r.strategies.C.final.p50) < 1e-6);
});

test("the planner starts the rule in the state the full history implies, even inside the band", () => {
  const C = [], G = [];
  let c = 100;
  for (let i = 0; i < 900; i++) {
    if (i < 700) c *= 1.0008; else c *= 0.9998;
    const date = new Date(Date.UTC(2015, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    C.push({ date, close: c }); G.push({ date, close: 10 + i * 0.001 });
  }
  const closes = C.map((p) => p.close);
  const sma = closes.slice(-200).reduce((a, b) => a + b, 0) / 200;
  const pctVsSma = closes[closes.length - 1] / sma - 1;
  assert.ok(pctVsSma < 0 && pctVsSma > -0.03, `expected inside the band, got ${pctVsSma}`);
  assert.equal(trendStateAt(closes, closes.length - 1), "ON");
  const r = runPlan({ C, G }, { balance: 1000, contribution: 0, years: 1, paths: 5 });
  assert.equal(r.startState, "ON");
});

test("runPlan validates its inputs", () => {
  assert.throws(() => runPlan(history(), { balance: -1, contribution: 0, years: 5 }), /required/);
  assert.throws(() => runPlan(history(), { balance: 1, contribution: 0, years: 0 }), /required/);
  assert.throws(() => runPlan(history(), { balance: 1, contribution: 0, years: 41 }), /required/);
  assert.throws(() => runPlan(history(), { balance: 1, contribution: 0, years: 5, retireYears: 41 }), /retireYears/);
});
