// One loader for everything the dashboard, the AI prompt and the daily
// check need, so the three routes cannot drift apart.
import { FUNDS, fetchFundPrices, computeSignals } from "./marketData.js";
import { fetchTspPrices } from "./tspGov.js";
import { evaluateTrendRule } from "./trendRule.js";

export const TREND_UNAVAILABLE_REASON =
  "Official tsp.gov prices are unavailable. The rule needs 201 closes of the C Fund and the proxy feed carries only 100.";

// The trend rule needs the full C Fund history. `fresh` bypasses the
// 6-hour cache so the daily check sees the close that just posted.
export async function loadTrend({ fresh = false } = {}) {
  if (process.env.TSP_DATA_SOURCE === "proxy") return { available: false, reason: TREND_UNAVAILABLE_REASON };
  const tsp = await fetchTspPrices({ fresh });
  if (!tsp || !tsp.C) return { available: false, reason: TREND_UNAVAILABLE_REASON };
  return evaluateTrendRule(tsp.C);
}

export async function loadDashboardData() {
  const [funds, trend] = await Promise.all([
    Promise.all(FUNDS.map(async (fund) => ({ ...fund, ...computeSignals(await fetchFundPrices(fund)) }))),
    loadTrend(),
  ]);
  funds.sort((a, b) => b.composite - a.composite);
  const asOf = funds[0].prices[funds[0].prices.length - 1]?.date || "unknown";
  return {
    funds,
    trend,
    asOf,
    isDemo: funds.some((f) => f.source === "demo"),
    isOfficial: funds.every((f) => f.source === "tsp"),
  };
}
