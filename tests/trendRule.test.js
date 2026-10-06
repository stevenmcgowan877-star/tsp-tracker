import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateTrendRule, nextTrendState, smaAt, TREND_N, TREND_BAND } from "../lib/trendRule.js";

const series = (closes) => closes.map((close, i) => ({ date: `D${String(i).padStart(4, "0")}`, close }));

test("smaAt averages the trailing window", () => {
  assert.equal(smaAt([1, 2, 3, 4, 5], 4, 3), 4);
  assert.equal(smaAt([1, 2, 3], 2, 10), 2);
});

test("nextTrendState needs a 3% break either way and holds inside the band", () => {
  assert.equal(nextTrendState("OFF", 103.1, 100), "ON");
  assert.equal(nextTrendState("OFF", 102.9, 100), "OFF");
  assert.equal(nextTrendState("ON", 96.9, 100), "OFF");
  assert.equal(nextTrendState("ON", 97.1, 100), "ON");
  assert.equal(nextTrendState("ON", 99, 100, 0.05), "ON");
});

test("evaluateTrendRule reports unavailable with too little history", () => {
  const r = evaluateTrendRule(series(Array(50).fill(100)));
  assert.equal(r.available, false);
  assert.match(r.reason, /Needs 201 closes/);
});

test("evaluateTrendRule is ON after a sustained rise and reports triggers", () => {
  const closes = Array.from({ length: 300 }, (_, i) => 100 + i * 0.2);
  const r = evaluateTrendRule(series(closes));
  assert.equal(r.available, true);
  assert.equal(r.state, "ON");
  assert.equal(r.hold, "C");
  assert.ok(r.pctVsSma > TREND_BAND * 100);
  assert.ok(r.sellTrigger < r.sma && r.buyTrigger > r.sma);
  assert.equal(r.n, TREND_N);
  assert.equal(r.flips[0].to, "C");
  assert.equal(r.since, r.flips[0].date);
});

test("evaluateTrendRule flips OFF after a fall through the band and back ON on recovery", () => {
  const up = Array.from({ length: 260 }, (_, i) => 100 + i * 0.2);     // ends ~151.8
  const down = Array.from({ length: 60 }, (_, i) => 151.8 - i * 1.0);   // falls to ~92
  const r1 = evaluateTrendRule(series([...up, ...down]));
  assert.equal(r1.state, "OFF");
  assert.equal(r1.hold, "G");
  assert.equal(r1.flips[0].to, "G");
  const recover = Array.from({ length: 220 }, (_, i) => 92 + i * 0.6);
  const r2 = evaluateTrendRule(series([...up, ...down, ...recover]));
  assert.equal(r2.state, "ON");
  assert.equal(r2.flipCount, 3);
});
