// Replays of the action rule through specific market episodes, so a reader
// can see what it did when it mattered rather than squint at 22 years.
// Windows start a few months before the peak and run past the recovery or
// the next flip, so the whole round trip is visible.

import { runBacktest } from "./backtest.js";
import { EPISODES, findEpisode } from "./episodes.js";

export { EPISODES, findEpisode };

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
  const r = runBacktest(series, { start: ep.start, end: ep.end || undefined, sampleEvery: 1, switchLimit: Infinity });
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
  // Distance from the highest C close seen so far on that date (the peak the
  // rule was actually reacting to), not the peak of the window's worst fall.
  const pctFromPeak = (date) => {
    let peak = -Infinity, close = null;
    for (const p of curve) {
      if (p.cClose > peak) peak = p.cClose;
      if (p.date === date) { close = p.cClose; break; }
    }
    return close == null ? null : close / peak - 1;
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
