# TSP Fund Signal Tracker

A live dashboard that tells you when to switch between TSP (Thrift Savings Plan) funds based on technical indicators and real market data.

## Features

- **Live market data** via Alpha Vantage (ETF proxies for each TSP fund)
- **5 signals per fund**: Moving Averages, RSI, MACD, Supply & Demand Zones, Volatility
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
| G Fund | Gov't Securities | Synthetic (stable) |

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

---

## API Rate Limits

The free Alpha Vantage tier allows **25 requests/day**. This app:
- Fetches 4 symbols (SPY, IWM, EFA, AGG) = 4 requests per page load
- Caches results for 15 minutes server-side
- Falls back to demo data if rate limited

For unlimited requests, upgrade to Alpha Vantage's paid tier or swap in Polygon.io.

---

## ⚠️ Disclaimer

This tool is for **educational purposes only** and is not financial advice. TSP fund prices are based on ETF proxies, not official TSP share prices. Always consult [tsp.gov](https://tsp.gov) for official fund information before making allocation changes.
