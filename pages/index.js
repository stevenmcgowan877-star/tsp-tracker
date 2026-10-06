import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";
import FundCard from "../components/FundCard";
import ActionCard from "../components/ActionCard";
import HoldingsPanel from "../components/HoldingsPanel";

function Recommendation({ funds }) {
  if (!funds.length) return null;
  const top = funds[0]; // already sorted by composite
  const topColor = top.signal === "BUY" ? "#00ff88" : top.signal === "AVOID" ? "#ff4466" : "#fbbf24";
  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(0,255,136,0.05) 0%, rgba(0,207,255,0.03) 100%)",
      border: "1px solid rgba(0,255,136,0.2)", borderRadius: 12,
      padding: "20px 24px", marginBottom: 24, position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,255,136,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ fontSize: 9, color: "#475569", fontFamily: "monospace", letterSpacing: 3, marginBottom: 12 }}>◈ SIGNAL CONDITIONS · CONTEXT, NOT THE ACTION RULE</div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div>
          <span style={{ fontFamily: "monospace", fontSize: 38, fontWeight: 700, color: top.color }}>{top.id}</span>
          <span style={{ fontFamily: "monospace", fontSize: 13, color: "#475569", marginLeft: 10 }}>{top.name}</span>
        </div>
        <div style={{ flex: 1, color: "#64748b", fontSize: 13, fontStyle: "italic", lineHeight: 1.6 }}>
          {top.signal === "BUY"
            ? `${top.name} leads the five-signal score and reads BUY. Replayed since 2004, acting on these daily scores alone returned about half of what the trend rule above did, so treat this as colour on the market, not an instruction.`
            : top.signal === "AVOID"
            ? `Every fund reads SELL on the five-signal score, ${top.name} least of all. The action rule above decides whether that matters.`
            : `${top.name} leads the five-signal score but readings are mixed. The action rule above decides; this panel describes conditions.`}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: topColor, boxShadow: `0 0 10px ${topColor}` }} />
          <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, letterSpacing: 2, color: topColor }}>
            {top.signal === "BUY" ? "CONDITIONS: BUY" : top.signal === "AVOID" ? "CONDITIONS: SELL" : "CONDITIONS: MIXED"}
          </span>
        </div>
      </div>

      {/* Rank row */}
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {funds.map((f, i) => (
          <span key={f.id} style={{
            fontFamily: "monospace", fontSize: 11,
            color: i === 0 ? f.color : "#334155",
            padding: "3px 10px", borderRadius: 20,
            background: i === 0 ? `${f.color}18` : "#0f172a",
            border: `1px solid ${i === 0 ? f.color + "44" : "#1e293b"}`,
          }}>
            {i + 1}. {f.id}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [funds, setFunds] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const [isOfficial, setIsOfficial] = useState(false);
  const [trend, setTrend] = useState(null);
  const [backtestSummary, setBacktestSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [aiInsight, setAiInsight] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/funds");
      if (!res.ok) throw new Error("Failed to load data");
      const json = await res.json();
      setFunds(json.funds);
      setUpdatedAt(json.updatedAt);
      setIsDemo(json.isDemo);
      setIsOfficial(Boolean(json.isOfficial));
      setTrend(json.trend || null);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Headline backtest numbers for the holdings panel; failure just hides them.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/backtest?summary=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j) setBacktestSummary(j); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const getAIInsight = async () => {
    if (!funds.length) return;
    setLoadingAI(true);
    setAiInsight("");
    try {
      // The server builds the fund summary from the same cached data the page shows.
      const res = await fetch("/api/ai-insight", { method: "POST" });
      const data = await res.json();
      setAiInsight(data.insight || data.error || "No insight returned.");
    } catch {
      setAiInsight("Could not load AI insight.");
    }
    setLoadingAI(false);
  };

  return (
    <>
      <Head>
        <title>TSP Fund Signal Tracker</title>
        <meta name="description" content="Live technical signals to help you decide when to switch TSP funds" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #070d1a; color: #e2e8f0; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0f172a; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 2px; }
      `}</style>

      <main style={{
        minHeight: "100vh",
        background: "#070d1a",
        backgroundImage: "radial-gradient(ellipse at 15% 15%, rgba(0,255,136,0.04) 0%, transparent 55%), radial-gradient(ellipse at 85% 85%, rgba(0,207,255,0.04) 0%, transparent 55%)",
        padding: "32px 20px",
        fontFamily: "'Space Mono', monospace",
      }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>

          {/* Header */}
          <div style={{ marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid #0f172a" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 9, color: "#334155", letterSpacing: 4, marginBottom: 6 }}>THRIFT SAVINGS PLAN</div>
                <h1 style={{ fontSize: 26, fontWeight: 700, color: "#e2e8f0", letterSpacing: -1 }}>
                  FUND SIGNAL <span style={{ color: "#00ff88" }}>TRACKER</span>
                </h1>
                <p style={{ fontSize: 11, color: "#334155", fontStyle: "italic", marginTop: 4 }}>
                  200-Day Trend Rule · Moving Averages · RSI · MACD · Zones · Volatility · {isOfficial ? "Official TSP Prices" : "Live Proxy Data"}
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                {updatedAt && (
                  <div style={{ fontSize: 10, color: "#334155", marginBottom: 6 }}>
                    UPDATED {new Date(updatedAt).toLocaleTimeString()}
                  </div>
                )}
                <Link href="/crises" style={{
                  display: "inline-block", marginRight: 8, border: "1px solid #1e293b", color: "#475569",
                  fontFamily: "'Space Mono', monospace", fontSize: 10, padding: "6px 16px",
                  borderRadius: 6, letterSpacing: 2, textDecoration: "none",
                }}>CRISES</Link>
                <Link href="/backtest" style={{
                  display: "inline-block", marginRight: 8, border: "1px solid #1e293b", color: "#475569",
                  fontFamily: "'Space Mono', monospace", fontSize: 10, padding: "6px 16px",
                  borderRadius: 6, letterSpacing: 2, textDecoration: "none",
                }}>BACKTEST →</Link>
                <button onClick={loadData} style={{
                  background: "transparent", border: "1px solid #1e293b", color: "#475569",
                  fontFamily: "'Space Mono', monospace", fontSize: 10, padding: "6px 16px",
                  borderRadius: 6, cursor: "pointer", letterSpacing: 2,
                }} onMouseEnter={e => { e.target.style.borderColor = "#00ff88"; e.target.style.color = "#00ff88"; }}
                  onMouseLeave={e => { e.target.style.borderColor = "#1e293b"; e.target.style.color = "#475569"; }}>
                  ↺ REFRESH
                </button>
              </div>
            </div>

            {isDemo && (
              <div style={{ marginTop: 14, background: "#fbbf2410", border: "1px solid #fbbf2430", borderRadius: 8, padding: "10px 14px", fontSize: 11, color: "#fbbf24" }}>
                ⚠ Running on demo data — add your <code style={{ background: "#0f172a", padding: "1px 6px", borderRadius: 4 }}>ALPHA_VANTAGE_API_KEY</code> to .env.local for live prices.{" "}
                <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noreferrer" style={{ color: "#fbbf24" }}>Get a free key →</a>
              </div>
            )}
          </div>

          {/* Body */}
          {loading ? (
            <div style={{ textAlign: "center", padding: 80, color: "#334155" }}>
              <div style={{ fontSize: 28, animation: "spin 1s linear infinite", display: "inline-block", marginBottom: 12 }}>◈</div>
              <div style={{ fontSize: 11, letterSpacing: 3 }}>LOADING SIGNALS...</div>
            </div>
          ) : error ? (
            <div style={{ textAlign: "center", padding: 60, color: "#ff4466" }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>⚠</div>
              <div style={{ fontSize: 13 }}>{error}</div>
              <button onClick={loadData} style={{ marginTop: 16, background: "transparent", border: "1px solid #ff4466", color: "#ff4466", fontFamily: "monospace", padding: "8px 20px", borderRadius: 6, cursor: "pointer" }}>Retry</button>
            </div>
          ) : (
            <>
              <ActionCard trend={trend} />
              <HoldingsPanel trend={trend} backtest={backtestSummary} />
              <Recommendation funds={funds} />

              {/* AI Insight */}
              <div style={{ marginBottom: 24 }}>
                <button onClick={getAIInsight} disabled={loadingAI} style={{
                  width: "100%", padding: "11px 0", borderRadius: 8, cursor: loadingAI ? "not-allowed" : "pointer",
                  background: "rgba(0,207,255,0.06)", border: "1px solid rgba(0,207,255,0.25)",
                  color: loadingAI ? "#334155" : "#00cfff", fontFamily: "monospace", fontSize: 11, letterSpacing: 2,
                  transition: "all 0.2s",
                }}>
                  {loadingAI ? "◈ GENERATING AI ANALYSIS..." : "◈ GET AI FUND ANALYSIS"}
                </button>
                {aiInsight && (
                  <div style={{ marginTop: 10, background: "rgba(0,207,255,0.04)", border: "1px solid rgba(0,207,255,0.15)", borderRadius: 8, padding: "16px 18px", animation: "fadeIn 0.4s ease" }}>
                    <div style={{ fontSize: 9, color: "#334155", letterSpacing: 3, marginBottom: 8 }}>◈ AI ANALYSIS</div>
                    <p style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.8, fontFamily: "Georgia, serif" }}>{aiInsight}</p>
                  </div>
                )}
              </div>

              {/* Fund cards */}
              <div style={{ display: "grid", gap: 10 }}>
                {funds.map(fund => <FundCard key={fund.id} fund={fund} />)}
              </div>

              <div style={{ marginTop: 28, paddingTop: 16, borderTop: "1px solid #0f172a", fontSize: 10, color: "#1e293b", textAlign: "center", lineHeight: 1.8 }}>
                FOR EDUCATIONAL PURPOSES ONLY · NOT FINANCIAL ADVICE<br />
                {isOfficial
                  ? "PRICES ARE OFFICIAL TSP SHARE PRICES FROM TSP.GOV, UPDATED ONCE PER TRADING DAY"
                  : "TSP FUND SIGNALS DERIVED FROM ETF PROXIES (SPY, IWM, EFA, AGG) · CONSULT TSP.GOV FOR OFFICIAL SHARE PRICES"}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
