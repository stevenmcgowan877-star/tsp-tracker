export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { summary } = req.body;
  if (!summary) return res.status(400).json({ error: "Missing summary" });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `You are a TSP (Thrift Savings Plan) investment advisor. Based on these technical indicator signals, give a concise 3-4 sentence actionable recommendation about how to allocate or switch TSP funds. Be specific about which funds to favor, hold, or avoid. Write in plain prose — no markdown, no bullets.\n\n${summary}`,
        }],
      }),
    });

    const data = await response.json();
    const insight = data.content?.map(b => b.text || "").join("") || "Unable to generate insight.";
    res.status(200).json({ insight });
  } catch (err) {
    console.error("AI insight error:", err);
    res.status(500).json({ error: "AI insight failed" });
  }
}
