import { test } from "node:test";
import assert from "node:assert/strict";
import { totalBalance, allocation, assessHoldings, processingDate, transfersThisMonth } from "../lib/holdings.js";

const on = { available: true, state: "ON", price: 125.447, sellTrigger: 112.69, buyTrigger: 119.67 };
const off = { ...on, state: "OFF" };
const backtest = { years: 22.5, strategies: { trend: { maxDrawdown: -0.194, cagr: 0.103 } }, benchmarks: { C: { maxDrawdown: -0.552, cagr: 0.112 } } };

test("totals and allocation tolerate blanks and strings", () => {
  assert.equal(totalBalance({ C: "1000", G: "", S: undefined }), 1000);
  const a = allocation({ C: "750", G: "250" });
  assert.equal(a.C, 0.75);
  assert.equal(a.G, 0.25);
  assert.equal(allocation({}).C, 0);
});

test("empty balances produce an empty assessment", () => {
  assert.equal(assessHoldings({}, on, backtest).empty, true);
});

test("fully in C while the rule is ON is aligned, with a dollar cushion", () => {
  const r = assessHoldings({ C: "100000" }, on, backtest);
  assert.equal(r.aligned, true);
  assert.match(r.message, /100% in C/);
  const expectedPct = (125.447 - 112.69) / 125.447;
  assert.ok(Math.abs(r.cushionPct - expectedPct) < 1e-12);
  assert.ok(Math.abs(r.cushionDollars - 100000 * expectedPct) < 1e-6);
  assert.ok(Math.abs(r.worstCase.rule + 19400) < 1e-6);
  assert.ok(Math.abs(r.worstCase.holdC + 55200) < 1e-6);
});

test("sitting in G while the rule is ON is flagged", () => {
  const r = assessHoldings({ C: "20000", G: "80000" }, on, backtest);
  assert.equal(r.aligned, false);
  assert.match(r.message, /20% in C and 80% in G/);
});

test("equities outside C are called out when the rule is ON", () => {
  const r = assessHoldings({ C: "50000", S: "50000" }, on, backtest);
  assert.equal(r.aligned, false);
  assert.match(r.message, /100% in equities but only 50% in C/);
});

test("rule OFF wants G and reports no cushion", () => {
  const safe = assessHoldings({ G: "100000" }, off, backtest, 1);
  assert.equal(safe.aligned, true);
  assert.equal(safe.cushionDollars, null);
  const exposed = assessHoldings({ C: "60000", G: "40000" }, off, backtest, 1);
  assert.equal(exposed.aligned, false);
  assert.match(exposed.message, /100% in G; you hold 40% in G and 60% in C/);
});

test("at 75% coverage OFF needs both the G and the C share on target", () => {
  assert.equal(assessHoldings({ G: "75000", C: "25000" }, off, backtest, 0.75).aligned, true);
  const inS = assessHoldings({ G: "75000", S: "25000" }, off, backtest, 0.75);
  assert.equal(inS.aligned, false, "the uncovered share belongs in C, not S");
  assert.match(inS.message, /plus 25% in other funds/);
});

test("an unavailable rule yields no alignment verdict", () => {
  const r = assessHoldings({ C: "1" }, { available: false }, null);
  assert.equal(r.aligned, null);
  assert.equal(r.worstCase, undefined);
});

test("an L Fund bucket is called out rather than counted as C or G", () => {
  const r = assessHoldings({ L: "90000", C: "10000" }, on, backtest);
  assert.equal(r.aligned, false);
  assert.match(r.message, /90% in an L Fund/);
  assert.equal(r.lShare, 0.9);
  const offSide = assessHoldings({ L: "100000" }, off, backtest);
  assert.match(offSide.message, /keeps part of your money in equities/);
});

test("rule OFF with partial coverage wants the G share, not everything", () => {
  const r = assessHoldings({ C: "25000", G: "75000" }, off, backtest, 0.75);
  assert.equal(r.aligned, true);
  assert.deepEqual(r.target, { C: 0.25, G: 0.75 });
  const wrong = assessHoldings({ C: "100000" }, off, backtest, 0.75);
  assert.equal(wrong.aligned, false);
  assert.match(wrong.message, /75% in G and 25% in C/);
});

test("a transfer requested before noon ET counts that day; after noon or at the weekend it rolls forward", () => {
  // 2026-07-31 is a Friday. 11:00 ET = 15:00 UTC (EDT).
  assert.equal(processingDate(new Date("2026-07-31T15:00:00Z")), "2026-07-31");
  // 12:15 ET on July 31 counts against August (TSP Bulletin 08-4's own example).
  assert.equal(processingDate(new Date("2026-07-31T16:15:00Z")), "2026-08-03");
  // Saturday rolls to Monday.
  assert.equal(processingDate(new Date("2026-08-01T14:00:00Z")), "2026-08-03");
});

test("the monthly budget counts transfers by processing month", () => {
  const now = new Date("2026-08-10T14:00:00Z");
  const b = transfersThisMonth(["2026-07-31", "2026-08-03", "2026-08-05"], now);
  assert.equal(b.month, "2026-08");
  assert.equal(b.used, 2);
  assert.equal(b.remaining, 0);
  assert.equal(transfersThisMonth([], now).remaining, 2);
});
