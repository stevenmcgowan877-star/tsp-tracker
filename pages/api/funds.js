import { FUNDS, fetchFundPrices, computeSignals } from "../../lib/marketData.js";
import { fetchTspPrices } from "../../lib/tspGov.js";
import { evaluateTrendRule } from "../../lib/trendRule.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  try {
    const results = await Promise.all(
      FUNDS.map(async (fund) => {
        const priceData = await fetchFundPrices(fund);
        const signals = computeSignals(priceData);
        return { ...fund, ...signals };
      })
    );

    // Sort by composite score descending
    results.sort((a, b) => b.composite - a.composite);

    // The action rule needs the full C Fund history (200-day average plus
    // state replay); the proxy feed is too short, in which case it reports why.
    let trend;
    const tsp = process.env.TSP_DATA_SOURCE === "proxy" ? null : await fetchTspPrices();
    if (tsp && tsp.C) trend = evaluateTrendRule(tsp.C);
    else {
      const c = results.find((f) => f.id === "C");
      trend = evaluateTrendRule(c ? c.prices : []);
    }

    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate");
    res.status(200).json({
      funds: results,
      updatedAt: new Date().toISOString(),
      isDemo: results.some((f) => f.source === "demo"),
      isOfficial: results.every((f) => f.source === "tsp"),
      trend,
    });
  } catch (err) {
    console.error("API error:", err);
    res.status(500).json({ error: "Failed to fetch market data" });
  }
}
