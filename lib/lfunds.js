// Lifecycle (L) Funds compared with the C Fund and the trend rule over a
// window. L Funds are fixed mixes of G/F/C/S/I that glide toward G and F
// as the target date approaches, so they trade return for a smoother ride
// by construction. This shows what that trade has cost or bought.

import { runBacktest, START_VALUE, maxDrawdown, cagr, yearsBetween } from "./backtest.js";

export function lFundNames(series) {
  return Object.keys(series.L || {}).sort((a, b) => {
    if (a === "L Income") return -1;
    if (b === "L Income") return 1;
    return a.localeCompare(b);
  });
}

// Annualised volatility of a value series (daily log returns, sqrt(252)).
function annualVol(values) {
  const rets = [];
  for (let i = 1; i < values.length; i++) if (values[i - 1] > 0 && values[i] > 0) rets.push(Math.log(values[i] / values[i - 1]));
  if (rets.length < 2) return 0;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  return Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1)) * Math.sqrt(252);
}

function stats(values, years) {
  const first = values[0], last = values[values.length - 1];
  return {
    totalReturn: last / first - 1,
    cagr: cagr(first, last, years),
    maxDrawdown: maxDrawdown(values),
    vol: annualVol(values),
    final: Math.round(START_VALUE * (last / first)),
  };
}

// Compare every L Fund with C, G and the trend rule from `start` (YYYY-MM-DD)
// to the end of the data. L Funds that did not exist at `start` are reported
// from their first available date, which is stated so the comparison is
// read fairly.
export function compareLFunds(series, { start, sampleEvery = 5 } = {}) {
  // Daily replay for the statistics; the curves are thinned afterwards.
  const base = runBacktest(series, { start, sampleEvery: 1 });
  const windowStart = base.start, windowEnd = base.end;
  const years = base.years;
  const daily = base.curve;
  const keep = (i) => i % sampleEvery === 0 || i === daily.length - 1;

  const funds = lFundNames(series).map((name) => {
    const all = series.L[name].filter((p) => p.date >= windowStart && p.date <= windowEnd);
    if (all.length < 30) return { name, available: false };
    const from = all[0].date;
    const partial = from > windowStart;
    const yrs = yearsBetween(from, all[all.length - 1].date);
    const st = stats(all.map((p) => p.close), yrs);
    const byDate = new Map(all.map((p) => [p.date, p.close]));
    const first = all[0].close;
    const curve = daily.map((p) => { const c = byDate.get(p.date); return c == null ? null : START_VALUE * (c / first); }).filter((_, i) => keep(i));
    return { name, available: true, from, partial, years: yrs, ...st, curve };
  });

  const bench = (key) => {
    const values = daily.map((p) => p[key]);
    return { ...stats(values, years), curve: values.filter((_, i) => keep(i)) };
  };

  return {
    start: windowStart,
    end: windowEnd,
    years,
    dates: daily.map((p) => p.date).filter((_, i) => keep(i)),
    benchmarks: { C: bench("C"), G: bench("G"), trend: { ...bench("trend"), switches: base.strategies.trend.switches } },
    funds,
  };
}
