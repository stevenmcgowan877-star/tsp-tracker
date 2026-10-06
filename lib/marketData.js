import { sma, rsi, macd, volatility } from "./indicators.js";

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
    // TIME_SERIES_DAILY is on the free tier (the _ADJUSTED variant is premium
    // and returns an "Information" message on free keys). compact = last 100 bars.
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}&outputsize=compact&apikey=${apiKey}`;
    const res = await fetch(url);
    const json = await res.json();

    if (json["Note"] || json["Information"]) {
      // Rate limited or premium-only — fall back to demo
      console.warn(`Alpha Vantage limit hit for ${symbol}: ${json["Note"] || json["Information"]}`);
      return generateDemoData(symbol);
    }

    const series = json["Time Series (Daily)"];
    if (!series) throw new Error("No data");

    const prices = Object.entries(series)
      .sort(([a], [b]) => (a < b ? -1 : 1)) // oldest -> newest
      .map(([date, bar]) => ({
        date,
        close: parseFloat(bar["4. close"]),
        volume: parseInt(bar["5. volume"], 10),
      }))
      .filter((p) => Number.isFinite(p.close));

    if (prices.length < 30) throw new Error("Too few bars");

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
  for (let i = 100; i >= 0; i--) {
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
  for (let i = 100; i >= 0; i--) {
    p += 0.001; // G Fund barely moves — government securities
    const date = new Date(Date.now() - i * 86400000).toISOString().split("T")[0];
    prices.push({ date, close: parseFloat(p.toFixed(4)), volume: 0 });
  }
  return { prices, source: "synthetic", symbol: "SAFE" };
}

// Signal weights. Must sum to 1.
export const WEIGHTS = { ma: 0.3, rsi: 0.2, macd: 0.2, sd: 0.15, vol: 0.15 };
export const BUY_THRESHOLD = 0.25;

export function computeSignals(priceData) {
  const closes = priceData.prices.map((p) => p.close);
  const n = closes.length;
  const current = closes[n - 1];
  const prev = closes[n - 2] ?? current;

  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const smaLongN = Math.min(200, n);
  const smaLong = sma(closes, smaLongN);

  const rsiValue = rsi(closes, 14);
  const { macd: macdValue, hist: macdHist } = macd(closes);

  // Supply & Demand zones (20-day high/low)
  const high20 = Math.max(...closes.slice(-20));
  const low20 = Math.min(...closes.slice(-20));
  const inDemandZone = current <= low20 * 1.02;
  const inSupplyZone = current >= high20 * 0.98;

  // Volatility regime: recent 10-day vol vs the 60-day baseline.
  const volShort = volatility(closes, 10);
  const volLong = volatility(closes, 60);
  const volRatio = volLong > 0 ? volShort / volLong : 1;

  // Scoring
  const maScore = current > sma20 && sma20 > sma50 ? 1 : current < sma20 && sma20 < sma50 ? -1 : 0;
  const rsiScore = rsiValue < 35 ? 1 : rsiValue > 68 ? -1 : 0;
  const macdScore = macdHist > 0 ? 0.7 : -0.7;
  const sdScore = inDemandZone ? 1 : inSupplyZone ? -1 : 0;
  // Calming volatility is favourable; a spike in volatility is not.
  const volScore = volRatio < 0.8 ? 1 : volRatio > 1.3 ? -1 : 0;

  const synthetic = priceData.source === "synthetic";
  const scores = synthetic
    ? { maScore: 0, rsiScore: 0, macdScore: 0, sdScore: 0, volScore: 0 }
    : { maScore, rsiScore, macdScore, sdScore, volScore };

  const rawComposite = synthetic
    ? 0
    : maScore * WEIGHTS.ma + rsiScore * WEIGHTS.rsi + macdScore * WEIGHTS.macd + sdScore * WEIGHTS.sd + volScore * WEIGHTS.vol;
  const composite = parseFloat(Math.max(-1, Math.min(1, rawComposite)).toFixed(3));
  const signal_out = composite > BUY_THRESHOLD ? "BUY" : composite < -BUY_THRESHOLD ? "AVOID" : "HOLD";

  return {
    current, prev,
    change: (((current - prev) / prev) * 100).toFixed(2),
    sma20, sma50, smaLong, smaLongN,
    // Technical readings are meaningless on the synthetic G Fund series.
    rsi: synthetic ? null : parseFloat(rsiValue.toFixed(1)),
    macd: synthetic ? null : parseFloat(macdValue.toFixed(3)),
    macdHist: synthetic ? null : parseFloat(macdHist.toFixed(3)),
    high20, low20,
    inDemandZone: synthetic ? false : inDemandZone,
    inSupplyZone: synthetic ? false : inSupplyZone,
    volatility: parseFloat((volShort * 100).toFixed(1)), // annualised, in %
    volRatio: parseFloat(volRatio.toFixed(2)),
    ...scores,
    composite,
    signal: signal_out,
    prices: priceData.prices.slice(-30),
    source: priceData.source,
  };
}
