import { fetchTspPrices } from "../../lib/tspGov.js";
import { runPlan } from "../../lib/plan.js";

const cache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function num(v, fallback) {
  const n = typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const balance = Math.max(0, Math.min(1e8, num(req.query.balance, 0)));
  const contribution = Math.max(0, Math.min(1e5, num(req.query.contribution, 0)));
  const years = Math.round(Math.max(1, Math.min(40, num(req.query.years, 20))));
  const key = `${balance}|${contribution}|${years}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    return res.status(200).json(hit.data);
  }
  const data = await fetchTspPrices();
  if (!data) return res.status(503).json({ error: "tsp.gov price history is unavailable right now." });
  try {
    const result = runPlan(data, { balance, contribution, years });
    if (cache.size > 200) cache.clear();
    cache.set(key, { data: result, at: Date.now() });
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
