import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Head from "next/head";
import ShareMeta from "../components/ShareMeta";
import Link from "next/link";
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { totalBalance } from "../lib/holdings";

// Colours validated for the dark surface (#070d1a): see pages/backtest.js.
const COLORS = { rule: "#16a34a", C: "#2563eb", G: "#7c3aed" };
const mono = "'Space Mono', monospace";
const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
const short = (x) => (Math.abs(x) >= 1e6 ? `$${(x / 1e6).toFixed(1)}M` : `$${Math.round(x / 1000)}k`);
const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
const STORAGE_KEY = "tsp-tracker:plan";

function readStored(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function Stat({ label, value, sub, tone }) {
  const color = tone === "good" ? "#00ff88" : tone === "bad" ? "#ff4466" : "#e2e8f0";
  return (
    <div style={{ background: "rgba(15,23,42,0.9)", border: "1px solid #1e293b", borderRadius: 10, padding: "12px 14px", minWidth: 0 }}>
      <div style={{ fontSize: 9, color: "#475569", letterSpacing: 3, marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#64748b", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function FanTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, padding: "10px 12px", fontFamily: mono, fontSize: 11 }}>
      <div style={{ color: "#94a3b8", marginBottom: 6 }}>Year {label}</div>
      {[
        ["Rule, likely range", `${short(p.ruleBand[0])} to ${short(p.ruleBand[1])}`, COLORS.rule],
        ["Rule, median", money(p.rule), COLORS.rule],
        ["Hold C, median", money(p.C), COLORS.C],
        ["Hold G, median", money(p.G), COLORS.G],
      ].map(([name, value, color]) => (
        <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{ width: 14, height: 2, background: color, display: "inline-block" }} />
          <span style={{ color: "#e2e8f0", fontWeight: 700, minWidth: 110, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{value}</span>
          <span style={{ color: "#64748b" }}>{name}</span>
        </div>
      ))}
    </div>
  );
}

export default function Plan() {
  const [inputs, setInputs] = useState({ balance: "", contribution: "900", years: 20 });
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  useEffect(() => {
    const stored = readStored(STORAGE_KEY, null);
    const holdings = readStored("tsp-tracker:holdings", null);
    const fromHoldings = holdings ? totalBalance(holdings) : 0;
    setInputs({
      balance: stored?.balance ?? (fromHoldings > 0 ? String(Math.round(fromHoldings)) : "100000"),
      contribution: stored?.contribution ?? "900",
      years: stored?.years ?? 20,
    });
    setLoaded(true);
  }, []);

  const load = useCallback(async (inp) => {
    const req = ++requestId.current;
    setLoading(true);
    setError(null);
    const q = new URLSearchParams({ balance: Number(inp.balance) || 0, contribution: Number(inp.contribution) || 0, years: inp.years });
    try {
      const res = await fetch(`/api/plan?${q}`);
      const json = await res.json();
      if (req !== requestId.current) return;
      if (!res.ok) throw new Error(json.error || "Plan failed");
      setData(json);
    } catch (e) {
      if (req !== requestId.current) return;
      setError(e.message);
    }
    setLoading(false);
  }, []);

  // Debounce while typing; persist inputs for next time.
  useEffect(() => {
    if (!loaded) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs)); } catch { /* ignore */ }
    const t = setTimeout(() => load(inputs), 450);
    return () => clearTimeout(t);
  }, [inputs, loaded, load]);

  const set = (key) => (e) => setInputs((prev) => ({ ...prev, [key]: key === "years" ? Number(e.target.value) : e.target.value.replace(/[^\d.]/g, "") }));

  const rows = useMemo(() => {
    if (!data) return [];
    const { trend, C, G } = data.strategies;
    return trend.yearly.map((y, i) => ({ year: y.year, ruleBand: [y.p10, y.p90], rule: y.p50, C: C.yearly[i].p50, G: G.yearly[i].p50 }));
  }, [data]);

  const t = data?.strategies?.trend;
  const c = data?.strategies?.C;
  const g = data?.strategies?.G;

  return (
    <>
      <Head>
        <title>Planner · TSP Fund Signal Tracker</title>
        <meta name="description" content="A range of retirement outcomes for your TSP balance and contributions under the trend rule, holding C and holding G" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <ShareMeta title="Planner · TSP Fund Signal Tracker" description="A range of retirement outcomes for your TSP balance and contributions under the trend rule, holding C and holding G." path="/plan" />
      </Head>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #070d1a; color: #e2e8f0; }
        .pl input:focus-visible { outline: 2px solid #00ff88; outline-offset: 2px; }
        .pl input[type=range] { accent-color: #00ff88; width: 100%; }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
      `}</style>

      <main className="pl" style={{ minHeight: "100vh", background: "#070d1a", padding: "32px 16px", fontFamily: mono }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #0f172a", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 9, color: "#334155", letterSpacing: 4, marginBottom: 6 }}>THRIFT SAVINGS PLAN</div>
              <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -1 }}>CONTRIBUTION <span style={{ color: "#00ff88" }}>PLANNER</span></h1>
              <p style={{ fontSize: 11, color: "#334155", fontStyle: "italic", marginTop: 4 }}>
                A range of outcomes for your balance and contributions, from resampled official tsp.gov history
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Link href="/backtest" style={{ color: "#475569", fontSize: 10, letterSpacing: 2, textDecoration: "none", border: "1px solid #1e293b", padding: "6px 14px", borderRadius: 6 }}>BACKTEST</Link>
              <Link href="/" style={{ color: "#475569", fontSize: 10, letterSpacing: 2, textDecoration: "none", border: "1px solid #1e293b", padding: "6px 14px", borderRadius: 6 }}>← DASHBOARD</Link>
            </div>
          </div>

          {/* Inputs */}
          <div style={{ background: "rgba(15,23,42,0.6)", border: "1px solid #1e293b", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
            <div style={{ fontSize: 9, color: "#475569", letterSpacing: 3, marginBottom: 12 }}>◈ YOUR NUMBERS · STAY IN THIS BROWSER</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
              <label style={{ display: "block", minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#64748b", marginBottom: 4 }}>BALANCE TODAY $</span>
                <input id="plan-balance" inputMode="decimal" value={inputs.balance} onChange={set("balance")} style={inputStyle} />
              </label>
              <label style={{ display: "block", minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#64748b", marginBottom: 4 }}>CONTRIBUTION PER PAY PERIOD $ (INCL. MATCH)</span>
                <input id="plan-contribution" inputMode="decimal" value={inputs.contribution} onChange={set("contribution")} style={inputStyle} />
              </label>
              <label style={{ display: "block", minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#64748b", marginBottom: 4 }}>YEARS UNTIL RETIREMENT · {inputs.years}</span>
                <input id="plan-years" type="range" min="1" max="40" value={inputs.years} onChange={set("years")} />
              </label>
            </div>
          </div>

          {error ? (
            <div style={{ textAlign: "center", padding: 60, color: "#ff4466" }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>⚠</div>
              <div style={{ fontSize: 13 }}>{error}</div>
            </div>
          ) : !data ? (
            <div style={{ textAlign: "center", padding: 60, color: "#334155", fontSize: 11, letterSpacing: 3 }}>SIMULATING 300 FUTURES...</div>
          ) : (
            <div style={{ opacity: loading ? 0.5 : 1, transition: "opacity 0.2s" }}>
              <div style={{ background: "rgba(0,255,136,0.05)", border: "1px solid rgba(0,255,136,0.2)", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
                <div style={{ fontSize: 9, color: "#475569", letterSpacing: 3, marginBottom: 8 }}>◈ IN {data.years} YEARS · {data.paths} RESAMPLED FUTURES · RULE STARTS {data.startState === "ON" ? "IN C" : "IN G"}</div>
                <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7, fontFamily: "Georgia, serif" }}>
                  Starting from {money(data.balance)} and adding {money(data.contribution)} every pay period ({money(data.contributed)} in total), the middle outcome under the rule is {money(t.final.p50)},
                  with the likely range running from {money(t.final.p10)} to {money(t.final.p90)}. Holding C has a middle outcome of {money(c.final.p50)} and a likely range of {money(c.final.p10)} to {money(c.final.p90)};
                  holding G reaches about {money(g.final.p50)}. The rule ends ahead of holding C in {pct(data.ruleBeatsC)} of futures and within 20% of it in {pct(data.ruleWithin20pctOfC)},
                  while its typical worst fall along the way is {pct(-t.worstDrawdown.p50)} instead of {pct(-c.worstDrawdown.p50)}.
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
                <Stat label="RULE · MIDDLE OUTCOME" value={money(t.final.p50)} sub={`bad case ${money(t.final.p10)}`} />
                <Stat label="HOLD C · MIDDLE OUTCOME" value={money(c.final.p50)} sub={`bad case ${money(c.final.p10)}`} />
                <Stat label="RULE · TYPICAL WORST FALL" value={pct(t.worstDrawdown.p50)} sub={`bad case ${pct(t.worstDrawdown.p10)}`} tone="bad" />
                <Stat label="HOLD C · TYPICAL WORST FALL" value={pct(c.worstDrawdown.p50)} sub={`bad case ${pct(c.worstDrawdown.p10)}`} tone="bad" />
              </div>

              <div style={{ background: "rgba(15,23,42,0.6)", border: "1px solid #1e293b", borderRadius: 12, padding: "16px 12px 10px", marginBottom: 20 }}>
                <div style={{ fontSize: 9, color: "#475569", letterSpacing: 3, marginBottom: 8, paddingLeft: 6 }}>BALANCE BY YEAR · SHADED BAND IS THE RULE&apos;S 10TH TO 90TH PERCENTILE</div>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={rows} margin={{ top: 8, right: 28, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#0f172a" vertical={false} />
                    <XAxis dataKey="year" tick={{ fill: "#475569", fontSize: 10, fontFamily: mono }} tickLine={false} axisLine={{ stroke: "#1e293b" }} />
                    <YAxis tick={{ fill: "#475569", fontSize: 10, fontFamily: mono }} tickLine={false} axisLine={false} tickFormatter={short} width={56} />
                    <Tooltip content={<FanTooltip />} cursor={{ stroke: "#334155", strokeWidth: 1 }} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: mono, color: "#94a3b8", paddingTop: 8 }} iconType="plainline" />
                    <Area type="monotone" dataKey="ruleBand" name="Rule, likely range" fill={COLORS.rule} fillOpacity={0.18} stroke="none" isAnimationActive={false} legendType="rect" />
                    <Line type="monotone" dataKey="rule" name="Rule, median" stroke={COLORS.rule} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="C" name="Hold C, median" stroke={COLORS.C} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="G" name="Hold G, median" stroke={COLORS.G} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.8, borderTop: "1px solid #0f172a", paddingTop: 14 }}>
                <div style={{ fontSize: 9, letterSpacing: 3, marginBottom: 6 }}>HOW TO READ THIS</div>
                Each future is built by stringing together 60-trading-day blocks drawn at random from the real daily returns of the C and G Funds since 2003, so crashes and recoveries appear in realistic shapes but in a new order. The rule runs on each future exactly as it runs on the dashboard, starting in its real current state. Contributions arrive every ten trading days and buy whatever is held. Dollars are nominal; there are no fees, raises or taxes. Resampling in short blocks breaks up multi-year trends, which works against a trend-following rule, so treat the rule&apos;s shortfall here as a pessimistic bound and the drawdown comparison as the more reliable part. Not financial advice.
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

const inputStyle = {
  width: "100%", background: "#070d1a", border: "1px solid #1e293b", borderRadius: 6, color: "#e2e8f0",
  fontFamily: mono, fontSize: 14, padding: "8px 10px", fontVariantNumeric: "tabular-nums",
};
