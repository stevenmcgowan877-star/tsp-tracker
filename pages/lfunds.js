import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Head from "next/head";
import ShareMeta from "../components/ShareMeta";
import Link from "next/link";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

// Colours validated for the dark surface (#070d1a): see pages/backtest.js.
const COLORS = { L: "#d97706", C: "#2563eb", trend: "#16a34a", G: "#7c3aed" };
const mono = "'Space Mono', monospace";
const pct = (x, d = 1) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)}%`);
const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;

const RANGES = [
  { key: "10y", label: "10 YEARS", years: 10 },
  { key: "5y", label: "5 YEARS", years: 5 },
  { key: "3y", label: "3 YEARS", years: 3 },
  { key: "1y", label: "1 YEAR", years: 1 },
];
function startFor(range) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - range.years);
  return d.toISOString().slice(0, 10);
}

function GrowthTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, padding: "10px 12px", fontFamily: mono, fontSize: 11 }}>
      <div style={{ color: "#94a3b8", marginBottom: 6 }}>{label}</div>
      {payload.filter((s) => s.value != null).map((s) => (
        <div key={s.dataKey} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{ width: 14, height: 2, background: s.color, display: "inline-block" }} />
          <span style={{ color: "#e2e8f0", fontWeight: 700, minWidth: 70, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(s.value)}</span>
          <span style={{ color: "#64748b" }}>{s.name}</span>
        </div>
      ))}
    </div>
  );
}

export default function LFunds() {
  const [rangeKey, setRangeKey] = useState("5y");
  const [selected, setSelected] = useState("L 2050");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  const load = useCallback(async (key) => {
    const req = ++requestId.current;
    setLoading(true);
    setError(null);
    const range = RANGES.find((r) => r.key === key) || RANGES[1];
    try {
      const res = await fetch(`/api/lfunds?start=${startFor(range)}`);
      const json = await res.json();
      if (req !== requestId.current) return;
      if (!res.ok) throw new Error(json.error || "Comparison failed");
      setData(json);
    } catch (e) {
      if (req !== requestId.current) return;
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(rangeKey); }, [rangeKey, load]);

  const rows = useMemo(() => {
    if (!data) return [];
    const fund = data.funds.find((f) => f.name === selected);
    return data.dates.map((date, i) => ({
      date,
      L: fund && fund.available ? fund.curve[i] : null,
      C: data.benchmarks.C.curve[i],
      trend: data.benchmarks.trend.curve[i],
      G: data.benchmarks.G.curve[i],
    }));
  }, [data, selected]);

  const chosen = data?.funds.find((f) => f.name === selected);
  const b = data?.benchmarks;

  // Sorted table: benchmarks first, then L Funds by target date.
  const table = useMemo(() => {
    if (!data) return [];
    return [
      { name: "Hold C Fund", kind: "bench", color: COLORS.C, ...b.C },
      { name: "Trend rule (C or G)", kind: "bench", color: COLORS.trend, ...b.trend },
      { name: "Hold G Fund", kind: "bench", color: COLORS.G, ...b.G },
      ...data.funds.map((f) => ({ ...f, kind: "L" })),
    ];
  }, [data, b]);

  return (
    <>
      <Head>
        <title>L Funds · TSP Fund Signal Tracker</title>
        <meta name="description" content="Every TSP Lifecycle fund compared with the C Fund, the G Fund and the trend rule on official tsp.gov prices" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        {ShareMeta({ title: "L Fund Lens · TSP Fund Signal Tracker", description: "Every TSP Lifecycle fund compared with the C Fund, the G Fund and the trend rule.", path: "/lfunds" })}
      </Head>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #070d1a; color: #e2e8f0; }
        @keyframes spin { to{transform:rotate(360deg)} }
        .lf button:focus-visible, .lf select:focus-visible { outline: 2px solid #00ff88; outline-offset: 2px; }
        .lf-table { width: 100%; border-collapse: collapse; font-family: ${mono}; font-size: 11px; font-variant-numeric: tabular-nums; }
        .lf-table th, .lf-table td { padding: 7px 8px; text-align: right; border-bottom: 1px solid #0f172a; white-space: nowrap; }
        .lf-table th { color: #475569; font-weight: 400; letter-spacing: 1px; font-size: 9px; }
        .lf-table th:first-child, .lf-table td:first-child { text-align: left; }
        .lf-table tr.sel td { background: rgba(217,119,6,0.08); }
        .lf-table tr.L { cursor: pointer; }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
      `}</style>

      <main className="lf" style={{ minHeight: "100vh", background: "#070d1a", padding: "32px 16px", fontFamily: mono }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #0f172a", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 9, color: "#334155", letterSpacing: 4, marginBottom: 6 }}>THRIFT SAVINGS PLAN</div>
              <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -1 }}>L FUND <span style={{ color: "#00ff88" }}>LENS</span></h1>
              <p style={{ fontSize: 11, color: "#334155", fontStyle: "italic", marginTop: 4 }}>
                Every Lifecycle fund against the C Fund, the G Fund and the trend rule, on official tsp.gov prices
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Link href="/backtest" style={{ color: "#475569", fontSize: 10, letterSpacing: 2, textDecoration: "none", border: "1px solid #1e293b", padding: "6px 14px", borderRadius: 6 }}>BACKTEST</Link>
              <Link href="/" style={{ color: "#475569", fontSize: 10, letterSpacing: 2, textDecoration: "none", border: "1px solid #1e293b", padding: "6px 14px", borderRadius: 6 }}>← DASHBOARD</Link>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
            {RANGES.map((r) => (
              <button key={r.key} onClick={() => setRangeKey(r.key)} aria-pressed={rangeKey === r.key} style={{
                background: rangeKey === r.key ? "rgba(0,255,136,0.08)" : "transparent",
                border: `1px solid ${rangeKey === r.key ? "#00ff88" : "#1e293b"}`,
                color: rangeKey === r.key ? "#00ff88" : "#475569",
                fontFamily: mono, fontSize: 10, letterSpacing: 2, padding: "6px 12px", borderRadius: 6, cursor: "pointer",
              }}>{r.label}</button>
            ))}
            {data && (
              <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: "#475569", letterSpacing: 2 }}>
                CHART
                <select id="lfund-select" value={selected} onChange={(e) => setSelected(e.target.value)} style={{ background: "#070d1a", color: "#e2e8f0", border: "1px solid #1e293b", borderRadius: 6, fontFamily: mono, fontSize: 11, padding: "5px 8px" }}>
                  {data.funds.map((f) => <option key={f.name} value={f.name} disabled={!f.available}>{f.name}</option>)}
                </select>
              </label>
            )}
          </div>

          {error ? (
            <div style={{ textAlign: "center", padding: 60, color: "#ff4466" }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>⚠</div>
              <div style={{ fontSize: 13 }}>{error}</div>
              <button onClick={() => load(rangeKey)} style={{ marginTop: 16, background: "transparent", border: "1px solid #ff4466", color: "#ff4466", fontFamily: mono, padding: "8px 20px", borderRadius: 6, cursor: "pointer" }}>Retry</button>
            </div>
          ) : !data ? (
            <div style={{ textAlign: "center", padding: 80, color: "#334155" }}>
              <div style={{ fontSize: 28, animation: "spin 1s linear infinite", display: "inline-block", marginBottom: 12 }}>◈</div>
              <div style={{ fontSize: 11, letterSpacing: 3 }}>COMPARING...</div>
            </div>
          ) : (
            <div style={{ opacity: loading ? 0.5 : 1, transition: "opacity 0.2s" }}>
              {chosen && chosen.available && (
                <div style={{ background: "rgba(0,255,136,0.05)", border: "1px solid rgba(0,255,136,0.2)", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
                  <div style={{ fontSize: 9, color: "#475569", letterSpacing: 3, marginBottom: 8 }}>◈ {chosen.name.toUpperCase()} · {chosen.from} TO {data.end}{chosen.partial ? " · FUND YOUNGER THAN THE WINDOW" : ""}</div>
                  <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7, fontFamily: "Georgia, serif" }}>
                    {chosen.name} returned {pct(chosen.cagr)} a year with a worst loss of {pct(chosen.maxDrawdown)}.
                    {" "}Over the same {chosen.partial ? "period" : "window"} the C Fund returned {pct(b.C.cagr)} a year with a worst loss of {pct(b.C.maxDrawdown)}, and the trend rule {pct(b.trend.cagr)} with {pct(b.trend.maxDrawdown)}.
                    {" "}{b.trend.cagr >= chosen.cagr && b.trend.maxDrawdown >= chosen.maxDrawdown
                      ? "The rule beat this L Fund on both return and worst loss."
                      : b.trend.maxDrawdown >= chosen.maxDrawdown
                        ? "The rule gave up some return for a shallower worst loss than this L Fund."
                        : "This L Fund had the shallower worst loss; its fixed mix holds more in G and F than the rule does when the trend is on."}
                    {chosen.partial ? ` Figures for ${chosen.name} start on ${chosen.from}, when the fund opened, so they cover a shorter period than the references.` : ""}
                  </p>
                </div>
              )}

              <div style={{ background: "rgba(15,23,42,0.6)", border: "1px solid #1e293b", borderRadius: 12, padding: "16px 12px 10px", marginBottom: 20 }}>
                <div style={{ fontSize: 9, color: "#475569", letterSpacing: 3, marginBottom: 8, paddingLeft: 6 }}>GROWTH OF $10,000 · {data.start} TO {data.end}</div>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={rows} margin={{ top: 8, right: 28, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#0f172a" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 10, fontFamily: mono }} tickLine={false} axisLine={{ stroke: "#1e293b" }} tickFormatter={(d) => d.slice(0, 4)} minTickGap={40} />
                    <YAxis domain={["auto", "auto"]} tick={{ fill: "#475569", fontSize: 10, fontFamily: mono }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} width={48} />
                    <Tooltip content={<GrowthTooltip />} cursor={{ stroke: "#334155", strokeWidth: 1 }} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: mono, color: "#94a3b8", paddingTop: 8 }} iconType="plainline" />
                    <Line type="monotone" dataKey="L" name={selected} stroke={COLORS.L} strokeWidth={2.5} dot={false} isAnimationActive={false} connectNulls={false} />
                    <Line type="monotone" dataKey="C" name="Hold C Fund" stroke={COLORS.C} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="trend" name="Trend rule" stroke={COLORS.trend} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="G" name="Hold G Fund" stroke={COLORS.G} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: "rgba(15,23,42,0.6)", border: "1px solid #1e293b", borderRadius: 12, padding: 14, marginBottom: 20, minWidth: 0 }}>
                <div style={{ fontSize: 9, color: "#475569", letterSpacing: 3, marginBottom: 8 }}>ALL FUNDS · CLICK AN L FUND TO CHART IT</div>
                <div style={{ overflowX: "auto" }}>
                  <table className="lf-table">
                    <thead><tr><th>FUND</th><th>A YEAR</th><th>WORST LOSS</th><th>VOLATILITY</th><th>$10K BECAME</th><th>FROM</th></tr></thead>
                    <tbody>
                      {table.map((r) => (
                        <tr key={r.name} className={`${r.kind}${r.kind === "L" && r.name === selected ? " sel" : ""}`} onClick={r.kind === "L" && r.available ? () => setSelected(r.name) : undefined}>
                          <td style={{ color: r.kind === "bench" ? r.color : r.available ? "#e2e8f0" : "#334155" }}>{r.name}</td>
                          <td>{r.available === false ? "—" : pct(r.cagr)}</td>
                          <td style={{ color: r.available === false ? "#334155" : "#ff4466" }}>{r.available === false ? "—" : pct(r.maxDrawdown)}</td>
                          <td style={{ color: "#94a3b8" }}>{r.vol != null ? `${(r.vol * 100).toFixed(1)}%` : "—"}</td>
                          <td>{r.available === false ? "—" : money(r.final)}</td>
                          <td style={{ color: r.partial ? "#fbbf24" : "#475569" }}>{r.available === false ? "no history" : r.kind === "L" ? r.from : data.start}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.8, borderTop: "1px solid #0f172a", paddingTop: 14 }}>
                L Funds are fixed mixes of the G, F, C, S and I Funds that shift toward G and F as their target year approaches, so a later-dated L Fund behaves like an equity fund and L Income like a bond-heavy one. The trend rule holds C alone or G alone, so it is not a like-for-like mix; the comparison shows what each approach returned and how far it fell on the same official prices. Funds marked in amber opened after the window began and are measured from their first day. Not financial advice.
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
