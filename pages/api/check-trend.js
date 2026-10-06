import { timingSafeEqual } from "node:crypto";
import { loadTrend } from "../../lib/dashboardData.js";
import { buildAlert, postWebhook } from "../../lib/alerts.js";
import { parseCoverage } from "../../lib/settings.js";

// Daily check, meant to be hit by the Vercel cron in vercel.json after TSP
// posts the day's share prices. Sends to ALERT_WEBHOOK_URL when the rule has
// flipped within the last two closes (or, if ALERT_ON_NEAR_TRIGGER is "1",
// when the close is within 1.5% of a trigger). Always returns the
// evaluation as JSON. Reads tsp.gov fresh, never from the dashboard cache.
//
// Auth: when CRON_SECRET is set (Vercel sends it on cron requests as a
// Bearer token), the request must carry it in the Authorization header.
// ?dry=1 builds the message but does not send it, for testing the wiring:
//   curl -H "Authorization: Bearer $CRON_SECRET" "https://.../api/check-trend?dry=1"
function authorised(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) return false;
  const provided = Buffer.from(auth.slice(7));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  if (!authorised(req)) return res.status(401).json({ error: "Unauthorized" });

  const trend = await loadTrend({ fresh: true });
  if (!trend.available) return res.status(503).json({ error: trend.reason });

  const alert = buildAlert(trend, {
    alertOnNear: process.env.ALERT_ON_NEAR_TRIGGER === "1",
    // Same default as the dashboard (75%); "0.5", "50" and "50%" all work.
    coverage: parseCoverage(process.env.RULE_COVERAGE),
  });
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
