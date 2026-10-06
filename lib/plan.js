// Retirement planner: a range of outcomes for a TSP balance through the
// working years and into retirement, under the trend rule (on a chosen share
// of the balance), holding C, and holding G.
//
// Futures are block-bootstrapped from the real daily returns of the C and G
// Funds, sampled jointly so their relationship survives. Block length is a
// choice: short blocks scramble multi-year trends (which works against a
// trend rule), long blocks reuse more of the actual history. The rule runs on
// each future seeded with its real current state.
//
// Working years: contributions arrive 26 times a year. With a salary, the
// employee deposit is a percentage of pay capped by the annual elective
// limit plus any catch-up for the participant's age; the agency adds the
// FERS automatic 1% and matches the first 5% (100% of 3%, 50% of the next
// 2%) only in pay periods with an employee deposit, so hitting the limit
// early forfeits match. Without a salary, a flat per-period amount is used.
//
// Retirement: an initial withdrawal rate of the balance at retirement, raised
// 2.5% a year, taken monthly and at least the required minimum distribution
// (age 73, or 75 if born 1960 or later, IRS Uniform Lifetime Table). TSP pays
// withdrawals pro rata from every fund held, so the rule's sleeve and the C
// sleeve are drawn down in proportion. Limits are held at 2026 values and
// salary is flat, in nominal dollars; this is a range, not a forecast.

import { nextTrendState, trendStateAt, TREND_N, TREND_BAND } from "./trendRule.js";

export const PATHS = 300;
export const TRADING_DAYS = 252;
export const PAYS_PER_YEAR = 26;
export const PAY_PERIOD = 10; // trading days between flat contributions (legacy mode)
export const BLOCK_OPTIONS = [60, 250, 750];
export const DEFAULT_BLOCK = 250;
export const LIMITS_2026 = { elective: 24500, catchUp50: 8000, catchUp60to63: 11250 };
export const WITHDRAWAL_RAISE = 0.025;
const PERCENTILES = [0.1, 0.25, 0.5, 0.75, 0.9];

// IRS Uniform Lifetime Table (effective 2022): distribution period by age.
const ULT = { 72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9, 96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4 };
export function rmdDivisor(age) {
  if (age < 72) return null;
  return ULT[Math.min(100, age)];
}
export function rmdStartAge(birthYear) {
  return birthYear >= 1960 ? 75 : 73;
}

// Elective-deferral room for a year at a given age (catch-up included).
export function electiveLimit(age, limits = LIMITS_2026) {
  if (age >= 60 && age <= 63) return limits.elective + limits.catchUp60to63;
  if (age >= 50) return limits.elective + limits.catchUp50;
  return limits.elective;
}

// FERS agency contribution as a share of the period's pay, given the share of
// pay the employee actually deposited that period.
export function agencyRate(employeeRate) {
  const r = Math.max(0, employeeRate);
  return 0.01 + Math.min(r, 0.03) + 0.5 * Math.min(Math.max(r - 0.03, 0), 0.02);
}

// One working year of pay-period deposits (deterministic; no market input).
export function yearContributions({ salary, pct, age }) {
  const perPay = salary / PAYS_PER_YEAR;
  let room = electiveLimit(age);
  const out = [];
  for (let k = 0; k < PAYS_PER_YEAR; k++) {
    const employee = Math.min(perPay * pct, room);
    room -= employee;
    const agency = perPay * agencyRate(perPay > 0 ? employee / perPay : 0);
    out.push({ employee, agency });
  }
  return out;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function dailyReturns(prices) {
  const out = new Float64Array(prices.length - 1);
  for (let i = 1; i < prices.length; i++) out[i - 1] = prices[i].close / prices[i - 1].close - 1;
  return out;
}

// Block start indices for each path. Only the indices are kept; returns are
// read from the history on the fly, so long horizons cost no memory.
export function sampleBlockStarts(n, days, { paths = PATHS, block = DEFAULT_BLOCK, seed = 7 } = {}) {
  const rand = rng(seed + block);
  const out = [];
  const blocks = Math.ceil(days / block);
  for (let k = 0; k < paths; k++) {
    const starts = new Int32Array(blocks);
    for (let b = 0; b < blocks; b++) starts[b] = Math.floor(rand() * Math.max(1, n - block));
    out.push(starts);
  }
  return out;
}

function percentiles(values) {
  const s = Float64Array.from(values).sort();
  const pick = (p) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
  const out = {};
  for (const p of PERCENTILES) out[`p${Math.round(p * 100)}`] = pick(p);
  return out;
}

// Pay days within a 252-day year: 26 evenly spaced trading days.
const PAY_DAYS = new Set(Array.from({ length: PAYS_PER_YEAR }, (_, k) => Math.floor(((k + 1) * TRADING_DAYS) / PAYS_PER_YEAR) - 1));

export function runPlan(series, opts) {
  const {
    balance, years, contribution = 0, salary = 0, pct = 0, age = null,
    retireYears = 0, withdrawalRate = 0.04, coverage = 1, block = DEFAULT_BLOCK, paths: nPaths = PATHS,
  } = opts;
  if (!(balance >= 0) || !(contribution >= 0) || !(years >= 1 && years <= 40)) throw new Error("balance, contribution and years (1-40) are required");
  if (!(retireYears >= 0 && retireYears <= 40)) throw new Error("retireYears must be 0-40");
  const cov = Math.max(0, Math.min(1, Number(coverage)));
  const blockLen = BLOCK_OPTIONS.includes(block) ? block : DEFAULT_BLOCK;
  const useSalary = salary > 0;
  const startAge = Number.isFinite(age) && age > 0 ? Math.round(age) : null;
  const birthYear = startAge ? 2026 - startAge : null;
  const rmdAge = birthYear ? rmdStartAge(birthYear) : null;

  const rc = dailyReturns(series.C);
  const rg = dailyReturns(series.G);
  const n = Math.min(rc.length, rg.length);
  const workDays = years * TRADING_DAYS;
  const totalDays = (years + retireYears) * TRADING_DAYS;
  const starts = sampleBlockStarts(n, totalDays, { paths: nPaths, block: blockLen });

  const closes = series.C.map((p) => p.close);
  const warm = closes.slice(-TREND_N);
  const startState = trendStateAt(closes, closes.length - 1);

  // Deterministic contribution schedule per working year.
  const schedule = [];
  let employeeTotal = 0, agencyTotal = 0;
  for (let y = 0; y < years; y++) {
    if (useSalary) {
      const yr = yearContributions({ salary, pct, age: startAge ? startAge + y : 40 });
      schedule.push(yr);
      for (const c of yr) { employeeTotal += c.employee; agencyTotal += c.agency; }
    } else {
      schedule.push(null);
      employeeTotal += contribution * Math.floor(TRADING_DAYS / PAY_PERIOD);
    }
  }

  const strategies = ["trend", "C", "G"];
  const acc = {};
  for (const s of strategies) acc[s] = { retire: [], final: [], worst: [], depleted: 0, yearly: Array.from({ length: years + retireYears + 1 }, () => []) };
  let ruleBeats = 0, ruleWithin = 0;

  for (let k = 0; k < starts.length; k++) {
    const st = starts[k];
    // Per-strategy state. Rule strategy: a rule sleeve (holds per the rule)
    // and a C sleeve (the uncovered share). C and G: one sleeve each.
    const S = {
      trend: { rule: balance * cov, c: balance * (1 - cov), index: 1, peak: 1, worst: 0, depleted: false, w0: 0 },
      C: { rule: 0, c: balance, index: 1, peak: 1, worst: 0, depleted: false, w0: 0 },
      G: { rule: balance, c: 0, index: 1, peak: 1, worst: 0, depleted: false, w0: 0 },
    };
    for (const s of strategies) acc[s].yearly[0].push(balance);

    // Trend state on this path.
    const ring = Float64Array.from(warm);
    let ringIdx = 0, sum = 0;
    for (const v of ring) sum += v;
    let price = warm[warm.length - 1];
    let state = startState;
    let held = state === "ON" ? "C" : "G";
    let pending = null;
    let annualWithdrawal = { trend: 0, C: 0, G: 0 };

    for (let t = 0; t < totalDays; t++) {
      const idx = st[Math.floor(t / blockLen)] + (t % blockLen);
      const rC = rc[idx], rG = rg[idx];

      // Market move.
      for (const s of strategies) {
        const x = S[s];
        if (x.depleted) continue;
        const before = x.rule + x.c;
        const ruleR = s === "trend" ? (held === "C" ? rC : rG) : s === "C" ? rC : rG;
        x.rule *= 1 + ruleR;
        x.c *= 1 + rC;
        const after = x.rule + x.c;
        if (before > 0) {
          x.index *= after / before;
          if (x.index > x.peak) x.peak = x.index;
          const dd = x.index / x.peak - 1;
          if (dd < x.worst) x.worst = dd;
        }
      }

      // Rule bookkeeping on the synthetic C price.
      if (pending) { held = pending; pending = null; }
      price *= 1 + rC;
      sum += price - ring[ringIdx];
      ring[ringIdx] = price;
      ringIdx = (ringIdx + 1) % ring.length;
      const next = nextTrendState(state, price, sum / ring.length, TREND_BAND);
      if (next !== state) { state = next; pending = next === "ON" ? "C" : "G"; }

      const year = Math.floor(t / TRADING_DAYS);
      const dayOfYear = t % TRADING_DAYS;

      if (t < workDays) {
        // Contributions: split by coverage for the rule strategy.
        let amount = 0;
        if (useSalary) {
          if (PAY_DAYS.has(dayOfYear)) {
            const k2 = [...PAY_DAYS].indexOf(dayOfYear);
            const c = schedule[year][k2];
            amount = c.employee + c.agency;
          }
        } else if ((t + 1) % PAY_PERIOD === 0) {
          amount = contribution;
        }
        if (amount > 0) {
          S.trend.rule += amount * cov; S.trend.c += amount * (1 - cov);
          S.C.c += amount;
          S.G.rule += amount;
        }
      } else if (retireYears > 0) {
        // Withdrawals: set each retirement year on its first day.
        const retYear = year - years;
        if (dayOfYear === 0) {
          for (const s of strategies) {
            const x = S[s];
            if (x.depleted) continue;
            const bal = x.rule + x.c;
            if (retYear === 0) x.w0 = bal * withdrawalRate;
            let planned = x.w0 * Math.pow(1 + WITHDRAWAL_RAISE, retYear);
            const ageNow = startAge ? startAge + year : null;
            if (rmdAge && ageNow >= rmdAge) {
              const d = rmdDivisor(ageNow);
              if (d) planned = Math.max(planned, bal / d);
            }
            annualWithdrawal[s] = planned;
          }
        }
        // Monthly: 12 withdrawals spread over the year.
        if (dayOfYear % 21 === 20) {
          for (const s of strategies) {
            const x = S[s];
            if (x.depleted) continue;
            const bal = x.rule + x.c;
            const w = annualWithdrawal[s] / 12;
            if (bal <= w) { x.rule = 0; x.c = 0; x.depleted = true; continue; }
            const f = 1 - w / bal; // pro rata from every fund held
            x.rule *= f; x.c *= f;
          }
        }
      }

      if (dayOfYear === TRADING_DAYS - 1) {
        for (const s of strategies) acc[s].yearly[year + 1].push(S[s].rule + S[s].c);
        if (year + 1 === years) for (const s of strategies) acc[s].retire.push(S[s].rule + S[s].c);
      }
    }

    for (const s of strategies) {
      acc[s].final.push(S[s].rule + S[s].c);
      acc[s].worst.push(S[s].worst);
      if (S[s].depleted) acc[s].depleted++;
    }
    const ft = S.trend.rule + S.trend.c, fc = S.C.rule + S.C.c;
    if (ft >= fc) ruleBeats++;
    if (ft >= 0.8 * fc) ruleWithin++;
  }

  const result = {
    balance, years, retireYears, contribution, salary, pct, age: startAge, withdrawalRate,
    coverage: cov, block: blockLen, paths: starts.length, startState,
    contributed: employeeTotal + agencyTotal, employeeTotal, agencyTotal,
    rmdAge, strategies: {},
  };
  for (const s of strategies) {
    result.strategies[s] = {
      retire: percentiles(acc[s].retire),
      final: percentiles(acc[s].final),
      worstDrawdown: percentiles(acc[s].worst),
      depletedShare: acc[s].depleted / starts.length,
      yearly: acc[s].yearly.map((vals, y) => ({ year: y, ...percentiles(vals) })),
    };
  }
  result.ruleBeatsC = ruleBeats / starts.length;
  result.ruleWithin20pctOfC = ruleWithin / starts.length;
  return result;
}
