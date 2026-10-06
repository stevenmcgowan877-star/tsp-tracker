import { fetchTspPrices } from "../../lib/tspGov.js";
import { runPlan, BLOCK_OPTIONS, DEFAULT_BLOCK } from "../../lib/plan.js";

const cache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function num(v, fallback) {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const q = req.query;
  const params = {
    balance: clamp(num(q.balance, 0), 0, 1e8),
    contribution: clamp(num(q.contribution, 0), 0, 1e5),
    salary: clamp(num(q.salary, 0), 0, 1e7),
    pct: clamp(num(q.pct, 0), 0, 100) / 100,
    age: Math.round(clamp(num(q.age, 0), 0, 100)) || null,
    years: Math.round(clamp(num(q.years, 20), 1, 40)),
    retireYears: Math.round(clamp(num(q.retireYears, 0), 0, 40)),
    withdrawalRate: clamp(num(q.withdrawalRate, 4), 0, 20) / 100,
    coverage: clamp(num(q.coverage, 1), 0, 1),
    block: BLOCK_OPTIONS.includes(num(q.block, DEFAULT_BLOCK)) ? num(q.block, DEFAULT_BLOCK) : DEFAULT_BLOCK,
  };
  const key = JSON.stringify(params);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    return res.status(200).json(hit.data);
  }
  const data = await fetchTspPrices();
  if (!data) return res.status(503).json({ error: "tsp.gov price history is unavailable right now." });
  try {
    const result = runPlan(data, params);
    if (cache.size > 200) cache.clear();
    cache.set(key, { data: result, at: Date.now() });
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
