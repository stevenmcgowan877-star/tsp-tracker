// Replays allocation rules over the full tsp.gov history.
//
// Two strategies are replayed side by side, each evaluated on a close and
// executed at the NEXT close (a TSP interfund transfer requested before noon
// ET settles at that day's close, so acting on yesterday's signal today is
// realistic and avoids look-ahead). Both obey the TSP limit of two
// unrestricted interfund transfers per calendar month, after which only
// moves INTO G are allowed.
//
//   trend      the action rule in lib/trendRule.js: C while its close is more
//              than 3% above its 200-day average, G once it is more than 3%
//              below, otherwise unchanged.
//   composite  the dashboard's five-signal score: switch into the top-ranked
//              fund when it reads BUY, move to G when the held fund reads
//              AVOID, otherwise stay.
//
// Benchmarks: buy-and-hold C, buy-and-hold G, and equal-weight C/S/I/F
// rebalanced at the start of each month.

import { computeSignals } from "./marketData.js";
import { smaAt, nextTrendState, trendStateAt, TREND_N, TREND_BAND, RULE_ADOPTED } from "./trendRule.js";

export const LOOKBACK = 100;
export const START_VALUE = 10000;
export const EQUITY_FUNDS = ["C", "S", "I", "F"];
export const ALL_FUNDS = ["G", ...EQUITY_FUNDS];
const IFT_LIMIT = 2;

// Align the five series on dates present in all of them.
export function alignSeries(series) {
  const maps = ALL_FUNDS.map((id) => new Map((series[id] || []).map((p) => [p.date, p.close])));
  const dates = [...maps[0].keys()].filter((d) => maps.every((m) => m.has(d))).sort();
  const closes = {};
  ALL_FUNDS.forEach((id, i) => { closes[id] = dates.map((d) => maps[i].get(d)); });
  return { dates, closes };
}

function signalsAt(closes, id, t, lookback) {
  const window = closes[id].slice(Math.max(0, t - lookback + 1), t + 1);
  return computeSignals({ prices: window.map((close) => ({ close })), source: "tsp" });
}

// Decision functions: (t, held) -> fund to move into, or null to stay.
export function compositeDecision(closes, lookback = LOOKBACK) {
  return (t, held, { iftUsed }) => {
    const sig = {};
    for (const id of EQUITY_FUNDS) sig[id] = signalsAt(closes, id, t, lookback);
    const top = EQUITY_FUNDS.slice().sort((a, b) => sig[b].composite - sig[a].composite)[0];
    if (sig[top].signal === "BUY" && top !== held && iftUsed < IFT_LIMIT) return top;
    if (held !== "G" && sig[held].signal === "AVOID") return "G";
    return null;
  };
}

export function trendDecision(closes, { n = TREND_N, band = TREND_BAND } = {}) {
  return (t, held, { iftUsed }) => {
    const state = held === "C" ? "ON" : "OFF";
    const next = nextTrendState(state, closes.C[t], smaAt(closes.C, t, n), band);
    if (next === state) return null;
    if (next === "OFF") return "G";
    return iftUsed < IFT_LIMIT ? "C" : null;
  };
}

export function maxDrawdown(curve) {
  let peak = -Infinity, worst = 0;
  for (const v of curve) {
    if (v > peak) peak = v;
    const dd = (v - peak) / peak;
    if (dd < worst) worst = dd;
  }
  return worst;
}

export function cagr(first, last, years) {
  if (years <= 0 || first <= 0) return 0;
  return Math.pow(last / first, 1 / years) - 1;
}

export function yearsBetween(a, b) {
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

export function summarise(curve, years) {
  return {
    final: Math.round(curve[curve.length - 1]),
    totalReturn: curve[curve.length - 1] / curve[0] - 1,
    cagr: cagr(curve[0], curve[curve.length - 1], years),
    maxDrawdown: maxDrawdown(curve),
  };
}

// Replay one decision function from `initialHeld`. Returns the daily curve
// plus holdings/switches; holdings[j] is the fund held during the day that
// produced curve[j + 1]. The two-per-month transfer count is kept by the
// month the transfer is PROCESSED (the next close), as TSP Bulletin 08-4
// specifies, not the month the signal appeared.
function replay(decide, dates, closes, firstIdx, lastIdx, initialHeld = "G") {
  const curve = [START_VALUE];
  const holdings = [];
  const switches = [];
  let held = initialHeld;
  let pending = null;
  const usedByMonth = new Map();
  for (let t = firstIdx + 1; t <= lastIdx; t++) {
    curve.push(curve[curve.length - 1] * (closes[held][t] / closes[held][t - 1]));
    holdings.push(held);
    if (pending && pending !== held) {
      switches.push({ date: dates[t], from: held, to: pending });
      held = pending;
    }
    pending = null;
    if (t === lastIdx) break;
    const execMonth = dates[t + 1].slice(0, 7);
    const iftUsed = usedByMonth.get(execMonth) || 0;
    const target = decide(t, held, { iftUsed });
    if (target && target !== held) {
      pending = target;
      if (target !== "G") usedByMonth.set(execMonth, iftUsed + 1);
    }
  }
  return { curve, holdings, switches, lastHeld: held, initialHeld };
}

// Replays the dashboard's coverage advice on top of the trend rule's
// holdings: when the rule turns OFF, move `coverage` of the WHOLE balance to G
// and leave the rest in C; when it turns ON, move everything back to C. The
// split drifts between flips (no rebalancing). coverage 1 reproduces the
// trend curve and coverage 0 reproduces buy-and-hold C. The transfers happen
// on exactly the closes the trend replay switches, so they obey the same
// two-per-month limit (moves into G are always allowed).
export function coverageCurve(holdings, initialHeld, closes, firstIdx, coverage) {
  const split = (held, total) => (held === "G" ? { c: (1 - coverage) * total, g: coverage * total } : { c: total, g: 0 });
  let { c, g } = split(initialHeld, START_VALUE);
  let prev = initialHeld;
  const curve = [START_VALUE];
  for (let j = 0; j < holdings.length; j++) {
    const h = holdings[j];
    if (h !== prev) { ({ c, g } = split(h, c + g)); prev = h; }
    const t = firstIdx + j + 1;
    c *= closes.C[t] / closes.C[t - 1];
    g *= closes.G[t] / closes.G[t - 1];
    curve.push(c + g);
  }
  return curve;
}

// `coverage` is the share of the balance the trend rule governs (0-1); see
// coverageCurve for exactly what is simulated.
export function runBacktest(series, { lookback = LOOKBACK, start, end, sampleEvery = 5, switchLimit = 40, coverage = 1 } = {}) {
  coverage = Math.max(0, Math.min(1, Number(coverage) || 0));
  const { dates, closes } = alignSeries(series);
  const warmup = Math.max(lookback, TREND_N);
  if (dates.length < warmup + 2) throw new Error("Not enough history for a backtest");

  let firstIdx = warmup;
  if (start) {
    const si = dates.findIndex((d) => d >= start);
    if (si === -1) throw new Error("Date window is empty");
    firstIdx = Math.max(firstIdx, si);
  }
  let lastIdx = dates.length - 1;
  if (end) { const e = dates.findIndex((d) => d > end); if (e !== -1) lastIdx = e - 1; }
  if (lastIdx <= firstIdx) throw new Error("Date window is empty");

  const span = yearsBetween(dates[firstIdx], dates[lastIdx]);
  const curveDates = dates.slice(firstIdx, lastIdx + 1);

  // The trend rule starts the window in whatever state it was actually in on
  // the start date (replayed from the beginning of the data). The composite
  // has no single state to seed from, so it starts flat in G.
  const trendStart = trendStateAt(closes.C, firstIdx) === "ON" ? "C" : "G";
  const trend = replay(trendDecision(closes), dates, closes, firstIdx, lastIdx, trendStart);
  const composite = replay(compositeDecision(closes, lookback), dates, closes, firstIdx, lastIdx, "G");

  // Benchmarks
  const bench = { C: [START_VALUE], G: [START_VALUE], EW: [START_VALUE] };
  let ewUnits = null, ewMonth = "";
  for (let t = firstIdx + 1; t <= lastIdx; t++) {
    bench.C.push(bench.C[bench.C.length - 1] * (closes.C[t] / closes.C[t - 1]));
    bench.G.push(bench.G[bench.G.length - 1] * (closes.G[t] / closes.G[t - 1]));
    const month = dates[t].slice(0, 7);
    if (!ewUnits || month !== ewMonth) {
      const v = bench.EW[bench.EW.length - 1];
      ewUnits = {};
      for (const id of EQUITY_FUNDS) ewUnits[id] = (v / EQUITY_FUNDS.length) / closes[id][t - 1];
      ewMonth = month;
    }
    bench.EW.push(EQUITY_FUNDS.reduce((sum, id) => sum + ewUnits[id] * closes[id][t], 0));
  }

  const hybridCurve = coverageCurve(trend.holdings, trend.initialHeld, closes, firstIdx, coverage);

  // The live record: everything after the parameters were fixed. It is
  // anchored at the last close on or before the adoption date, so the first
  // live day is the first close after it. Empty until that close posts.
  const liveRecord = (() => {
    let a = -1;
    for (let i = firstIdx; i <= lastIdx; i++) if (dates[i] <= RULE_ADOPTED) a = i; else break;
    if (a < 0) return null; // window starts after adoption: all of it is live
    const j = a - firstIdx;
    const days = lastIdx - a;
    const slice = (curve) => curve.slice(j);
    const stat = (curve) => {
      const c = slice(curve);
      return { totalReturn: c[c.length - 1] / c[0] - 1, maxDrawdown: maxDrawdown(c) };
    };
    return {
      adopted: RULE_ADOPTED,
      from: dates[a],
      to: dates[lastIdx],
      days,
      switches: trend.switches.filter((sw) => sw.date > dates[a]).length,
      trend: stat(trend.curve),
      hybrid: stat(hybridCurve),
      C: stat(bench.C),
      G: stat(bench.G),
    };
  })();

  const describe = (r, keepSwitches) => {
    const timeIn = {};
    for (const id of ALL_FUNDS) timeIn[id] = 0;
    for (const h of r.holdings) timeIn[h]++;
    for (const id of ALL_FUNDS) timeIn[id] /= Math.max(1, r.holdings.length);
    return {
      ...summarise(r.curve, span),
      switches: r.switches.length,
      timeIn,
      initialHeld: r.initialHeld,
      lastHeld: r.lastHeld,
      annual: annualReturns(curveDates, r.curve),
      recentSwitches: (Number.isFinite(keepSwitches) ? r.switches.slice(-keepSwitches) : r.switches.slice()).reverse(),
    };
  };

  return {
    start: dates[firstIdx],
    end: dates[lastIdx],
    years: span,
    days: lastIdx - firstIdx,
    lookback,
    trendRule: { n: TREND_N, band: TREND_BAND, adopted: RULE_ADOPTED },
    coverage,
    liveRecord,
    strategies: {
      trend: describe(trend, switchLimit),
      // The rule moving `coverage` of the balance at each flip, the rest in C.
      hybrid: { ...summarise(hybridCurve, span), coverage, switches: trend.switches.length, annual: annualReturns(curveDates, hybridCurve) },
      composite: describe(composite, Math.min(25, switchLimit)),
    },
    benchmarks: {
      C: { ...summarise(bench.C, span), annual: annualReturns(curveDates, bench.C) },
      G: { ...summarise(bench.G, span), annual: annualReturns(curveDates, bench.G) },
      EW: { ...summarise(bench.EW, span), annual: annualReturns(curveDates, bench.EW) },
    },
    // Sampled every `sampleEvery` days to keep the payload small (the replay
    // itself is daily). cClose/cSma let a chart show the rule's inputs.
    curve: curveDates
      .map((date, i) => ({
        date, trend: trend.curve[i], hybrid: hybridCurve[i], composite: composite.curve[i], C: bench.C[i], G: bench.G[i], EW: bench.EW[i],
        held: i === 0 ? trend.initialHeld : trend.holdings[i - 1],
        cClose: closes.C[firstIdx + i],
        cSma: parseFloat(smaAt(closes.C, firstIdx + i, TREND_N).toFixed(4)),
      }))
      .filter((_, i) => i % sampleEvery === 0 || i === curveDates.length - 1),
  };
}
