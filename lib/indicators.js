// Pure technical-indicator helpers. All functions take an array of closing
// prices ordered oldest -> newest and return plain numbers, so they are easy
// to unit test (see tests/indicators.test.js).

export function sma(closes, n) {
  if (!closes.length) return NaN;
  const window = closes.slice(-n);
  return window.reduce((a, b) => a + b, 0) / window.length;
}

// Exponential moving average series, seeded with the first close.
export function emaSeries(closes, n) {
  const k = 2 / (n + 1);
  const out = [];
  let prev;
  for (let i = 0; i < closes.length; i++) {
    prev = i === 0 ? closes[i] : prev * (1 - k) + closes[i] * k;
    out.push(prev);
  }
  return out;
}

export function ema(closes, n) {
  const series = emaSeries(closes, n);
  return series[series.length - 1];
}

// Wilder's RSI: seeded with a simple average over the first `period` moves,
// then smoothed. Returns 50 (neutral) when there is not enough history.
export function rsi(closes, period = 14) {
  if (closes.length <= period) return 50;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  if (avgGain === 0) return 0;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

// MACD line = EMA(fast) - EMA(slow); signal = EMA(signalN) of the MACD line.
export function macd(closes, fast = 12, slow = 26, signalN = 9) {
  const fastSeries = emaSeries(closes, fast);
  const slowSeries = emaSeries(closes, slow);
  const line = fastSeries.map((v, i) => v - slowSeries[i]);
  const signalSeries = emaSeries(line, signalN);
  const last = line.length - 1;
  const macdValue = line[last];
  const signalValue = signalSeries[last];
  return { macd: macdValue, signal: signalValue, hist: macdValue - signalValue };
}

// Annualised volatility: standard deviation of daily log returns over the
// last `n` days, scaled by sqrt(252 trading days). Returns 0 for flat series.
export function volatility(closes, n = 20) {
  const returns = [];
  for (let i = Math.max(1, closes.length - n); i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) returns.push(Math.log(closes[i] / closes[i - 1]));
  }
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}
