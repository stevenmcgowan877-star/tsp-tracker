// Contribution planner: a range of outcomes for a balance plus regular
// contributions, under the trend rule, holding C and holding G.
//
// Future paths are block-bootstrapped from the real daily returns of the C
// and G Funds (60-trading-day blocks keep trends and crashes intact, and C
// and G are sampled on the same dates so their relationship survives). The
// trend rule runs on each synthetic path, warmed up with the last 200 real
// closes and seeded with its real current state. Contributions arrive every
// ten trading days and buy whatever the strategy holds. Nominal dollars, no
// fees, no raises: this is a range, not a forecast.

import { nextTrendState, trendStateAt, TREND_N, TREND_BAND } from "./trendRule.js";

export const PATHS = 300;
export const BLOCK = 60;
export const TRADING_DAYS = 252;
export const PAY_PERIOD = 10; // trading days between contributions (biweekly)
const PERCENTILES = [0.1, 0.25, 0.5, 0.75, 0.9];
const MAX_CACHED_HORIZONS = 6;

// Deterministic LCG so a given horizon always produces the same paths.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function dailyReturns(prices) {
  const out = [];
  for (let i = 1; i < prices.length; i++) out.push(prices[i].close / prices[i - 1].close - 1);
  return out;
}

// Resampled paths per horizon. Bounded: a handful of horizons, and the whole
// cache resets when the underlying history changes (a new trading day).
const pathCache = new Map();
let cachedHistoryLength = 0;

// Resample `years` of joint (C, G) daily returns, PATHS times.
export function samplePaths(series, years, { paths = PATHS, block = BLOCK, seed = 7 } = {}) {
  if (series.C.length !== cachedHistoryLength) {
    pathCache.clear();
    cachedHistoryLength = series.C.length;
  }
  const key = `${years}:${paths}:${block}:${seed}`;
  if (pathCache.has(key)) return pathCache.get(key);
  const rc = dailyReturns(series.C);
  const rg = dailyReturns(series.G);
  const n = Math.min(rc.length, rg.length);
  const L = Math.round(years * TRADING_DAYS);
  const rand = rng(seed);
  const out = { c: [], g: [] };
  for (let k = 0; k < paths; k++) {
    const c = new Float64Array(L), g = new Float64Array(L);
    let i = 0;
    while (i < L) {
      const start = Math.floor(rand() * (n - block));
      for (let j = 0; j < block && i < L; j++, i++) { c[i] = rc[start + j]; g[i] = rg[start + j]; }
    }
    out.c.push(c); out.g.push(g);
  }
  if (pathCache.size >= MAX_CACHED_HORIZONS) pathCache.delete(pathCache.keys().next().value);
  pathCache.set(key, out);
  return out;
}

function percentiles(values) {
  const s = values.slice().sort((a, b) => a - b);
  const pick = (p) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
  const out = {};
  for (const p of PERCENTILES) out[`p${Math.round(p * 100)}`] = pick(p);
  return out;
}

// Simulate one strategy on one path. Returns yearly balances, the worst
// drawdown and the final value. For the trend strategy the 200-day average
// is kept as a rolling sum over a ring buffer seeded with the real closes.
function simulate({ c, g }, { balance, contribution, years, strategy, warmClose, startState }) {
  const L = c.length;
  const yearly = [balance];
  let value = balance;
  let peak = balance, worst = 0;

  let price = warmClose[warmClose.length - 1];
  const ring = Float64Array.from(warmClose);
  let ringIdx = 0;
  let sum = 0;
  for (const v of ring) sum += v;
  let state = startState;
  let held = strategy === "C" ? "C" : strategy === "G" ? "G" : state === "ON" ? "C" : "G";
  let pending = null;

  for (let t = 0; t < L; t++) {
    const r = held === "C" ? c[t] : g[t];
    value *= 1 + r;
    if ((t + 1) % PAY_PERIOD === 0) value += contribution;
    price *= 1 + c[t];
    if (strategy === "trend") {
      if (pending) { held = pending; pending = null; }
      sum += price - ring[ringIdx];
      ring[ringIdx] = price;
      ringIdx = (ringIdx + 1) % ring.length;
      const next = nextTrendState(state, price, sum / ring.length, TREND_BAND);
      if (next !== state) { state = next; pending = next === "ON" ? "C" : "G"; }
    }
    if (value > peak) peak = value;
    const dd = value / peak - 1;
    if (dd < worst) worst = dd;
    if ((t + 1) % TRADING_DAYS === 0) yearly.push(value);
  }
  if (yearly.length < years + 1) yearly.push(value);
  return { yearly, worst, final: value };
}

export function runPlan(series, { balance, contribution, years }) {
  if (!(balance >= 0) || !(contribution >= 0) || !(years >= 1 && years <= 40)) throw new Error("balance, contribution and years (1-40) are required");
  const paths = samplePaths(series, years);
  const closes = series.C.map((p) => p.close);
  const warmClose = closes.slice(-TREND_N);
  // The rule's real current state, replayed over the full history (not just
  // the warm window, which would miss any state carried inside the band).
  const startState = trendStateAt(closes, closes.length - 1);
  const strategies = ["trend", "C", "G"];
  const result = { balance, contribution, years, paths: paths.c.length, contributed: contribution * Math.floor((years * TRADING_DAYS) / PAY_PERIOD), strategies: {} };
  const finals = {};
  for (const strategy of strategies) {
    finals[strategy] = [];
    const worsts = [];
    const yearly = Array.from({ length: years + 1 }, () => []);
    for (let k = 0; k < paths.c.length; k++) {
      const sim = simulate({ c: paths.c[k], g: paths.g[k] }, { balance, contribution, years, strategy, warmClose, startState });
      finals[strategy].push(sim.final);
      worsts.push(sim.worst);
      sim.yearly.forEach((v, y) => { if (y <= years) yearly[y].push(v); });
    }
    result.strategies[strategy] = {
      final: percentiles(finals[strategy]),
      worstDrawdown: percentiles(worsts),
      yearly: yearly.map((vals, y) => ({ year: y, ...percentiles(vals) })),
    };
  }
  let ruleWins = 0, ruleWithin = 0;
  for (let k = 0; k < finals.trend.length; k++) {
    if (finals.trend[k] >= finals.C[k]) ruleWins++;
    if (finals.trend[k] >= 0.8 * finals.C[k]) ruleWithin++;
  }
  result.ruleBeatsC = ruleWins / finals.trend.length;
  result.ruleWithin20pctOfC = ruleWithin / finals.trend.length;
  result.startState = startState;
  return result;
}
