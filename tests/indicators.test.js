import { test } from "node:test";
import assert from "node:assert/strict";
import { sma, emaSeries, ema, rsi, macd, volatility } from "../lib/indicators.js";
import { computeSignals, WEIGHTS } from "../lib/marketData.js";

const ramp = (n, start = 100, step = 1) => Array.from({ length: n }, (_, i) => start + i * step);
const flat = (n, v = 50) => Array(n).fill(v);
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test("sma averages the trailing window and tolerates short series", () => {
  assert.equal(sma([1, 2, 3, 4], 2), 3.5);
  assert.equal(sma([1, 2, 3], 10), 2);
  assert.ok(Number.isNaN(sma([], 5)));
});

test("ema of a constant series is that constant", () => {
  const series = emaSeries(flat(40, 7), 12);
  assert.equal(series.length, 40);
  series.forEach((v) => near(v, 7));
  near(ema(flat(40, 7), 12), 7);
});

test("ema tracks a rising series from below", () => {
  const closes = ramp(50);
  const e = ema(closes, 10);
  assert.ok(e < closes[closes.length - 1]);
  assert.ok(e > closes[closes.length - 20]);
});

test("rsi is 100 for a straight rise, 0 for a straight fall, 50 when flat", () => {
  assert.equal(rsi(ramp(30)), 100);
  assert.equal(rsi(ramp(30, 100, -1)), 0);
  assert.equal(rsi(flat(30)), 50);
});

test("rsi uses the last 14 periods, not the last 14 gains and 14 losses", () => {
  // 20 up moves then 15 down moves: the recent window is entirely losses,
  // so RSI must be well below 50 even though plenty of gains exist earlier.
  const closes = [...ramp(21), ...ramp(15, 119, -1)];
  const value = rsi(closes);
  assert.ok(value < 40, `expected weak RSI, got ${value}`);
});

test("rsi stays within [0, 100] on noisy data", () => {
  const closes = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i) * 5 + Math.cos(i * 3) * 2);
  const value = rsi(closes);
  assert.ok(value >= 0 && value <= 100);
});

test("macd signal line is an EMA of the macd line, not of price", () => {
  const closes = ramp(60);
  const { macd: line, signal, hist } = macd(closes);
  // In a steady uptrend the MACD line is positive and the signal lags it.
  assert.ok(line > 0);
  assert.ok(signal > 0 && signal <= line);
  near(hist, line - signal);
  // The signal must be on the same scale as the MACD line, nowhere near price.
  assert.ok(Math.abs(signal) < 20, `signal ${signal} looks like a price, not a MACD value`);
});

test("macd is zero on a flat series", () => {
  const { macd: line, signal, hist } = macd(flat(60));
  near(line, 0);
  near(signal, 0);
  near(hist, 0);
});

test("volatility is zero for a flat series and positive for a noisy one", () => {
  assert.equal(volatility(flat(40)), 0);
  const noisy = Array.from({ length: 40 }, (_, i) => 100 + (i % 2 ? 3 : -3));
  assert.ok(volatility(noisy) > 0);
});

test("signal weights sum to one", () => {
  const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  near(total, 1);
});

const toPriceData = (closes, source = "live") => ({
  source,
  symbol: "TEST",
  prices: closes.map((close, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, close, volume: 1 })),
});

test("computeSignals returns every field the UI reads", () => {
  const s = computeSignals(toPriceData(ramp(100)));
  for (const key of [
    "current", "prev", "change", "sma20", "sma50", "smaLong", "smaLongN", "rsi", "macd", "macdHist",
    "high20", "low20", "inDemandZone", "inSupplyZone", "volatility", "volRatio",
    "maScore", "rsiScore", "macdScore", "sdScore", "volScore", "composite", "signal", "prices", "source",
  ]) {
    assert.ok(key in s, `missing ${key}`);
  }
  assert.equal(s.smaLongN, 100);
  assert.equal(s.prices.length, 30);
  assert.ok(["BUY", "HOLD", "AVOID"].includes(s.signal));
});

test("a steady uptrend has a bullish MA stack and positive MACD", () => {
  const s = computeSignals(toPriceData(ramp(100)));
  assert.equal(s.maScore, 1);
  assert.equal(s.macdScore, 0.7);
  assert.equal(s.inSupplyZone, true);
});

test("a steady decline has a bearish MA stack, negative MACD and a lower composite", () => {
  const down = computeSignals(toPriceData(ramp(100, 200, -1)));
  const up = computeSignals(toPriceData(ramp(100)));
  assert.equal(down.maScore, -1);
  assert.equal(down.macdScore, -0.7);
  assert.equal(down.inDemandZone, true);
  assert.ok(down.composite < up.composite);
});

test("price above a rising average with neutral RSI scores a buy", () => {
  // Gentle oscillation around 100 that ends on an upswing: MA stack bullish,
  // RSI mid-range, MACD histogram positive. This is the setup the tracker
  // is designed to flag as SWITCH IN.
  const closes = Array.from({ length: 100 }, (_, i) => 100 + 2 * Math.sin(i / 3) + Math.cos(i * 1.7));
  const s = computeSignals(toPriceData(closes));
  assert.equal(s.maScore, 1);
  assert.equal(s.rsiScore, 0);
  assert.ok(s.composite > 0.25, `composite ${s.composite}`);
  assert.equal(s.signal, "BUY");
});

test("synthetic (G Fund) data is neutralised to HOLD", () => {
  const s = computeSignals(toPriceData(ramp(100, 17.5, 0.001), "synthetic"));
  assert.equal(s.signal, "HOLD");
  assert.equal(s.composite, 0);
  assert.equal(s.inSupplyZone, false);
  assert.equal(s.rsiScore, 0);
  assert.equal(s.rsi, null);
  assert.equal(s.macd, null);
});
