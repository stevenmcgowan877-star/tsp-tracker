export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { summary } = req.body;
  if (!summary) return res.status(400).json({ error: "Missing summary" });
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        messages: [{ role: "user", content: `You are a TSP investment advisor. Give a concise 3-4 sentence recommendation on which TSP funds to switch into, hold, or avoid based on these signals. Plain prose only.\n\n${summary}` }],
      }),
    });
    const data = await response.json();
    if (data.error) return res.status(200).json({ insight: `Error: ${data.error.message}` });
    const insight = data.content?.map(b => b.text || "").join("") || "Unable to generate insight.";
    res.status(200).json({ insight });
  } catch (err) {
    res.status(500).json({ error: "AI insight failed" });
  }
}