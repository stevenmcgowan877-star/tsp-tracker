import { fetchTspPrices } from "../../lib/tspGov.js";
import { runBacktest } from "../../lib/backtest.js";

// Cache results per date window; tsp.gov data changes once per trading day.
const cache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// Headline numbers only (about 1 KB instead of 180 KB) for the dashboard.
function summarise(r) {
  const strip = ({ annual, recentSwitches, ...rest }) => rest;
  return {
    start: r.start, end: r.end, years: r.years, trendRule: r.trendRule,
    coverage: r.coverage,
    strategies: { trend: strip(r.strategies.trend), hybrid: strip(r.strategies.hybrid), composite: strip(r.strategies.composite) },
    benchmarks: { C: strip(r.benchmarks.C), G: strip(r.benchmarks.G), EW: strip(r.benchmarks.EW) },
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const start = typeof req.query.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.start) ? req.query.start : undefined;
  const summaryOnly = req.query.summary === "1";
  const coverageRaw = typeof req.query.coverage === "string" ? Number(req.query.coverage) : 1;
  const coverage = Number.isFinite(coverageRaw) ? Math.max(0, Math.min(1, coverageRaw)) : 1;
  const key = `${start || "all"}|${coverage}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    return res.status(200).json(summaryOnly ? summarise(hit.data) : hit.data);
  }
  const data = await fetchTspPrices();
  if (!data) return res.status(503).json({ error: "tsp.gov price history is unavailable right now; the backtest needs official data." });
  try {
    const result = runBacktest(data, { start, coverage });
    cache.set(key, { data: result, at: Date.now() });
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    return res.status(200).json(summaryOnly ? summarise(result) : result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
