// Builds the alert message for a trend-rule evaluation. Stateless: a flip is
// detected when the rule's state began on the latest bar, so a once-a-day
// check after prices post alerts exactly once per flip.

export const NEAR_TRIGGER_PCT = 1.5;

export function buildAlert(trend, { nearPct = NEAR_TRIGGER_PCT, alertOnNear = true } = {}) {
  if (!trend || !trend.available) return null;
  const on = trend.state === "ON";
  const flippedToday = trend.since === trend.asOf;
  const trigger = on ? trend.sellTrigger : trend.buyTrigger;
  const distancePct = Math.abs((trend.price - trigger) / trend.price) * 100;
  const near = distancePct <= nearPct;

  if (flippedToday) {
    return {
      kind: "flip",
      title: on ? "TSP trend rule: MOVE TO C" : "TSP trend rule: MOVE TO G",
      text: on
        ? `The C Fund closed at $${trend.price.toFixed(2)} on ${trend.asOf}, ${trend.pctVsSma.toFixed(1)}% above its ${trend.n}-day average. The rule flipped ON: request an interfund transfer of 100% into C before noon ET on the next business day.`
        : `The C Fund closed at $${trend.price.toFixed(2)} on ${trend.asOf}, ${Math.abs(trend.pctVsSma).toFixed(1)}% below its ${trend.n}-day average. The rule flipped OFF: request an interfund transfer of 100% into G before noon ET on the next business day.`,
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

// Posts a message to a generic webhook. The body carries the same text under
// the keys Slack ("text"), Discord ("content") and most automation tools
// accept, plus the structured fields.
export async function postWebhook(url, alert, trend, fetchImpl = fetch) {
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
