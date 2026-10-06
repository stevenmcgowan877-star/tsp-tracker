// The action rule: a slow trend filter on the C Fund.
//
//   Hold C while its close is more than BAND above its N-day simple moving
//   average. Move to G once it closes more than BAND below. Otherwise stay
//   where you are. Checked on every close; acted on at the next close (a TSP
//   interfund transfer requested before noon ET settles that day).
//
// Chosen over the five-signal composite after replaying 2004-2026 on official
// tsp.gov prices: it kept ~92% of the C Fund's compounding with about a
// third of its worst drawdown and ~25 switches in 22 years. See README and
// /backtest for the evidence; lib/backtest.js replays both rules.

export const TREND_N = 200;
export const TREND_BAND = 0.03;

export function smaAt(closes, t, n) {
  const a = Math.max(0, t - n + 1);
  let s = 0;
  for (let i = a; i <= t; i++) s += closes[i];
  return s / (t - a + 1);
}

// Pure state transition. state is "ON" (hold C) or "OFF" (hold G).
export function nextTrendState(state, price, sma, band = TREND_BAND) {
  if (state !== "ON" && price > sma * (1 + band)) return "ON";
  if (state === "ON" && price < sma * (1 - band)) return "OFF";
  return state;
}

// State of the rule on close index `t` of a closes array, replayed from the
// first index with a full window. Used to seed windowed backtests.
export function trendStateAt(closes, t, { n = TREND_N, band = TREND_BAND } = {}) {
  let state = "OFF";
  for (let i = n - 1; i <= t; i++) state = nextTrendState(state, closes[i], smaAt(closes, i, n), band);
  return state;
}

// Replay the rule over a C Fund price history ([{date, close}], oldest first)
// and describe where it stands on the last close.
export function evaluateTrendRule(prices, { n = TREND_N, band = TREND_BAND } = {}) {
  const closes = prices.map((p) => p.close);
  const last = closes.length - 1;
  if (closes.length < n + 1) {
    return { available: false, reason: `Needs ${n + 1} closes, have ${closes.length}`, n, band };
  }
  let state = "OFF";
  const flips = [];
  let lastFlipIdx = n - 1;
  for (let t = n - 1; t <= last; t++) {
    const next = nextTrendState(state, closes[t], smaAt(closes, t, n), band);
    if (next !== state) {
      flips.push({ date: prices[t].date, to: next === "ON" ? "C" : "G" });
      state = next;
      lastFlipIdx = t;
    }
  }
  const sma = smaAt(closes, last, n);
  const price = closes[last];
  const lastFlip = flips[flips.length - 1] || null;
  return {
    available: true,
    n, band,
    asOf: prices[last].date,
    state,                                  // "ON" => be in C, "OFF" => be in G
    hold: state === "ON" ? "C" : "G",
    price,
    sma: parseFloat(sma.toFixed(4)),
    pctVsSma: parseFloat(((price / sma - 1) * 100).toFixed(2)),
    sellTrigger: parseFloat((sma * (1 - band)).toFixed(2)),   // close below this while ON => move to G
    buyTrigger: parseFloat((sma * (1 + band)).toFixed(2)),    // close above this while OFF => move to C
    since: lastFlip ? lastFlip.date : prices[n - 1].date,
    barsSinceFlip: last - lastFlipIdx,       // 0 = the state began on the latest close
    flips: flips.slice(-12).reverse(),
    flipCount: flips.length,
  };
}
