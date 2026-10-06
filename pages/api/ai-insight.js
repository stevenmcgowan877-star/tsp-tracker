import Anthropic from "@anthropic-ai/sdk";
import { loadDashboardData } from "../../lib/dashboardData.js";
import { parseCoverage, DEFAULT_COVERAGE } from "../../lib/settings.js";

// The project deliberately uses Haiku for this short, frequent call.
const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You advise a federal employee on their Thrift Savings Plan (TSP) allocation using the readings supplied. The tracker has one action rule and a set of context signals:
- Action rule: hold C while it closes more than 3% above its 200-day average; move to G once it closes more than 3% below; otherwise do nothing. Replayed on official prices since 2004 it kept most of C's return with a third of the worst drawdown. Its current state is given first; your recommendation must agree with it unless the context signals show something the reader should prepare for.
- The reader chooses what share of the balance the rule moves; the rest stays in C through every flip. The readings give that share and the split it implies. Recommend exactly that split, not an all-or-nothing move, unless the share is 100%.
- Context signals: a five-signal technical score per fund (moving averages, RSI, MACD, supply/demand zone, volatility). Replayed alone they underperformed badly, so use them to describe conditions, not to override the rule.
Rules of the plan that matter:
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

export function describeTrend(trend, coverage = 1) {
  if (!trend || !trend.available) return "Action rule: unavailable (insufficient history).";
  const on = trend.state === "ON";
  const g = Math.round(coverage * 100);
  const offSplit = g >= 100 ? "100% in G" : `${g}% in G and ${100 - g}% in C`;
  return `Action rule: ${on ? "ON, hold C" : "OFF, hold G"} since ${trend.since}. The reader has the rule move ${g}% of the balance, so the advice now is ${on ? "100% in C" : offSplit}. C closed ${trend.price.toFixed(2)}, ${trend.pctVsSma > 0 ? "+" : ""}${trend.pctVsSma.toFixed(1)}% vs its ${trend.n}-day average ${trend.sma.toFixed(2)}; ` +
    (on ? `if C closes below ${trend.sellTrigger.toFixed(2)} the advice becomes ${offSplit}.` : `if C closes above ${trend.buyTrigger.toFixed(2)} the advice becomes 100% in C.`);
}

export function buildSummary(funds, { official, asOf, trend, coverage = 1 }) {
  const source = official ? "official tsp.gov share prices" : "ETF proxy prices (SPY, IWM, EFA, AGG)";
  const lines = funds.map(describeFund).join("\n");
  return `Data: ${source}, last bar ${asOf}.\n${describeTrend(trend, coverage)}\nContext signals, funds ranked by composite score:\n${lines}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(200).json({ insight: "AI analysis is not configured. Add ANTHROPIC_API_KEY to the environment to enable it." });
  }

  // The dashboard sends the reader's coverage; anything unreadable falls back
  // to the dashboard default so the advice matches what the page shows.
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const coverage = parseCoverage(body.coverage, DEFAULT_COVERAGE);

  let summary;
  let asOf;
  try {
    const data = await loadDashboardData();
    asOf = data.asOf;
    summary = buildSummary(data.funds, { official: data.isOfficial, asOf, trend: data.trend, coverage });
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
