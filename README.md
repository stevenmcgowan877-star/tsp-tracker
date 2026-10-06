# TSP Fund Signal Tracker

A live dashboard that tells you when to switch between TSP (Thrift Savings Plan) funds based on technical indicators and real market data.

## Features

- **Live market data** via Alpha Vantage (ETF proxies for each TSP fund)
- **5 signals per fund**: Moving Averages, RSI (Wilder), MACD (12/26/9), Supply & Demand Zones, Volatility regime (10-day vs 60-day)
- **Traffic light recommendations**: SWITCH IN / HOLD / SWITCH OUT
- **AI analysis** powered by Claude — plain-English recommendation on what to do
- **Fund ranking** — all 5 funds ranked by composite signal strength
- Auto-caches data for 15 minutes to stay within free API limits

## TSP Fund Proxies

| TSP Fund | Tracks | Proxy ETF |
|----------|--------|-----------|
| C Fund | S&P 500 | SPY |
| S Fund | Small/Mid Cap | IWM |
| I Fund | International | EFA |
| F Fund | Fixed Income | AGG |
| G Fund | Gov't Securities | Synthetic (stable) — signals neutral by design |

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
4. Under **Environment Variables**, add:
   - `ALPHA_VANTAGE_API_KEY` = your key from Step 1
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

### How the composite score works

Each signal scores −1, 0 or +1 (MACD scores ±0.7) and is weighted:

| Signal | Weight | +1 when | −1 when |
|--------|--------|---------|---------|
| Moving averages | 0.30 | price > SMA20 > SMA50 | price < SMA20 < SMA50 |
| RSI (14) | 0.20 | RSI < 35 (oversold) | RSI > 68 (overbought) |
| MACD histogram | 0.20 | histogram > 0 | histogram < 0 |
| Supply / demand | 0.15 | within 2% of 20-day low | within 2% of 20-day high |
| Volatility regime | 0.15 | 10-day vol < 80% of 60-day vol | 10-day vol > 130% of 60-day vol |

Composite above +0.25 shows **SWITCH IN**, below −0.25 shows **SWITCH OUT**, otherwise **HOLD**. The RSI and zone signals are contrarian, so a fund at fresh highs usually reads HOLD rather than SWITCH IN. Weights live in `lib/marketData.js` (`WEIGHTS`).

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

This tool is for **educational purposes only** and is not financial advice. TSP fund prices are based on ETF proxies, not official TSP share prices. Always consult [tsp.gov](https://tsp.gov) for official fund information before making allocation changes.
