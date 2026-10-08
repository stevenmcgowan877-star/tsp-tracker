# TSP Fund Signal Tracker

Next.js 14 (pages router, plain JavaScript, ESM) dashboard for Thrift Savings Plan allocation. One action rule on official tsp.gov prices, plus context signals, a backtest, crisis replays, an L Fund comparison, a contribution planner, and a daily flip alert.

## Commands

- `npm test` runs the node:test suite in `tests/` (no extra dependencies). Imports in `lib/` and `pages/api/` use explicit `.js` extensions so Node resolves them outside Next.
- `npm run lint` uses `next/core-web-vitals`; `npm run build` must stay clean. CI runs all three on pull requests and pushes to master.
- Local run: `npm run dev`. No API key is needed; the default data path is tsp.gov. `TSP_DATA_SOURCE=proxy` forces the Alpha Vantage fallback (demo data without a key).

## Layout

- `lib/tspGov.js` fetches and parses the tsp.gov CSV (five core funds plus `series.L` for Lifecycle funds), cached 6 hours, with in-flight de-duplication and a `fresh` bypass.
- `lib/trendRule.js` is the action rule: hold C while it closes more than 3% above its 200-day average, G once more than 3% below. `evaluateTrendRule`, `trendStateAt`, `nextTrendState`.
- `lib/marketData.js` holds the five-signal composite (context only) and the proxy fallback. `lib/indicators.js` has the pure indicator math.
- `lib/backtest.js` replays both rules and the benchmarks; `lib/crises.js`, `lib/lfunds.js`, `lib/plan.js` build on it. `lib/episodes.js` is import-free so the crises page can ship the list.
- `lib/dashboardData.js` is the single loader used by `/api/funds`, `/api/ai-insight` and `/api/check-trend`.
- `lib/holdings.js` owns the browser-stored balances (key, reader, calculations). Pages never read localStorage directly.
- `components/ShareMeta.js` must be called as a function inside `<Head>` (`{ShareMeta({...})}`), never as an element.

## Conventions

- The dashboard's instruction is the trend rule. The composite score is context; never present it as the action.
- Replays act at the close after the signal and obey the TSP limit of two unrestricted interfund transfers per month (further moves only into G). Keep that in any new strategy code.
- Chart colours on the dark surface are validated with the dataviz palette checks; reuse the existing series colours (`#16a34a` rule, `#2563eb` C, `#d97706` third series, `#7c3aed` G) rather than inventing new ones.
- Every page must work at 390px with no horizontal scroll; verify with a screenshot before committing UI changes.
- Keep the README's evidence section truthful when strategy behaviour changes; the headline numbers there come from the experiments described in it.
