import Anthropic from "@anthropic-ai/sdk";
import { FUNDS, fetchFundPrices, computeSignals } from "../../lib/marketData.js";

// The project deliberately uses Haiku for this short, frequent call.
const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You advise a federal employee on their Thrift Savings Plan (TSP) allocation using the technical signals supplied. Rules of the plan that matter:
- Participants get two unrestricted interfund transfers per calendar month; after that, moves may only go into the G Fund. Mention this when recommending more than one switch.
- The G Fund never loses value and has no technical signals; treat it as the defensive option.
- C, S and I are equity funds (large cap, small/mid cap, international). F is bonds.
Write 3 to 5 sentences of plain prose: which fund(s) look strongest, which to hold or avoid, and the main risk in the current readings. Name the signals you are relying on. No headings, lists or markdown. End with one short sentence reminding the reader this is educational, not financial advice.`;

export function describeFund(f) {
  if (f.id === "G") return `G Fund (Gov't securities): ${f.current.toFixed(4)}, no technical signals by design.`;
  const ma = f.maScore > 0 ? "bullish (price > SMA20 > SMA50)" : f.maScore < 0 ? "bearish (price < SMA20 < SMA50)" : "mixed";
  const zone = f.inDemandZone ? "near 20-day low (demand zone)" : f.inSupplyZone ? "near 20-day high (supply zone)" : "mid-range";
  const vol = f.volScore > 0 ? "calming" : f.volScore < 0 ? "spiking" : "steady";
  return `${f.id} Fund (${f.desc}): signal ${f.signal}, composite ${(f.composite * 100).toFixed(0)}/100, ` +
    `price ${f.current.toFixed(2)} (${f.change}% on the day), MA stack ${ma}, RSI ${f.rsi}, ` +
    `MACD histogram ${f.macdHist > 0 ? "positive" : "negative"} (${f.macdHist}), ${zone}, ` +
    `10-day volatility ${f.volatility}% annualised and ${vol} vs 60-day.`;
}

export function buildSummary(funds, { official, asOf }) {
  const source = official ? "official tsp.gov share prices" : "ETF proxy prices (SPY, IWM, EFA, AGG)";
  const lines = funds.map(describeFund).join("\n");
  return `Data: ${source}, last bar ${asOf}. Funds ranked by composite score:\n${lines}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(200).json({ insight: "AI analysis is not configured. Add ANTHROPIC_API_KEY to the environment to enable it." });
  }

  let summary;
  let asOf;
  try {
    const funds = await Promise.all(
      FUNDS.map(async (fund) => ({ ...fund, ...computeSignals(await fetchFundPrices(fund)) }))
    );
    funds.sort((a, b) => b.composite - a.composite);
    asOf = funds[0].prices[funds[0].prices.length - 1]?.date || "unknown";
    summary = buildSummary(funds, { official: funds.every((f) => f.source === "tsp"), asOf });
  } catch (err) {
    console.error("ai-insight: could not build fund summary", err);
    return res.status(500).json({ error: "Could not load fund data" });
  }

  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: summary }],
    });
    if (response.stop_reason === "refusal") {
      return res.status(200).json({ insight: "The model declined to analyse these readings. Try again later." });
    }
    const insight = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return res.status(200).json({ insight: insight || "Unable to generate insight.", model: MODEL, asOf });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return res.status(200).json({ insight: "AI analysis is misconfigured: the ANTHROPIC_API_KEY was rejected." });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return res.status(200).json({ insight: "AI analysis is rate limited right now. Try again in a minute." });
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`ai-insight: API error ${error.status}`, error.message);
      return res.status(502).json({ error: `AI request failed (${error.status})` });
    }
    console.error("ai-insight: unexpected error", error);
    return res.status(500).json({ error: "AI insight failed" });
  }
}
