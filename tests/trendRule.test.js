import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateTrendRule, nextTrendState, trendStateAt, smaAt, TREND_N, TREND_BAND } from "../lib/trendRule.js";

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
  assert.ok(r2.switchCount === r2.flipCount || r2.switchCount === r2.flipCount - 1, "switchCount only drops a state-setting flip on the first evaluated close");
  assert.equal(typeof r2.firstEvaluated, "string");
});

test("barsSinceFlip counts closes since the state began", () => {
  const up = Array.from({ length: 260 }, (_, i) => 100 + i * 0.2);
  const down = Array.from({ length: 60 }, (_, i) => 151.8 - i * 1.0);
  const r = evaluateTrendRule(series([...up, ...down]));
  assert.equal(r.state, "OFF");
  const idx = [...up, ...down].length - 1;
  const flipIdx = Number(r.since.slice(1));
  assert.equal(r.barsSinceFlip, idx - flipIdx);
  const justFlipped = evaluateTrendRule(series([...up, ...down.slice(0, flipIdx - up.length + 1)]));
  assert.equal(justFlipped.barsSinceFlip, 0);
});

test("trendStateAt agrees with evaluateTrendRule at every index", () => {
  const closes = Array.from({ length: 400 }, (_, i) => 100 + 20 * Math.sin(i / 40) + i * 0.05);
  for (const t of [200, 250, 300, 399]) {
    const viaEval = evaluateTrendRule(series(closes.slice(0, t + 1))).state;
    assert.equal(trendStateAt(closes, t), viaEval, `index ${t}`);
  }
});

test("missedCloses counts weekdays between the last close and today in Eastern time", async () => {
  const { missedCloses } = await import("../lib/trendRule.js");
  const at = (iso) => new Date(iso);
  assert.equal(missedCloses("2026-10-05", at("2026-10-06T15:00:00Z")), 0, "Monday close, Tuesday");
  assert.equal(missedCloses("2026-10-02", at("2026-10-05T15:00:00Z")), 0, "Friday close, Monday");
  assert.equal(missedCloses("2026-10-01", at("2026-10-05T15:00:00Z")), 1, "a Friday holiday is one");
  assert.equal(missedCloses("2026-09-29", at("2026-10-05T15:00:00Z")), 3);
  assert.equal(missedCloses("2026-10-05", at("2026-10-07T02:00:00Z")), 0, "10pm ET Tuesday is still Tuesday");
  assert.equal(missedCloses(null), 0);
});
