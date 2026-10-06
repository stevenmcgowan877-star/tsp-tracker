# TSP Fund Signal Tracker

A live dashboard for TSP (Thrift Savings Plan) allocation: one evidence-backed action rule on official tsp.gov prices, plus technical signals for context.

## Features

- **Official TSP share prices** from tsp.gov (all five funds, including the G Fund), with Alpha Vantage ETF proxies as fallback
- **5 signals per fund**: Moving Averages, RSI (Wilder), MACD (12/26/9), Supply & Demand Zones, Volatility regime (10-day vs 60-day)
- **One action rule**: BE IN C or BE IN G, from a 200-day trend filter with a 3% band, backed by a 22-year replay
- **Traffic light conditions per fund**: BUY SIGNALS / MIXED / SELL SIGNALS from the five-signal score (context, not the action rule)
- **AI analysis** powered by Claude — plain-English recommendation on what to do
- **Fund ranking** — all 5 funds ranked by composite signal strength
- Auto-caches data for 15 minutes to stay within free API limits

## Data sources

1. **tsp.gov** (default): the official daily share-price CSV at `https://www.tsp.gov/data/fund-price-history.csv`. One request returns the full history for every fund; the app keeps the last 120 trading days and caches for 6 hours. No API key needed.
2. **Alpha Vantage ETF proxies** (fallback, or set `TSP_DATA_SOURCE=proxy` to force):

| TSP Fund | Tracks | Proxy ETF |
|----------|--------|-----------|
| C Fund | S&P 500 | SPY |
| S Fund | Small/Mid Cap | IWM |
| I Fund | International | EFA |
| F Fund | Fixed Income | AGG |
| G Fund | Gov't Securities | Synthetic (stable) |

The G Fund accrues interest daily and never trades, so its technical signals are neutralised (always HOLD) whichever source is in use.

---

## 🚀 Deploy to Vercel (5 minutes)

### Step 1 — Get a free Alpha Vantage API key
1. Go to [alphavantage.co/support/#api-key](https://www.alphavantage.co/support/#api-key)
2. Enter your email and get your free key instantly

### Step 2 — Push to GitHub
```bash
# Create a new GitHub repo at github.com/new, then:
git init
git add .
git commit -m "Initial TSP tracker"
git remote add origin https://github.com/YOUR_USERNAME/tsp-tracker.git
git push -u origin main
```

### Step 3 — Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **"Add New Project"**
3. Import your `tsp-tracker` repository
4. Under **Environment Variables**, add (both optional):
   - `ALPHA_VANTAGE_API_KEY` = your key from Step 1 (only used if tsp.gov is unreachable)
   - `ANTHROPIC_API_KEY` = enables the AI fund analysis button (uses Claude Haiku 4.5; the server builds the prompt from the same cached fund data the page shows)
5. Click **Deploy** — done!

Your site will be live at `https://tsp-tracker-YOURNAME.vercel.app`

---

## 🛠 Run Locally

```bash
# Install dependencies
npm install

# Copy env file and add your key
cp .env.local.example .env.local
# Edit .env.local and paste your Alpha Vantage key

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Tests and lint

```bash
npm test        # indicator math and signal engine (node:test, no extra deps)
npm run lint    # next/core-web-vitals
```

### The action rule

The rule's parameters were fixed on 2026-10-06 (`RULE_ADOPTED` in `lib/trendRule.js`). Every result before that date is a backtest; results after it are a live record that could not have been tuned. The `/backtest` page reports that live record separately (rule, your mix, holding C and holding G from the first close after adoption), so the backtest can be checked against what actually happened.

The dashboard's one instruction comes from a slow trend filter on the C Fund (`lib/trendRule.js`):

- Hold **C** while it closes more than 3% above its 200-day simple moving average.
- Move everything to **G** once it closes more than 3% below.
- Otherwise do nothing. Check on the close, act at the next close (a TSP interfund transfer requested before noon ET settles that day).

Why this rule and not the five-signal score: replayed on official tsp.gov prices from 2004 to 2026, acting at the next close and obeying the two-transfers-per-month limit, the results were

| Strategy | CAGR | Worst drawdown | Sharpe | Switches |
|---|---|---|---|---|
| Hold C Fund | 11.2% | −55% | 0.43 | 1 |
| Trend rule, C or G, 200-day, 3% band | 10.3% | −19% | 0.60 | 25 |
| Five-signal score, daily | 6.1% | −30% | 0.28 | ~500 |
| Five-signal score retuned to trend weights | 4.7% | −27% | 0.15 | ~520 |

The table replays June 2004 to October 2026 with every strategy starting flat in G. The `/backtest` page starts in March 2004 and begins the trend rule in whatever state it was actually in on the start date, so its headline numbers differ slightly (about 10.1% a year, 24 switches).

Robustness checks: all 25 combinations of average length (100 to 300 days) and band (0 to 5%) landed between 8.3% and 10.4% CAGR with drawdowns of −17% to −23%; across 69 rolling five-year windows the rule had the shallower drawdown in 86% and the higher Sharpe in 61%; in 300 block-bootstrapped 20-year histories its drawdown was shallower in 91% of paths at a median cost of about three points of CAGR. Rotating into S or I by momentum added drawdown without return; parking in F instead of G added return but deepened the 2022 loss; executing three closes late doubled the worst drawdown. The rule lags in strong bull markets and gets whipsawed by V-shaped crashes such as 2020. It is insurance against 2008-style losses, not a return booster. `/backtest` replays it and the five-signal score side by side.

### How the five-signal score works (context only)

Each signal scores −1, 0 or +1 (MACD scores ±0.7) and is weighted:

| Signal | Weight | +1 when | −1 when |
|--------|--------|---------|---------|
| Moving averages | 0.30 | price > SMA20 > SMA50 | price < SMA20 < SMA50 |
| RSI (14) | 0.20 | RSI < 35 (oversold) | RSI > 68 (overbought) |
| MACD histogram | 0.20 | histogram > 0 | histogram < 0 |
| Supply / demand | 0.15 | within 2% of 20-day low | within 2% of 20-day high |
| Volatility regime | 0.15 | 10-day vol < 80% of 60-day vol | 10-day vol > 130% of 60-day vol |

Composite above +0.25 reads BUY, below −0.25 reads SELL, otherwise MIXED. The RSI and zone signals are contrarian, so a fund at fresh highs usually reads MIXED. Weights live in `lib/marketData.js` (`WEIGHTS`). The score describes conditions on the dashboard; it is not the action rule.

### Crisis replays (`/crises`)

Eight episodes from the 2008 financial crisis to the spring 2026 dip, each replayed day by day: the C Fund against its 200-day average with the periods the rule held G shaded, growth of $10,000 under the rule and under holding C, every move with its date and price, and a plain-words account of when the rule stepped aside relative to the peak and when it returned relative to the low. If balances are stored in the holdings panel, the worst losses are shown in those dollars too. The replays are honest in both directions: 2008 shows the rule at its best (a 13% worst loss against 55%) and 2015-16 shows it whipsawed into a worse result than holding. A selector replays each episode at any coverage, with your mix drawn alongside the rule and holding C. Worst loss in each window (October 2026 data):

| Episode | Hold C | Rule, 100% moved | Your mix, 75% moved |
|---|---|---|---|
| 2008 financial crisis | -55% | -13% | -16% |
| 2011 debt-ceiling scare | -19% | -12% | -13% |
| 2015-16 China and oil selloff | -13% | -19% | -16% |
| Late-2018 rate scare | -19% | -9% | -10% |
| 2020 COVID crash | -34% | -19% | -20% |
| 2022 bear market | -24% | -17% | -17% |
| Spring 2025 selloff | -19% | -10% | -11% |
| Spring 2026 dip | -9% | -9% | -9% |

The 75% mix gave up one to three points of protection in the real crashes and finished ahead of the rule in the whipsaws: -7% against -11% over the 2015-16 window and -2% against -4% in 2020, because the quarter left in C softened the cost of selling low and buying back higher. Engine in `lib/crises.js`, episodes defined in `lib/episodes.js`.

### L Funds (`/lfunds`)

Every Lifecycle fund from L Income to L 2075, compared with holding C, holding G and the trend rule over 1, 3, 5 or 10 years: annual return, worst drawdown, volatility and growth of $10,000, with a chart of any one L Fund against the three references. Funds younger than the window are reported from their first day and marked. The holdings panel accepts an L Fund balance as its own bucket, since the rule does not manage a fixed mix. Engine in `lib/lfunds.js`.

### How much of the balance the rule moves

The research gap analysis found that every paid TSP service and the retirement literature favour a partial allocation over all-or-nothing switching (a 50/50 static and trend mix produced the best worst-case 30-year withdrawal rate in Early Retirement Now's 1871-2025 cohort study). The dashboard therefore lets you choose the share of the balance the rule moves. When the rule turns OFF, that share of the whole balance goes to G and the rest stays in C; when it turns ON, everything goes back to C. The split drifts between flips. Default 75%. The `/backtest` replay of exactly that advice, March 2004 to October 2026, with the rule starting in its actual state, next-close execution and the two-transfer limit:

| Share the rule moves | Return a year | Worst loss |
|---|---|---|
| 100% | 10.1% | -19% |
| 75% (default) | 10.5% | -20% |
| 50% | 10.8% | -29% |
| 25% | 11.0% | -42% |
| 0% (hold C) | 11.1% | -55% |

Moving 75% instead of 100% left the worst loss almost unchanged (-19.5% against -19.4%) and gave back 0.3 points a year of the return the rule costs. Across 209 rolling five-year windows (stepped monthly) the 75% version had the higher risk-adjusted return in 65% and the higher return in 74%, which is why it is the default.

A second experiment (October 2026) tested the extensions the research suggested, all with next-close execution and the two-transfer limit enforced. It uses the same window and start as the strategy table above (June 2004, every strategy flat in G), so its first two rows differ slightly from the coverage table:

| Strategy, 2004-2026 | Return a year | Worst loss | Transfers | Blocked by the monthly limit |
|---|---|---|---|---|
| Rule on C, 100% | 10.2% | -19% | 25 | 0 |
| Rule on C, 75% (default) | 10.6% | -20% | 25 | 0 |
| Same rule on C, S and I separately, equal weight, off to G | 8.9% | -17% | 88 | 13 |
| Same rule on C and S separately | 9.6% | -18% | 59 | 0 |
| Rule on C averaged over 150, 200 and 250-day lookbacks | 10.0% | -19% | 67 | 21 |

Filtering S and I as well cost about a point of return a year in both halves of the history, traded three times as often and ran into the transfer limit; averaging lookbacks added transfers without adding return. None of the extensions were adopted.

The choice is stored in the browser and used by the action card, the holdings check, the backtest page and the planner. The flip alert reads `RULE_COVERAGE` as a fraction (`0.5`) or a percentage (`50` or `50%`); unset or unreadable, it uses the dashboard's default of 75%. New contributions can be pointed at the same split with a contribution election, which is unlimited and does not use up the two monthly transfers.

### Retirement planner (`/plan`)

Enter a balance, salary, contribution rate, age, years to retirement, years in retirement and a first-year withdrawal rate (all kept in the browser). The server builds 300 futures by block-bootstrapping the real daily C and G returns (jointly), runs the trend rule on your chosen share of the balance starting from its real current state (moving that share at each flip, sending new contributions the same way, and never more than two transfers back into C a month), and models the TSP's own cash flows:

- Working years: 26 deposits a year at your rate (or, with the salary left blank, a flat amount per paycheck), capped at the 2026 elective limit ($24,500, plus $8,000 from age 50 or $11,250 at ages 60 to 63), with the FERS automatic 1% and a match on the first 5% that stops in any pay period after you hit the limit.
- Retirement: the first-year withdrawal grows 2.5% a year, is never less than the required minimum distribution (age 73, or 75 if born 1960 or later, IRS Uniform Lifetime Table), and is taken pro rata from every fund held, as the TSP pays it.

Results are 10th to 90th percentile bands per year, balance at retirement, the share of futures in which the money runs out, and the bad-case ending balance. History chunk length is selectable (3 months, 1 year default, 3 years): short chunks scramble the multi-year trends a trend rule relies on, longer ones reuse more of the same history. The rule's median balance is always lower than holding C's. What it buys is the bad case, and only when the history chunks are long enough to keep real trends. For a 45-year-old with $100,000, a $100,000 salary at 5%, 20 working years and 30 retired at a 4% first-year withdrawal, with the rule on 75% (October 2026 data):

| History chunks | Money runs out, rule | Money runs out, hold C | Bad-case (10th percentile) ending balance, rule vs C |
|---|---|---|---|
| 3 months | 4% | 4% | $1.09M vs $1.93M |
| 1 year (default) | 2% | 5% | $1.24M vs $1.17M |
| 3 years | 0% | 3% | $2.75M vs $1.63M |

With 3-month chunks, which scramble multi-year trends, the rule is simply worse. With longer chunks it runs out less often and leaves more in the bad case, the sequence-risk effect the literature describes. Salary and limits are held flat, dollars are nominal, no taxes or fees. Engine in `lib/plan.js`.

### Daily alert when the rule flips

`vercel.json` schedules `/api/check-trend` every Tuesday to Saturday at 02:30 UTC (after TSP posts the previous day's prices). The check reads tsp.gov fresh and is stateless: it alerts while the rule's state began within the last two closes, so a flip whose price posted late is still caught, at the cost of a possible repeat the next day. Flips happen about once a year. Configure on Vercel:

| Variable | Purpose |
|---|---|
| `ALERT_WEBHOOK_URL` | Where to POST. The JSON body carries `text` (Slack), `content` (Discord) and structured fields, so a Slack or Discord incoming webhook, or a Zapier/IFTTT/Make catch hook that forwards to email or SMS, all work unchanged. |
| `ALERT_ON_NEAR_TRIGGER` | Set to `1` to also get a heads-up when the close is within 1.5% of a trigger. |
| `CRON_SECRET` | Optional. Vercel sends it as a Bearer token on cron calls; the endpoint then rejects callers without that header. |

Test the wiring with a dry run, which returns the evaluation and the message it would send without sending it:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://your-app.vercel.app/api/check-trend?dry=1"
```

Vercel's Hobby plan runs crons once a day within an hour of the scheduled time, which is fine for a rule that acts at the next close. For exactly-once delivery regardless of timing, persist the last alerted flip date in a store such as Vercel KV and compare against it.

### Backtest (`/backtest`)

The backtest page replays the trend rule and the five-signal score over the full tsp.gov history (2004 onward) and compares them with holding the C Fund, holding the G Fund, and an equal-weight C/S/I/F mix rebalanced monthly. Range presets cover 1, 3, 5 and 10 years and the whole history. The engine is `lib/backtest.js`; results are cached for 6 hours.

---

## API Rate Limits

The free Alpha Vantage tier allows **25 requests/day**. This app:
- Uses the free `TIME_SERIES_DAILY` endpoint (the adjusted series is premium-only)
- Fetches 4 symbols (SPY, IWM, EFA, AGG) = 4 requests per page load
- Caches results for 15 minutes server-side
- Falls back to demo data if rate limited

For unlimited requests, upgrade to Alpha Vantage's paid tier or swap in Polygon.io.

---

## ⚠️ Disclaimer

This tool is for **educational purposes only** and is not financial advice. Prices come from tsp.gov when reachable and from ETF proxies otherwise; the page footer says which. Always consult [tsp.gov](https://tsp.gov) for official fund information before making allocation changes.
