import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAlert, postWebhook } from "../lib/alerts.js";

const base = { available: true, n: 200, state: "ON", hold: "C", asOf: "2026-10-05", since: "2026-04-09", barsSinceFlip: 123, price: 125.447, sma: 116.18, pctVsSma: 7.98, sellTrigger: 112.69, buyTrigger: 119.67 };

test("no alert on an ordinary day", () => {
  assert.equal(buildAlert(base), null);
  assert.equal(buildAlert({ available: false }), null);
});

test("a flip on the latest bar produces an action message", () => {
  const toG = buildAlert({ ...base, state: "OFF", hold: "G", since: "2026-10-05", barsSinceFlip: 0, price: 112.0, pctVsSma: -3.6 });
  assert.equal(toG.kind, "flip");
  assert.match(toG.title, /MOVE TO G/);
  assert.match(toG.text, /100% into G before noon ET/);
  const toC = buildAlert({ ...base, since: "2026-10-05", barsSinceFlip: 0 });
  assert.match(toC.title, /MOVE TO C/);
  assert.match(toC.text, /flipped ON on 2026-10-05/);
});

test("a near-trigger warning fires only within the band and only when enabled", () => {
  const near = { ...base, price: 113.5 }; // 0.7% above the sell trigger
  assert.equal(buildAlert(near).kind, "near");
  assert.match(buildAlert(near).text, /sell trigger/);
  assert.equal(buildAlert(near, { alertOnNear: false }), null);
  assert.equal(buildAlert({ ...base, price: 120 }), null); // 6% above: quiet
  const nearBuy = { ...base, state: "OFF", hold: "G", price: 118.9 };
  assert.match(buildAlert(nearBuy).text, /buy trigger/);
});

test("a flip takes precedence over a near warning", () => {
  const both = { ...base, since: "2026-10-05", barsSinceFlip: 0, price: 113.5 };
  assert.equal(buildAlert(both).kind, "flip");
});

test("a flip one close ago still alerts (late posting), two closes ago does not", () => {
  assert.equal(buildAlert({ ...base, barsSinceFlip: 1 }).kind, "flip");
  assert.equal(buildAlert({ ...base, barsSinceFlip: 2 }), null);
  assert.equal(buildAlert({ ...base, barsSinceFlip: 1 }, { lookbackBars: 1 }), null);
});

test("postWebhook sends JSON with Slack and Discord keys and fails on non-2xx", async () => {
  const alert = buildAlert({ ...base, since: "2026-10-05", barsSinceFlip: 0 });
  let seen;
  const ok = async (url, opts) => { seen = { url, ...opts }; return { ok: true, status: 200 }; };
  const body = await postWebhook("https://hooks.example/abc", alert, base, ok);
  assert.equal(seen.method, "POST");
  assert.equal(JSON.parse(seen.body).text, body.text);
  assert.ok(body.text.startsWith("TSP trend rule: MOVE TO C"));
  assert.ok(body.content.startsWith("**TSP trend rule"));
  assert.equal(body.hold, "C");
  await assert.rejects(() => postWebhook("https://hooks.example/abc", alert, base, async () => ({ ok: false, status: 500 })), /HTTP 500/);
});

test("a flip to G with partial coverage asks for that share only", () => {
  const toG = buildAlert({ ...base, state: "OFF", hold: "G", since: "2026-10-05", barsSinceFlip: 0, price: 112.0, pctVsSma: -3.6 }, { coverage: 0.75 });
  assert.match(toG.text, /75% into G and leave 25% in C/);
  assert.match(toG.text, /contribution election/);
});

test("ntfy topics get a plain-text push with the title in a header", async () => {
  const { isNtfy } = await import("../lib/alerts.js");
  assert.equal(isNtfy("https://ntfy.sh/my-tsp-topic"), true);
  assert.equal(isNtfy("https://hooks.slack.com/services/x"), false);
  assert.equal(isNtfy("https://push.example.org/tsp", "ntfy"), true, "self-hosted via the format setting");
  assert.equal(isNtfy("not a url"), false);
  const alert = buildAlert({ ...base, state: "OFF", hold: "G", since: "2026-10-05", barsSinceFlip: 0, price: 112.0, pctVsSma: -3.6 }, { coverage: 0.75 });
  let seen;
  await postWebhook("https://ntfy.sh/my-tsp-topic", alert, base, async (url, opts) => { seen = { url, ...opts }; return { ok: true, status: 200 }; });
  assert.equal(seen.body, alert.text);
  assert.equal(seen.headers.Title, alert.title);
  assert.equal(seen.headers.Priority, "high");
  assert.ok(/^[\x20-\x7e]*$/.test(seen.headers.Title), "header values stay ASCII");
});
