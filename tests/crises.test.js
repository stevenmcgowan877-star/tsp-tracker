import { test } from "node:test";
import assert from "node:assert/strict";
import { EPISODES, findEpisode, runCrisis } from "../lib/crises.js";

// 900 days from 2020-01-01: a long rise, a 35% crash over 60 days, then recovery.
function synthetic() {
  const days = 900;
  const dateAt = (i) => new Date(Date.UTC(2020, 0, 1) + i * 86400000).toISOString().slice(0, 10);
  const c = [];
  let p = 100;
  for (let i = 0; i < days; i++) {
    if (i < 450) p *= 1.0006;
    else if (i < 510) p *= 0.9928;
    else p *= 1.0009;
    c.push(p);
  }
  const mk = (fn) => Array.from({ length: days }, (_, i) => ({ date: dateAt(i), close: +fn(i).toFixed(4), volume: 0 }));
  return {
    G: mk((i) => 15 + i * 0.001), C: mk((i) => c[i]),
    S: mk((i) => c[i] * 0.9), I: mk((i) => 50 + Math.sin(i / 30)), F: mk((i) => 20 + Math.cos(i / 40) * 0.2),
  };
}

test("every episode has an id, a name and a start date, and ids are unique", () => {
  const ids = new Set();
  for (const e of EPISODES) {
    assert.ok(e.id && e.name && /^\d{4}-\d{2}-\d{2}$/.test(e.start));
    assert.ok(!ids.has(e.id)); ids.add(e.id);
  }
  assert.equal(findEpisode("nope"), null);
  assert.equal(findEpisode("gfc2008").name, "2008 financial crisis");
});

test("runCrisis replays a window daily and tells the exit/re-entry story", () => {
  EPISODES.push({ id: "test", name: "Synthetic crash", start: "2021-01-01", end: "2022-05-01", peakHint: null });
  try {
    const r = runCrisis(synthetic(), "test");
    assert.equal(r.episode.id, "test");
    assert.ok(r.curve.length > 400, "daily sampling");
    assert.ok(r.curve.every((p) => typeof p.cSma === "number" && typeof p.cClose === "number"));
    assert.ok(r.stats.cDrawdown < -0.3, `C should crash ~35%, got ${r.stats.cDrawdown}`);
    assert.ok(r.stats.ruleDrawdown > r.stats.cDrawdown, "the rule should lose less than holding C");
    assert.ok(r.story.exitDate && r.story.reentryDate && r.story.reentryDate > r.story.exitDate);
    assert.ok(r.story.exitPctFromPeak < 0, "exit happens below the peak");
    assert.ok(r.story.reentryPctFromTrough > 0, "re-entry happens above the trough");
    assert.equal(r.flips.filter((f) => f.to === "G").length, 1);
    assert.ok(r.stats.daysInG > 30);
  } finally {
    EPISODES.pop();
  }
});

test("runCrisis rejects unknown episodes", () => {
  assert.throws(() => runCrisis(synthetic(), "nope"), /Unknown episode/);
});
