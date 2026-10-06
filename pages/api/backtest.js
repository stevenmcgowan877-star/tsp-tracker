import { fetchTspPrices } from "../../lib/tspGov.js";
import { runBacktest } from "../../lib/backtest.js";

// Cache results per date window; tsp.gov data changes once per trading day.
const cache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const start = typeof req.query.start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.start) ? req.query.start : undefined;
  const key = start || "all";
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    return res.status(200).json(hit.data);
  }
  const data = await fetchTspPrices();
  if (!data) return res.status(503).json({ error: "tsp.gov price history is unavailable right now; the backtest needs official data." });
  try {
    const result = runBacktest(data, { start });
    cache.set(key, { data: result, at: Date.now() });
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
