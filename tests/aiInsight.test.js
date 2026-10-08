import { test } from "node:test";
import assert from "node:assert/strict";
import { describeFund, buildSummary, describeTrend } from "../pages/api/ai-insight.js";

const c = { id: "C", desc: "S&P 500 Index", signal: "BUY", composite: 0.44, current: 125.447, change: "0.67",
  maScore: 1, rsi: 59.4, macdHist: 0.21, inDemandZone: false, inSupplyZone: true, volScore: 0, volatility: 8.4 };
const g = { id: "G", desc: "Gov't Securities (stable)", signal: "HOLD", composite: 0, current: 20.2711, change: "0.04",
  maScore: 0, rsi: null, macdHist: null, inDemandZone: false, inSupplyZone: false, volScore: 0, volatility: 0.2 };

test("describeFund names every signal the model should weigh", () => {
  const line = describeFund(c);
  for (const needle of ["C Fund", "signal BUY", "composite 44/100", "125.45", "bullish", "RSI 59.4", "MACD histogram positive", "supply zone", "8.4%"]) {
    assert.ok(line.includes(needle), `missing "${needle}" in: ${line}`);
  }
});

test("describeFund keeps the G Fund out of the technical discussion", () => {
  const line = describeFund(g);
  assert.ok(line.includes("no technical signals"));
  assert.ok(!line.includes("RSI"));
});

const trendOn = { available: true, state: "ON", since: "2026-04-09", price: 125.447, pctVsSma: 7.98, n: 200, sma: 116.18, sellTrigger: 112.69, buyTrigger: 119.67 };

test("describeTrend states the rule's state and the next trigger", () => {
  const line = describeTrend(trendOn);
  assert.ok(line.startsWith("Action rule: ON, hold C since 2026-04-09"));
  assert.ok(line.includes("below 112.69"));
  assert.ok(describeTrend({ ...trendOn, state: "OFF" }).includes("above 119.67"));
  assert.match(describeTrend({ available: false }), /unavailable/);
});

test("describeTrend states the reader's split, never all-or-nothing below 100%", () => {
  const off = describeTrend({ ...trendOn, state: "OFF" }, 0.75);
  assert.ok(off.includes("the advice now is 75% in G and 25% in C"));
  const on = describeTrend(trendOn, 0.75);
  assert.ok(on.includes("the advice now is 100% in C"));
  assert.ok(on.includes("the advice becomes 75% in G and 25% in C"));
  assert.ok(describeTrend({ ...trendOn, state: "OFF" }, 1).includes("the advice now is 100% in G"));
});

test("buildSummary states the data source, as-of date and action rule before the signals", () => {
  const official = buildSummary([c, g], { official: true, asOf: "2026-10-05", trend: trendOn });
  assert.ok(official.startsWith("Data: official tsp.gov share prices, last bar 2026-10-05."));
  assert.ok(official.split("\n")[1].startsWith("Action rule: ON"));
  const proxy = buildSummary([c, g], { official: false, asOf: "2026-10-05", trend: trendOn });
  assert.ok(proxy.includes("ETF proxy prices"));
  assert.equal(official.split("\n").length, 5);
});
