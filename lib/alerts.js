// Builds the alert message for a trend-rule evaluation. Stateless: a flip is
// reported while the rule's state began within the last `lookbackBars`
// closes (default 2), so a once-a-day check still catches a flip whose price
// posted late, at the cost of a possible repeat the following day. A rule
// that flips about once a year makes a repeat far cheaper than a miss.

export const NEAR_TRIGGER_PCT = 1.5;
export const FLIP_LOOKBACK_BARS = 2;

export function buildAlert(trend, { nearPct = NEAR_TRIGGER_PCT, alertOnNear = true, lookbackBars = FLIP_LOOKBACK_BARS, coverage = 1 } = {}) {
  const raw = Number(coverage);
  const share = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 1;
  const gPct = `${Math.round(share * 100)}%`;
  const cRest = share < 1 ? ` and leave ${Math.round((1 - share) * 100)}% in C` : "";
  if (!trend || !trend.available) return null;
  const on = trend.state === "ON";
  const bars = typeof trend.barsSinceFlip === "number" ? trend.barsSinceFlip : (trend.since === trend.asOf ? 0 : Infinity);
  const flippedToday = bars < lookbackBars;
  const trigger = on ? trend.sellTrigger : trend.buyTrigger;
  const distancePct = Math.abs((trend.price - trigger) / trend.price) * 100;
  const near = distancePct <= nearPct;

  if (flippedToday) {
    return {
      kind: "flip",
      title: on ? "TSP trend rule: MOVE TO C" : "TSP trend rule: MOVE TO G",
      text: on
        ? `The C Fund closed at $${trend.price.toFixed(2)} on ${trend.asOf}, ${trend.pctVsSma.toFixed(1)}% above its ${trend.n}-day average. The rule flipped ON on ${trend.since}: request an interfund transfer of 100% into C before noon ET on the next business day if you have not already. Your contribution election for new money is unlimited and can point at C too.`
        : `The C Fund closed at $${trend.price.toFixed(2)} on ${trend.asOf}, ${Math.abs(trend.pctVsSma).toFixed(1)}% below its ${trend.n}-day average. The rule flipped OFF on ${trend.since}: request an interfund transfer of ${gPct} into G${cRest} before noon ET on the next business day if you have not already. Your contribution election for new money is unlimited and can point at G too.`,
    };
  }
  if (alertOnNear && near) {
    return {
      kind: "near",
      title: on ? "TSP trend rule: close to the sell trigger" : "TSP trend rule: close to the buy trigger",
      text: on
        ? `The C Fund closed at $${trend.price.toFixed(2)} on ${trend.asOf}, only ${distancePct.toFixed(1)}% above the sell trigger of $${trigger.toFixed(2)}. No action yet; watch tomorrow's close.`
        : `The C Fund closed at $${trend.price.toFixed(2)} on ${trend.asOf}, only ${distancePct.toFixed(1)}% below the buy trigger of $${trigger.toFixed(2)}. No action yet; watch tomorrow's close.`,
    };
  }
  return null;
}

// ntfy (https://ntfy.sh, free phone push notifications with no account)
// takes the message as a plain-text body with the title in a header. Used
// for any ntfy.sh topic URL, or any URL when `format` is "ntfy" (self-hosted).
export function isNtfy(url, format) {
  if (format === "ntfy") return true;
  if (format && format !== "auto") return false;
  try { return new URL(url).hostname === "ntfy.sh"; } catch { return false; }
}

// Posts a message to a generic webhook. The body carries the same text under
// the keys Slack ("text"), Discord ("content") and most automation tools
// accept, plus the structured fields. ntfy topics get plain text instead.
export async function postWebhook(url, alert, trend, fetchImpl = fetch, { format } = {}) {
  if (isNtfy(url, format)) {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        Title: alert.title,
        Priority: alert.kind === "flip" ? "high" : "default",
        Tags: alert.kind === "flip" ? "rotating_light" : "eyes",
      },
      body: alert.text,
    });
    if (!res.ok) throw new Error(`Webhook returned HTTP ${res.status}`);
    return { title: alert.title, message: alert.text, kind: alert.kind };
  }
  const body = {
    text: `${alert.title}\n${alert.text}`,
    content: `**${alert.title}**\n${alert.text}`,
    title: alert.title,
    message: alert.text,
    kind: alert.kind,
    state: trend.state,
    hold: trend.hold,
    asOf: trend.asOf,
    price: trend.price,
    sma: trend.sma,
    sellTrigger: trend.sellTrigger,
    buyTrigger: trend.buyTrigger,
  };
  const res = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Webhook returned HTTP ${res.status}`);
  return body;
}
