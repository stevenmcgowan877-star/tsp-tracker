// Lifecycle (L) Funds compared with the C Fund and the trend rule over a
// window. L Funds are fixed mixes of G/F/C/S/I that glide toward G and F
// as the target date approaches, so they trade return for a smoother ride
// by construction. This shows what that trade has cost or bought.

import { runBacktest, START_VALUE } from "./backtest.js";

export function lFundNames(series) {
  return Object.keys(series.L || {}).sort((a, b) => {
    if (a === "L Income") return -1;
    if (b === "L Income") return 1;
    return a.localeCompare(b);
  });
}

function stats(points, years) {
  const first = points[0].close, last = points[points.length - 1].close;
  let peak = -Infinity, worst = 0;
  for (const p of points) {
    if (p.close > peak) peak = p.close;
    const dd = p.close / peak - 1;
    if (dd < worst) worst = dd;
  }
  const rets = [];
  for (let i = 1; i < points.length; i++) rets.push(Math.log(points[i].close / points[i - 1].close));
  const mean = rets.reduce((a, b) => a + b, 0) / Math.max(1, rets.length);
  const vol = Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / Math.max(1, rets.length - 1)) * Math.sqrt(252);
  return {
    totalReturn: last / first - 1,
    cagr: years > 0 ? Math.pow(last / first, 1 / years) - 1 : 0,
    maxDrawdown: worst,
    vol,
    final: Math.round(START_VALUE * (last / first)),
  };
}

function yearsBetween(a, b) {
  return (new Date(b) - new Date(a)) / (365.25 * 86400000);
}

// Compare every L Fund with C, G and the trend rule from `start` (YYYY-MM-DD)
// to the end of the data. L Funds that did not exist at `start` are reported
// from their first available date, which is stated so the comparison is
// read fairly.
export function compareLFunds(series, { start, sampleEvery = 5 } = {}) {
  const base = runBacktest(series, { start, sampleEvery });
  const windowStart = base.start, windowEnd = base.end;
  const years = base.years;
  const cCurve = base.curve;
  const dateIndex = new Map(cCurve.map((p, i) => [p.date, i]));

  const funds = lFundNames(series).map((name) => {
    const all = series.L[name].filter((p) => p.date >= windowStart && p.date <= windowEnd);
    if (all.length < 30) return { name, available: false };
    const from = all[0].date;
    const partial = from > windowStart;
    const yrs = yearsBetween(from, all[all.length - 1].date);
    const st = stats(all, yrs);
    // Sampled growth curve on the same dates as the base curve.
    const byDate = new Map(all.map((p) => [p.date, p.close]));
    const first = all[0].close;
    const curve = cCurve.map((p) => {
      const c = byDate.get(p.date);
      return c == null ? null : START_VALUE * (c / first);
    });
    return { name, available: true, from, partial, years: yrs, ...st, curve };
  });

  return {
    start: windowStart,
    end: windowEnd,
    years,
    dates: cCurve.map((p) => p.date),
    benchmarks: {
      C: { ...base.benchmarks.C, curve: cCurve.map((p) => p.C) },
      G: { ...base.benchmarks.G, curve: cCurve.map((p) => p.G) },
      trend: { ...base.strategies.trend, curve: cCurve.map((p) => p.trend) },
    },
    funds,
    _dateIndex: undefined,
  };
}
