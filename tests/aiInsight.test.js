import { test } from "node:test";
import assert from "node:assert/strict";
import { describeFund, buildSummary } from "../pages/api/ai-insight.js";

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

test("buildSummary states the data source and as-of date", () => {
  const official = buildSummary([c, g], { official: true, asOf: "2026-10-05" });
  assert.ok(official.startsWith("Data: official tsp.gov share prices, last bar 2026-10-05."));
  const proxy = buildSummary([c, g], { official: false, asOf: "2026-10-05" });
  assert.ok(proxy.includes("ETF proxy prices"));
  assert.equal(official.split("\n").length, 3);
});
