// Retirement planner: a range of outcomes for a TSP balance through the
// working years and into retirement, under the trend rule (on a chosen share
// of the balance), holding C, and holding G.
//
// Futures are block-bootstrapped from the real daily returns of the C and G
// Funds, sampled jointly so their relationship survives. Block length is a
// choice: short blocks scramble multi-year trends (which works against a
// trend rule), long blocks reuse more of the actual history. The rule runs on
// each future seeded with its real current state and does exactly what the
// dashboard advises: all in C while ON; at each turn OFF the chosen share of
// the whole balance moves to G; at each turn ON everything returns to C. New
// contributions follow the same split. It obeys the TSP limit of two
// transfers a month (21 trading days here); moves into G are always allowed.
//
// Working years: contributions arrive 26 times a year. With a salary, the
// employee deposit is a percentage of pay capped by the annual elective
// limit plus any catch-up for the participant's age; the agency adds the
// FERS automatic 1% and matches the first 5% (100% of 3%, 50% of the next
// 2%) only in pay periods with an employee deposit, so hitting the limit
// early forfeits match. Without a salary, a flat amount arrives every 10
// trading days.
//
// Retirement: an initial withdrawal rate of the balance at retirement, raised
// 2.5% a year, taken monthly and at least the required minimum distribution
// (age 73, or 75 if born 1960 or later, IRS Uniform Lifetime Table). TSP pays
// withdrawals pro rata from every fund held, so C and G are drawn down in
// proportion. Limits are held at 2026 values and
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
// PAY_INDEX[dayOfYear] is the pay period number on a pay day, else -1.
const PAY_INDEX = new Int16Array(TRADING_DAYS).fill(-1);
for (let k = 0; k < PAYS_PER_YEAR; k++) PAY_INDEX[Math.floor(((k + 1) * TRADING_DAYS) / PAYS_PER_YEAR) - 1] = k;
// A simulated month is 21 trading days (12 per simulated year).
const MONTH_DAYS = TRADING_DAYS / 12;
const IFT_LIMIT = 2;

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
    }
  }
  // Flat mode deposits every PAY_PERIOD trading days across the working years.
  if (!useSalary) employeeTotal = contribution * Math.floor(workDays / PAY_PERIOD);

  const strategies = ["trend", "C", "G"];
  const acc = {};
  for (const s of strategies) acc[s] = { retire: [], final: [], worst: [], depleted: 0, yearly: Array.from({ length: years + retireYears + 1 }, () => []) };
  let ruleBeats = 0, ruleWithin = 0;

  for (let k = 0; k < starts.length; k++) {
    const st = starts[k];
    // Per-strategy C and G balances. The rule strategy follows the
    // dashboard's advice exactly: all in C while ON; at each turn OFF,
    // `cov` of the whole balance moves to G and the rest stays in C; at each
    // turn ON, everything moves back to C. The split drifts between flips.
    const fresh = (c, g) => ({ c, g, index: 1, peak: 1, worst: 0, depleted: false, w0: 0 });
    const S = {
      trend: startState === "ON" ? fresh(balance, 0) : fresh(balance * (1 - cov), balance * cov),
      C: fresh(balance, 0),
      G: fresh(0, balance),
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
    const usedByMonth = new Map();
    let annualWithdrawal = { trend: 0, C: 0, G: 0 };

    for (let t = 0; t < totalDays; t++) {
      const idx = st[Math.floor(t / blockLen)] + (t % blockLen);
      const rC = rc[idx], rG = rg[idx];

      // Market move.
      for (const s of strategies) {
        const x = S[s];
        if (x.depleted) continue;
        const before = x.c + x.g;
        x.c *= 1 + rC;
        x.g *= 1 + rG;
        const after = x.c + x.g;
        if (before > 0) {
          x.index *= after / before;
          if (x.index > x.peak) x.peak = x.index;
          const dd = x.index / x.peak - 1;
          if (dd < x.worst) x.worst = dd;
        }
      }

      // The transfer requested yesterday settles at today's close.
      if (pending) {
        held = pending; pending = null;
        const x = S.trend;
        if (!x.depleted) {
          const total = x.c + x.g;
          if (held === "C") { x.c = total; x.g = 0; } else { x.c = total * (1 - cov); x.g = total * cov; }
        }
      }
      // Rule bookkeeping on the synthetic C price. Same limit as the
      // backtest: two transfers a month, counted in the month the transfer
      // settles; moves into G are always allowed, a move back to C waits.
      price *= 1 + rC;
      sum += price - ring[ringIdx];
      ring[ringIdx] = price;
      ringIdx = (ringIdx + 1) % ring.length;
      const next = nextTrendState(state, price, sum / ring.length, TREND_BAND);
      if (next !== state && t + 1 < totalDays) {
        const execMonth = Math.floor((t + 1) / MONTH_DAYS);
        const used = usedByMonth.get(execMonth) || 0;
        if (next === "OFF") { state = next; pending = "G"; }
        else if (used < IFT_LIMIT) { state = next; pending = "C"; usedByMonth.set(execMonth, used + 1); }
      }

      const year = Math.floor(t / TRADING_DAYS);
      const dayOfYear = t % TRADING_DAYS;

      if (t < workDays) {
        // Contributions follow the current advice: all to C while ON, the
        // coverage split while OFF.
        let amount = 0;
        if (useSalary) {
          const k2 = PAY_INDEX[dayOfYear];
          if (k2 >= 0) { const c = schedule[year][k2]; amount = c.employee + c.agency; }
        } else if ((t + 1) % PAY_PERIOD === 0) {
          amount = contribution;
        }
        if (amount > 0) {
          if (held === "C") S.trend.c += amount;
          else { S.trend.c += amount * (1 - cov); S.trend.g += amount * cov; }
          S.C.c += amount;
          S.G.g += amount;
        }
      } else if (retireYears > 0) {
        // Withdrawals: set each retirement year on its first day.
        const retYear = year - years;
        if (dayOfYear === 0) {
          for (const s of strategies) {
            const x = S[s];
            if (x.depleted) continue;
            const bal = x.c + x.g;
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
            const bal = x.c + x.g;
            const w = annualWithdrawal[s] / 12;
            if (bal <= w) { x.c = 0; x.g = 0; x.depleted = true; continue; }
            const f = 1 - w / bal; // pro rata from every fund held
            x.c *= f; x.g *= f;
          }
        }
      }

      if (dayOfYear === TRADING_DAYS - 1) {
        for (const s of strategies) acc[s].yearly[year + 1].push(S[s].c + S[s].g);
        if (year + 1 === years) for (const s of strategies) acc[s].retire.push(S[s].c + S[s].g);
      }
    }

    for (const s of strategies) {
      acc[s].final.push(S[s].c + S[s].g);
      acc[s].worst.push(S[s].worst);
      if (S[s].depleted) acc[s].depleted++;
    }
    const ft = S.trend.c + S.trend.g, fc = S.C.c + S.C.g;
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
