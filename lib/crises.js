// Replays of the action rule through specific market episodes, so a reader
// can see what it did when it mattered rather than squint at 22 years.
// Windows start a few months before the peak and run past the recovery or
// the next flip, so the whole round trip is visible.

import { runBacktest } from "./backtest.js";

export const EPISODES = [
  { id: "gfc2008", name: "2008 financial crisis", start: "2007-07-02", end: "2010-06-30", peakHint: "2007-10-09" },
  { id: "debt2011", name: "2011 debt-ceiling scare", start: "2011-03-01", end: "2012-03-30", peakHint: "2011-04-29" },
  { id: "china2015", name: "2015-16 China and oil selloff", start: "2015-05-01", end: "2016-07-29", peakHint: "2015-05-21" },
  { id: "rates2018", name: "Late-2018 rate scare", start: "2018-08-01", end: "2019-06-28", peakHint: "2018-09-20" },
  { id: "covid2020", name: "2020 COVID crash", start: "2020-01-02", end: "2020-09-30", peakHint: "2020-02-19" },
  { id: "bear2022", name: "2022 bear market", start: "2021-11-01", end: "2023-06-30", peakHint: "2022-01-03" },
  { id: "spring2025", name: "Spring 2025 selloff", start: "2025-01-02", end: "2025-09-30", peakHint: "2025-02-19" },
  { id: "spring2026", name: "Spring 2026 dip", start: "2026-01-02", end: null, peakHint: null },
];

export function findEpisode(id) {
  return EPISODES.find((e) => e.id === id) || null;
}

// Peak-to-trough of a series within a window, with dates.
function peakTrough(points, key) {
  let peak = points[0], trough = points[0], worst = { from: points[0], to: points[0], drawdown: 0 };
  for (const p of points) {
    if (p[key] > peak[key]) { peak = p; trough = p; }
    if (p[key] < trough[key]) {
      trough = p;
      const dd = trough[key] / peak[key] - 1;
      if (dd < worst.drawdown) worst = { from: peak, to: trough, drawdown: dd };
    }
  }
  return worst;
}

export function runCrisis(series, id) {
  const ep = findEpisode(id);
  if (!ep) throw new Error(`Unknown episode: ${id}`);
  const r = runBacktest(series, { start: ep.start, end: ep.end || undefined, sampleEvery: 1 });
  const curve = r.curve;
  const t = r.strategies.trend;

  const cWorst = peakTrough(curve, "cClose");
  const ruleWorst = peakTrough(curve, "trend");
  const flips = t.recentSwitches.slice().reverse().filter((sw) => sw.date >= r.start && sw.date <= r.end);
  const daysInG = curve.filter((p) => p.held === "G").length;

  // Where the rule stepped aside relative to the C Fund's own peak and trough.
  const exits = flips.filter((f) => f.to === "G");
  const entries = flips.filter((f) => f.to === "C");
  const firstExit = exits[0] || null;
  const reentry = firstExit ? entries.find((f) => f.date > firstExit.date) || null : null;
  const at = (date) => curve.find((p) => p.date === date);
  const pctFromPeak = (date) => {
    const p = at(date);
    return p ? p.cClose / cWorst.from.cClose - 1 : null;
  };
  const pctFromTrough = (date) => {
    const p = at(date);
    return p ? p.cClose / cWorst.to.cClose - 1 : null;
  };

  return {
    episode: ep,
    start: r.start,
    end: r.end,
    days: r.days,
    curve: curve.map(({ date, trend, C, held, cClose, cSma }) => ({ date, trend, C, held, cClose, cSma })),
    stats: {
      cDrawdown: cWorst.drawdown,
      cPeakDate: cWorst.from.date,
      cTroughDate: cWorst.to.date,
      ruleDrawdown: ruleWorst.drawdown,
      ruleFinal: t.final,
      holdCFinal: r.benchmarks.C.final,
      ruleReturn: t.totalReturn,
      holdCReturn: r.benchmarks.C.totalReturn,
      switches: flips.length,
      daysInG,
      shareInG: curve.length ? daysInG / curve.length : 0,
      initialHeld: t.initialHeld,
      lastHeld: t.lastHeld,
    },
    flips,
    story: {
      exitDate: firstExit ? firstExit.date : null,
      exitPctFromPeak: firstExit ? pctFromPeak(firstExit.date) : null,
      reentryDate: reentry ? reentry.date : null,
      reentryPctFromTrough: reentry ? pctFromTrough(reentry.date) : null,
    },
  };
}
