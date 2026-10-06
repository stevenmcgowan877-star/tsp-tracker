// Pure calculations for the holdings panel. Balances are the reader's own
// numbers (kept in their browser); everything here is arithmetic on them.

export const HOLDING_FUNDS = ["C", "S", "I", "F", "G"];

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
export function assessHoldings(balances, trend, backtest) {
  const total = totalBalance(balances);
  if (total <= 0) return { empty: true, total };
  const alloc = allocation(balances);
  const inC = alloc.C;
  const inG = alloc.G;
  const equityShare = alloc.C + alloc.S + alloc.I;
  const result = { empty: false, total, alloc, equityShare };

  if (!trend || !trend.available) return { ...result, aligned: null, message: "The rule cannot be evaluated right now." };

  const on = trend.state === "ON";
  if (on) {
    result.aligned = inC >= 0.9;
    result.message = result.aligned
      ? `Positioned with the rule: ${pct(inC)} in C.`
      : equityShare >= 0.9
        ? `The rule says be in C; you hold ${pct(equityShare)} in equities but only ${pct(inC)} in C. The replay was run on C alone.`
        : `The rule says be in C; you hold ${pct(inC)} in C and ${pct(inG)} in G.`;
    const cushionPct = Math.max(0, (trend.price - trend.sellTrigger) / trend.price);
    result.cushionDollars = Number(balances.C || 0) * cushionPct;
    result.cushionPct = cushionPct;
  } else {
    result.aligned = inG >= 0.9;
    result.message = result.aligned
      ? `Positioned with the rule: ${pct(inG)} in G.`
      : `The rule says be in G; you hold ${pct(equityShare)} in equities.`;
    result.cushionDollars = null;
    result.cushionPct = null;
  }

  if (backtest) {
    const t = backtest.strategies?.trend;
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
