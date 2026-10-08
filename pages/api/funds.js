import { loadDashboardData } from "../../lib/dashboardData.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  try {
    const { funds, trend, isDemo, isOfficial } = await loadDashboardData();
    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate");
    res.status(200).json({
      funds,
      updatedAt: new Date().toISOString(),
      isDemo,
      isOfficial,
      trend,
    });
  } catch (err) {
    console.error("API error:", err);
    res.status(500).json({ error: "Failed to fetch market data" });
  }
}
