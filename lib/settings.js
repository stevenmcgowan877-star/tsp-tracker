// Reader-chosen settings kept in the browser. The one that matters is the
// share of the balance the trend rule governs ("coverage"); the rest stays in
// C whatever the rule says. Default 0.75: on the 2004-2026 replay it kept
// the rule's worst loss (about -19%) while giving up 0.6 points a year
// against holding C instead of 0.9, and the retirement literature favours a mix over
// all-or-nothing.

export const COVERAGE_KEY = "tsp-tracker:coverage";
export const DEFAULT_COVERAGE = 0.75;
export const COVERAGE_OPTIONS = [1, 0.75, 0.5, 0.25];

// Every coverage the app simulates or caches; anything else snaps to the
// nearest of these.
export const COVERAGE_STEPS = [0, 0.25, 0.5, 0.75, 1];

// Reads a coverage from a query string or environment variable. Accepts a
// fraction ("0.75"), a percentage ("75" or "75%") or a number. Anything
// unreadable gives `fallback`.
export function parseCoverage(raw, fallback = DEFAULT_COVERAGE) {
  if (raw == null) return fallback;
  const text = String(raw).trim();
  if (text === "") return fallback;
  const percent = text.endsWith("%");
  let n = Number(percent ? text.slice(0, -1) : text);
  if (!Number.isFinite(n) || n < 0) return fallback;
  if (percent || n > 1) n /= 100;
  if (n > 1) return fallback;
  return COVERAGE_STEPS.reduce((best, s) => (Math.abs(s - n) < Math.abs(best - n) ? s : best), COVERAGE_STEPS[0]);
}

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
// and coverage. The uncovered share is always C, so when the rule is ON the
// whole account is in C.
export function targetAllocation(state, coverage = DEFAULT_COVERAGE) {
  const c = Math.max(0, Math.min(1, coverage));
  if (state === "ON") return { C: 1, G: 0 };
  return { C: 1 - c, G: c };
}

export function pctLabel(x) {
  return `${Math.round(x * 100)}%`;
}
