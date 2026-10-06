import { fetchTspPrices } from "../../lib/tspGov.js";
import { evaluateTrendRule } from "../../lib/trendRule.js";
import { buildAlert, postWebhook } from "../../lib/alerts.js";

// Daily check, meant to be hit by the Vercel cron in vercel.json after TSP
// posts the day's share prices. Sends to ALERT_WEBHOOK_URL only on the day
// the rule flips (or, if ALERT_ON_NEAR_TRIGGER is "1", when the close is
// within 1.5% of a trigger). Always returns the evaluation as JSON.
//
// Auth: when CRON_SECRET is set (Vercel sets it on cron requests as a Bearer
// token), the request must carry it. ?dry=1 builds the message but does not
// send it, so you can test the wiring from a browser.
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || "";
    const provided = auth.startsWith("Bearer ") ? auth.slice(7) : req.query.secret;
    if (provided !== secret) return res.status(401).json({ error: "Unauthorized" });
  }

  const data = await fetchTspPrices();
  if (!data || !data.C) return res.status(503).json({ error: "tsp.gov prices unavailable; nothing checked" });
  const trend = evaluateTrendRule(data.C);
  const alert = buildAlert(trend, { alertOnNear: process.env.ALERT_ON_NEAR_TRIGGER === "1" });
  const dry = req.query.dry === "1";
  const webhook = process.env.ALERT_WEBHOOK_URL;

  let delivery = "none";
  if (alert && webhook && !dry) {
    try {
      await postWebhook(webhook, alert, trend);
      delivery = "sent";
    } catch (err) {
      console.error("check-trend: webhook failed", err.message);
      delivery = `failed: ${err.message}`;
    }
  } else if (alert && !webhook) {
    delivery = "no ALERT_WEBHOOK_URL configured";
  } else if (alert && dry) {
    delivery = "dry run";
  }

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ checkedAt: new Date().toISOString(), trend, alert, delivery });
}
