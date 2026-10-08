// Pure calculations for the holdings panel. Balances are the reader's own
// numbers (kept in their browser); everything here is arithmetic on them.

export const HOLDING_FUNDS = ["C", "S", "I", "F", "G", "L"];
export const HOLDINGS_STORAGE_KEY = "tsp-tracker:holdings";
import { targetAllocation, DEFAULT_COVERAGE } from "./settings.js";

// Balances saved by the holdings panel in this browser, or null. Safe to
// call anywhere; returns null during server rendering or if storage is blocked.
export function readStoredHoldings() {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(HOLDINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function totalBalance(balances) {
  return HOLDING_FUNDS.reduce((sum, id) => sum + (Number(balances[id]) || 0), 0);
}

export function allocation(balances) {
  const total = totalBalance(balances);
  const out = {};
  for (const id of HOLDING_FUNDS) out[id] = total > 0 ? (Number(balances[id]) || 0) / total : 0;
  return out;
}

// How the reader's money lines up with the rule, in words and numbers.
// `coverage` is the share of the balance the rule governs; the rest stays in C.
export function assessHoldings(balances, trend, backtest, coverage = DEFAULT_COVERAGE) {
  const total = totalBalance(balances);
  if (total <= 0) return { empty: true, total };
  const alloc = allocation(balances);
  const inC = alloc.C;
  const inG = alloc.G;
  const inL = alloc.L;
  const equityShare = alloc.C + alloc.S + alloc.I;
  const result = { empty: false, total, alloc, equityShare, lShare: inL };

  if (!trend || !trend.available) return { ...result, aligned: null, message: "The rule cannot be evaluated right now." };

  const on = trend.state === "ON";
  if (on) {
    result.aligned = inC >= 0.9;
    result.message = result.aligned
      ? `Positioned with the rule: ${pct(inC)} in C.`
      : inL >= 0.5
        ? `The rule says be in C; you hold ${pct(inL)} in an L Fund, a fixed mix the rule does not manage. See how your L Fund compares on the L Funds page.`
        : equityShare >= 0.9
          ? `The rule says be in C; you hold ${pct(equityShare)} in equities but only ${pct(inC)} in C. The replay was run on C alone.`
          : `The rule says be in C; you hold ${pct(inC)} in C and ${pct(inG)} in G.`;
    const cushionPct = Math.max(0, (trend.price - trend.sellTrigger) / trend.price);
    result.cushionDollars = Number(balances.C || 0) * cushionPct;
    result.cushionPct = cushionPct;
  } else {
    const target = targetAllocation("OFF", coverage);
    result.target = target;
    // Within 10 points of both the target G and the target C share counts
    // as positioned; money in S, I, F or L is off target.
    result.aligned = Math.abs(inG - target.G) <= 0.1 && Math.abs(inC - target.C) <= 0.1;
    const want = target.C > 0 ? `${pct(target.G)} in G and ${pct(target.C)} in C` : `${pct(target.G)} in G`;
    const other = 1 - inG - inC;
    const held = `you hold ${pct(inG)} in G and ${pct(inC)} in C${other >= 0.05 ? `, plus ${pct(other)} in other funds` : ""}`;
    result.message = result.aligned
      ? `Positioned with the rule: ${pct(inG)} in G and ${pct(inC)} in C (target ${want}).`
      : inL >= 0.5
        ? `The rule says ${want}; you hold ${pct(inL)} in an L Fund, which keeps part of your money in equities whatever the trend.`
        : `The rule says ${want}; ${held}.`;
    result.cushionDollars = null;
    result.cushionPct = null;
  }

  if (backtest) {
    // Prefer the hybrid at the reader's coverage when the summary carries it.
    const t = backtest.strategies?.hybrid && Math.abs((backtest.coverage ?? 1) - coverage) < 1e-9 ? backtest.strategies.hybrid : backtest.strategies?.trend;
    const c = backtest.benchmarks?.C;
    if (t && c) {
      result.worstCase = {
        rule: total * t.maxDrawdown,
        holdC: total * c.maxDrawdown,
        ruleCagr: t.cagr,
        holdCagr: c.cagr,
        years: backtest.years,
      };
    }
  }
  return result;
}

function pct(x) {
  return `${Math.round(x * 100)}%`;
}

// ---- Interfund transfer log -------------------------------------------
// The reader records the transfers they make; the TSP allows two
// unrestricted ones per calendar month, after which only moves into G are
// allowed. A request after noon ET, or on a weekend or holiday, is processed
// (and counted) on the next business day, which can fall in the next month.

export const TRANSFERS_STORAGE_KEY = "tsp-tracker:transfers";
export const MONTHLY_TRANSFER_LIMIT = 2;

export function readTransfers() {
  try {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(TRANSFERS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
  } catch {
    return [];
  }
}

export function writeTransfers(list) {
  try { window.localStorage.setItem(TRANSFERS_STORAGE_KEY, JSON.stringify(list.slice(-24))); } catch { /* ignore */ }
}

// Processing date (YYYY-MM-DD, Eastern) for a request made at `now`.
// Weekends roll to Monday; after 12:00 ET rolls to the next business day.
// Federal holidays are not modelled.
export function processingDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  let d = new Date(Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day"))));
  const hour = Number(get("hour")) % 24;
  const dow = () => d.getUTCDay();
  const next = () => { d = new Date(d.getTime() + 86400000); };
  if (dow() === 0 || dow() === 6 || hour >= 12) {
    next();
    while (dow() === 0 || dow() === 6) next();
  }
  return d.toISOString().slice(0, 10);
}

export function transfersThisMonth(list, now = new Date()) {
  const month = processingDate(now).slice(0, 7);
  const used = list.filter((d) => d.slice(0, 7) === month).length;
  return { month, used, remaining: Math.max(0, MONTHLY_TRANSFER_LIMIT - used) };
}

// ---- Transfer ticket ----------------------------------------------------
// What to type into tsp.gov to follow the rule from the reader's balances.
// An interfund transfer on tsp.gov sets whole-number percentages of the
// entire balance, totalling 100%, across every fund. Returns null when the
// rule is unavailable or no balances are entered, { needed: false } when the
// balances already match the advice, otherwise the percentages, the dollar
// change per fund, and whether this month's transfer budget allows it.
// `budget` is the result of transfersThisMonth (optional).
export function transferTicket(balances, trend, coverage = DEFAULT_COVERAGE, budget = null) {
  if (!trend || !trend.available) return null;
  const total = totalBalance(balances);
  if (total <= 0) return null;
  if (assessHoldings(balances, trend, null, coverage).aligned) return { needed: false };
  const target = targetAllocation(trend.state, coverage);
  const alloc = allocation(balances);
  const currentC = Math.floor(alloc.C * 100 + 1e-9);
  // Whole-number C share. If rounding the target would top C up by under a
  // point, keep C at its current whole share instead, so the move stays a
  // move into G (which the TSP allows after both transfers are used).
  let cPct = Math.round(target.C * 100);
  if (cPct > alloc.C * 100 && cPct - alloc.C * 100 < 1) cPct = currentC;
  const build = (c) => {
    const percents = {};
    for (const id of HOLDING_FUNDS) percents[id] = 0;
    percents.C = c;
    percents.G = 100 - c;
    const changes = HOLDING_FUNDS
      .map((id) => ({ fund: id, change: (percents[id] / 100) * total - alloc[id] * total }))
      .filter((m) => Math.abs(m.change) >= 1)
      .sort((a, b) => b.change - a.change);
    // Every fund except G ends at or below its current share.
    const intoGOnly = HOLDING_FUNDS.every((id) => id === "G" || percents[id] / 100 <= alloc[id] + 1e-9);
    return { percents, changes, intoGOnly };
  };
  let ticket = build(cPct);
  let partial = false;
  const exhausted = Boolean(budget && budget.remaining === 0);
  // Both transfers used and the full move would add to C: when the rule is
  // OFF, the G part can still go now (C held at its current share) and C
  // topped up next month.
  if (exhausted && !ticket.intoGOnly && trend.state === "OFF") {
    const fallback = build(Math.min(cPct, currentC));
    if (fallback.changes.some((m) => m.fund === "G" && m.change > 0)) { ticket = fallback; partial = true; }
  }
  const { percents, changes, intoGOnly } = ticket;
  const blocked = exhausted && !intoGOnly;
  return { needed: true, state: trend.state, percents, changes, intoGOnly, blocked, partial, targetC: Math.round(target.C * 100), total };
}
