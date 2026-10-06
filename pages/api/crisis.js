import { fetchTspPrices } from "../../lib/tspGov.js";
import { runCrisis, EPISODES } from "../../lib/crises.js";

const cache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!EPISODES.some((e) => e.id === id)) {
    return res.status(400).json({ error: "Unknown episode", episodes: EPISODES.map(({ id, name, start, end }) => ({ id, name, start, end })) });
  }
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    return res.status(200).json(hit.data);
  }
  const data = await fetchTspPrices();
  if (!data) return res.status(503).json({ error: "tsp.gov price history is unavailable right now." });
  try {
    const result = runCrisis(data, id);
    cache.set(id, { data: result, at: Date.now() });
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}
