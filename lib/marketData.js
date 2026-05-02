// TSP Fund proxy ETFs — these track the same indexes as each TSP fund
export const FUNDS = [
  { id: "C", name: "C Fund", desc: "S&P 500 Index", proxy: "SPY", color: "#00ff88" },
  { id: "S", name: "S Fund", desc: "Small/Mid Cap Index", proxy: "IWM", color: "#00cfff" },
  { id: "I", name: "I Fund", desc: "International Index", proxy: "EFA", color: "#a78bfa" },
  { id: "F", name: "F Fund", desc: "Fixed Income Index", proxy: "AGG", color: "#fbbf24" },
  { id: "G", name: "G Fund", desc: "Gov't Securities (stable)", proxy: "SAFE", color: "#94a3b8" },
];

// In-memory cache: { symbol -> { data, fetchedAt } }
const cache = {};
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function fetchDailyPrices(symbol) {
  // G Fund has no real proxy — return synthetic flat/low-volatility data
  if (symbol === "SAFE") return generateSafeData();

  const now = Date.now();
  if (cache[symbol] && now - cache[symbol].fetchedAt < CACHE_TTL_MS) {
    return cache[symbol].data;
  }

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey || apiKey === "your_api_key_here") {
    console.warn("No Alpha Vantage API key set — using demo data");
    return generateDemoData(symbol);
  }

  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}&outputsize=compact&apikey=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 900 } });
    const json = await res.json();

    if (json["Note"] || json["Information"]) {
      // Rate limited — fall back to demo
      console.warn(`Alpha Vantage rate limit hit for ${symbol}`);
      return generateDemoData(symbol);
    }

    const series = json["Time Series (Daily)"];
    if (!series) throw new Error("No data");

    const prices = Object.entries(series)
      .slice(0, 60)
      .reverse()
      .map(([date, bar]) => ({
        date,
        close: parseFloat(bar["5. adjusted close"]),
        volume: parseInt(bar["6. volume"]),
      }));

    const result = { prices, source: "live", symbol };
    cache[symbol] = { data: result, fetchedAt: now };
    return result;
  } catch (e) {
    console.error(`Failed to fetch ${symbol}:`, e.message);
    return generateDemoData(symbol);
  }
}

function generateDemoData(symbol) {
  const bases = { SPY: 520, IWM: 198, EFA: 78, AGG: 96 };
  const base = bases[symbol] || 100;
  const prices = [];
  let p = base * 0.88;
  const seed = symbol.charCodeAt(0) * 7;
  for (let i = 60; i >= 0; i--) {
    const pseudo = Math.sin(i * seed) * 0.5 + 0.5;
    p += (pseudo - 0.47) * base * 0.012;
    p = Math.max(p, base * 0.7);
    const date = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
    prices.push({ date, close: parseFloat(p.toFixed(2)), volume: Math.floor(pseudo * 50000000) });
  }
  return { prices, source: "demo", symbol };
}

function generateSafeData() {
  const prices = [];
  let p = 17.5;
  for (let i = 60; i >= 0; i--) {
    p += 0.001; // G Fund barely moves — government securities
    const date = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
    prices.push({ date, close: parseFloat(p.toFixed(4)), volume: 0 });
  }
  return { prices, source: "synthetic", symbol: "SAFE" };
}

export function computeSignals(priceData) {
  const closes = priceData.prices.map((p) => p.close);
  const current = closes[closes.length - 1];
  const prev = closes[closes.length - 2] || current;

  const sma = (n) => closes.slice(-n).reduce((a, b) => a + b, 0) / Math.min(n, closes.length);
  const sma20 = sma(20), sma50 = sma(50), sma200 = sma(Math.min(200, closes.length));

  // RSI
  const gains = [], losses = [];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains.push(d); else losses.push(Math.abs(d));
  }
  const avgGain = gains.slice(-14).reduce((a, b) => a + b, 0) / 14;
  const avgLoss = losses.slice(-14).reduce((a, b) => a + b, 0) / 14;
  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  // MACD
  const ema = (n) => {
    const k = 2 / (n + 1);
    return closes.slice(-n * 2).reduce((prev, curr, i) => i === 0 ? curr : prev * (1 - k) + curr * k);
  };
  const macd = ema(12) - ema(26);
  const signal = ema(9);
  const macdHist = macd - signal;

  // Supply & Demand zones (20-day high/low)
  const high20 = Math.max(...closes.slice(-20));
  const low20 = Math.min(...closes.slice(-20));
  const inDemandZone = current <= low20 * 1.02;
  const inSupplyZone = current >= high20 * 0.98;

  // Scoring
  const maScore = current > sma20 && sma20 > sma50 ? 1 : current < sma20 && sma20 < sma50 ? -1 : 0;
  const rsiScore = rsi < 35 ? 1 : rsi > 68 ? -1 : 0;
  const macdScore = macdHist > 0 ? 0.7 : -0.7;
  const sdScore = inDemandZone ? 1 : inSupplyZone ? -1 : 0;

  const composite = (maScore * 0.3 + rsiScore * 0.25 + macdScore * 0.25 + sdScore * 0.2);
  const signal_out = composite > 0.25 ? "BUY" : composite < -0.25 ? "AVOID" : "HOLD";

  return {
    current, prev,
    change: (((current - prev) / prev) * 100).toFixed(2),
    sma20, sma50, sma200,
    rsi: parseFloat(rsi.toFixed(1)),
    macd: parseFloat(macd.toFixed(3)),
    macdHist: parseFloat(macdHist.toFixed(3)),
    high20, low20,
    inDemandZone, inSupplyZone,
    maScore, rsiScore, macdScore, sdScore,
    composite: parseFloat(Math.max(-1, Math.min(1, composite)).toFixed(3)),
    signal: signal_out,
    prices: priceData.prices.slice(-30),
    source: priceData.source,
  };
}
