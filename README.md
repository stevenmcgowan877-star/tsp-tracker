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
