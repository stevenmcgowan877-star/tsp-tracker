import { FUNDS, fetchDailyPrices, computeSignals } from "../../lib/marketData";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  try {
    const results = await Promise.all(
      FUNDS.map(async (fund) => {
        const priceData = await fetchDailyPrices(fund.proxy);
        const signals = computeSignals(priceData);
        return { ...fund, ...signals };
      })
    );

    // Sort by composite score descending
    results.sort((a, b) => b.composite - a.composite);

    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate");
    res.status(200).json({
      funds: results,
      updatedAt: new Date().toISOString(),
      isDemo: results.some((f) => f.source === "demo"),
    });
  } catch (err) {
    console.error("API error:", err);
    res.status(500).json({ error: "Failed to fetch market data" });
  }
}
