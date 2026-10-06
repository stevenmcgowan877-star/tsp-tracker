// Reader-chosen settings kept in the browser. The one that matters is the
// share of the balance the trend rule governs ("coverage"); the rest stays in
// C whatever the rule says. Default 0.75: on the 2004-2026 replay it kept
// almost all of the rule's drawdown protection at a third less return cost,
// and the retirement literature favours a mix over all-or-nothing.

export const COVERAGE_KEY = "tsp-tracker:coverage";
export const DEFAULT_COVERAGE = 0.75;
export const COVERAGE_OPTIONS = [1, 0.75, 0.5, 0.25];

export function readCoverage() {
  try {
    if (typeof window === "undefined") return DEFAULT_COVERAGE;
    const raw = window.localStorage.getItem(COVERAGE_KEY);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : DEFAULT_COVERAGE;
  } catch {
    return DEFAULT_COVERAGE;
  }
}

export function writeCoverage(value) {
  try {
    window.localStorage.setItem(COVERAGE_KEY, String(value));
  } catch {
    // Blocked storage: the choice lasts for this visit only.
  }
}

// What the rule asks for, as whole-account percentages, for a given state
// and coverage. The static sleeve is always C, so when the rule is ON the
// whole account is in C.
export function targetAllocation(state, coverage = DEFAULT_COVERAGE) {
  const c = Math.max(0, Math.min(1, coverage));
  if (state === "ON") return { C: 1, G: 0 };
  return { C: 1 - c, G: c };
}

export function pctLabel(x) {
  return `${Math.round(x * 100)}%`;
}
