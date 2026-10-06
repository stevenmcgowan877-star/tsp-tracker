// Replays the dashboard's signal rules over the full tsp.gov history.
//
// Strategy ("follow the signals"), evaluated once per trading day on the
// close, executed at the NEXT close (a TSP interfund transfer requested
// before noon ET settles at that day's close, so acting on yesterday's
// signal today is realistic and avoids look-ahead):
//   1. Rank C, S, I, F by composite score using the trailing LOOKBACK bars.
//   2. If the top fund reads BUY and we are not already in it, switch to it.
//   3. Else if the fund we hold reads AVOID, switch to G.
//   4. Else stay put.
//   5. TSP allows two unrestricted interfund transfers per calendar month;
//      after that, only moves INTO G are allowed. Rule 2 is skipped once
//      the month's two transfers are used.
// Benchmarks: buy-and-hold C, buy-and-hold G, and equal-weight C/S/I/F
// rebalanced at the start of each month.

import { computeSignals } from "./marketData.js";

export const LOOKBACK = 100;
export const START_VALUE = 10000;
export const EQUITY_FUNDS = ["C", "S", "I", "F"];
const IFT_LIMIT = 2;

// Align the five series on dates present in all of them.
export function alignSeries(series) {
  const ids = ["G", ...EQUITY_FUNDS];
  const maps = ids.map((id) => new Map((series[id] || []).map((p) => [p.date, p.close])));
  const dates = [...maps[0].keys()].filter((d) => maps.every((m) => m.has(d))).sort();
  const closes = {};
  ids.forEach((id, i) => { closes[id] = dates.map((d) => maps[i].get(d)); });
  return { dates, closes };
}

function signalsAt(closes, id, t, lookback) {
  const window = closes[id].slice(Math.max(0, t - lookback + 1), t + 1);
  return computeSignals({ prices: window.map((close) => ({ close })), source: "tsp" });
}

function maxDrawdown(curve) {
  let peak = -Infinity, worst = 0;
  for (const v of curve) {
    if (v > peak) peak = v;
    const dd = (v - peak) / peak;
    if (dd < worst) worst = dd;
  }
  return worst;
}

function cagr(first, last, years) {
  if (years <= 0 || first <= 0) return 0;
  return Math.pow(last / first, 1 / years) - 1;
}

function yearsBetween(a, b) {
  return (new Date(b) - new Date(a)) / (365.25 * 86400000);
}

function annualReturns(dates, curve) {
  const byYear = {};
  for (let i = 0; i < dates.length; i++) {
    const y = dates[i].slice(0, 4);
    if (!byYear[y]) byYear[y] = { first: i === 0 ? curve[0] : curve[i - 1], last: curve[i] };
    byYear[y].last = curve[i];
  }
  return Object.entries(byYear).map(([year, { first, last }]) => ({ year, ret: last / first - 1 }));
}

export function runBacktest(series, { lookback = LOOKBACK, start, end } = {}) {
  const aligned = alignSeries(series);
  let { dates, closes } = aligned;
  if (dates.length < lookback + 2) throw new Error("Not enough history for a backtest");

  // Optional date window (applied after warm-up so signals have history).
  let firstIdx = lookback;
  if (start) {
    const si = dates.findIndex((d) => d >= start);
    if (si === -1) throw new Error("Date window is empty");
    firstIdx = Math.max(firstIdx, si);
  }
  let lastIdx = dates.length - 1;
  if (end) { const e = dates.findIndex((d) => d > end); if (e !== -1) lastIdx = e - 1; }
  if (firstIdx < 0 || lastIdx <= firstIdx) throw new Error("Date window is empty");

  const ids = ["G", ...EQUITY_FUNDS];
  const n = lastIdx - firstIdx; // number of daily returns
  const strategy = [START_VALUE];
  const bench = { C: [START_VALUE], G: [START_VALUE], EW: [START_VALUE] };
  const holdings = [];      // fund held during each day's return
  const switches = [];      // { date, from, to }
  let held = "G";
  let pending = null;       // fund to move into at the next close
  let iftMonth = "";
  let iftUsed = 0;
  let ewWeights = null;     // units of each equity fund in the equal-weight book
  let ewMonth = "";

  const ret = (id, t) => closes[id][t] / closes[id][t - 1] - 1;

  for (let t = firstIdx + 1; t <= lastIdx; t++) {
    // 1) Execute yesterday's decision at today's close: today's return
    //    accrues to the fund we held overnight, then we move.
    const dayRet = ret(held, t);
    strategy.push(strategy[strategy.length - 1] * (1 + dayRet));
    holdings.push(held);
    if (pending && pending !== held) {
      switches.push({ date: dates[t], from: held, to: pending });
      held = pending;
    }
    pending = null;

    // Benchmarks
    bench.C.push(bench.C[bench.C.length - 1] * (1 + ret("C", t)));
    bench.G.push(bench.G[bench.G.length - 1] * (1 + ret("G", t)));
    const month = dates[t].slice(0, 7);
    if (!ewWeights || month !== ewMonth) {
      const v = bench.EW[bench.EW.length - 1];
      ewWeights = {};
      for (const id of EQUITY_FUNDS) ewWeights[id] = (v / EQUITY_FUNDS.length) / closes[id][t - 1];
      ewMonth = month;
    }
    bench.EW.push(EQUITY_FUNDS.reduce((sum, id) => sum + ewWeights[id] * closes[id][t], 0));

    // 2) Decide on today's close what to do at the next close.
    if (t === lastIdx) break;
    if (month !== iftMonth) { iftMonth = month; iftUsed = 0; }
    const sig = {};
    for (const id of EQUITY_FUNDS) sig[id] = signalsAt(closes, id, t, lookback);
    const ranked = EQUITY_FUNDS.slice().sort((a, b) => sig[b].composite - sig[a].composite);
    const top = ranked[0];
    if (sig[top].signal === "BUY" && top !== held && iftUsed < IFT_LIMIT) {
      pending = top; iftUsed++;
    } else if (held !== "G" && sig[held].signal === "AVOID") {
      pending = "G"; // moves into G are always allowed
    }
  }

  const span = yearsBetween(dates[firstIdx], dates[lastIdx]);
  const curveDates = dates.slice(firstIdx, lastIdx + 1);
  const summarise = (curve) => ({
    final: Math.round(curve[curve.length - 1]),
    totalReturn: curve[curve.length - 1] / curve[0] - 1,
    cagr: cagr(curve[0], curve[curve.length - 1], span),
    maxDrawdown: maxDrawdown(curve),
  });

  const timeIn = {};
  for (const id of ids) timeIn[id] = 0;
  for (const h of holdings) timeIn[h]++;
  for (const id of ids) timeIn[id] = timeIn[id] / Math.max(1, holdings.length);

  return {
    start: dates[firstIdx],
    end: dates[lastIdx],
    years: span,
    days: n,
    lookback,
    strategy: { ...summarise(strategy), switches: switches.length, timeIn, lastHeld: held },
    benchmarks: {
      C: summarise(bench.C),
      G: summarise(bench.G),
      EW: summarise(bench.EW),
    },
    annual: {
      strategy: annualReturns(curveDates, strategy),
      C: annualReturns(curveDates, bench.C),
      EW: annualReturns(curveDates, bench.EW),
    },
    // Weekly samples keep the payload small for charting (full curve is daily).
    curve: curveDates.map((date, i) => ({ date, strategy: strategy[i], C: bench.C[i], G: bench.G[i], EW: bench.EW[i], held: holdings[i] || held }))
      .filter((_, i) => i % 5 === 0 || i === curveDates.length - 1),
    switches: switches.slice(-25).reverse(),
  };
}
