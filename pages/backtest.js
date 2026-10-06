import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { readCoverage } from "../lib/settings";
import Head from "next/head";
import ShareMeta from "../components/ShareMeta";
import Link from "next/link";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

// Chart series colours, validated for the dark surface (#070d1a) with the
// dataviz palette checks: lightness band, chroma, CVD separation, contrast.
const SERIES = [
  { key: "trend", label: "Trend rule (C or G)", color: "#16a34a" },
  { key: "C", label: "Hold C Fund", color: "#2563eb" },
  { key: "composite", label: "Five-signal score", color: "#d97706" },
  { key: "G", label: "Hold G Fund", color: "#7c3aed" },
];
// Fund identity colours, shared with the dashboard cards.
const FUND_COLORS = { C: "#00ff88", S: "#00cfff", I: "#a78bfa", F: "#fbbf24", G: "#94a3b8" };
const FUND_NAMES = { C: "C Fund", S: "S Fund", I: "I Fund", F: "F Fund", G: "G Fund" };

const RANGES = [
  { key: "all", label: "SINCE 2004", start: undefined },
  { key: "10y", label: "10 YEARS", years: 10 },
  { key: "5y", label: "5 YEARS", years: 5 },
  { key: "3y", label: "3 YEARS", years: 3 },
  { key: "1y", label: "1 YEAR", years: 1 },
];

const pct = (x, digits = 1) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(digits)}%`;
const money = (x) => `$${Math.round(x).toLocaleString("en-US")}`;
const mono = "'Space Mono', monospace";

function startFor(range) {
  if (!range.years) return undefined;
  const d = new Date();
  d.setFullYear(d.getFullYear() - range.years);
  return d.toISOString().slice(0, 10);
}

function Stat({ label, value, sub, tone }) {
  const color = tone === "good" ? "#00ff88" : tone === "bad" ? "#ff4466" : "#e2e8f0";
  return (
    <div style={{ background: "rgba(15,23,42,0.9)", border: "1px solid #1e293b", borderRadius: 10, padding: "14px 16px", minWidth: 0 }}>
      <div style={{ fontSize: 9, color: "#475569", letterSpacing: 3, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function CurveTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const held = payload[0]?.payload?.held;
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, padding: "10px 12px", fontFamily: mono, fontSize: 11 }}>
      <div style={{ color: "#94a3b8", marginBottom: 6 }}>{label}{held ? ` · trend rule in ${FUND_NAMES[held]}` : ""}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{ width: 14, height: 2, background: p.color, display: "inline-block" }} />
          <span style={{ color: "#e2e8f0", fontWeight: 700, minWidth: 70, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(p.value)}</span>
          <span style={{ color: "#64748b" }}>{p.name}</span>
        </div>
      ))}
    </div>
  );
}

// Which fund the trend rule held over time, as one bar of coloured runs.
function HoldingsBand({ curve }) {
  const runs = useMemo(() => {
    const out = [];
    curve.forEach((p, i) => {
      const last = out[out.length - 1];
      if (last && last.held === p.held) last.end = i + 1;
      else out.push({ held: p.held, start: i, end: i + 1, from: p.date });
    });
    return out;
  }, [curve]);
  const n = curve.length || 1;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "6px 0 4px" }}>
        <span style={{ fontSize: 9, color: "#475569", letterSpacing: 3 }}>TREND RULE · FUND HELD</span>
        <span style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {["C", "G"].map((id) => (
            <span key={id} style={{ fontSize: 10, color: "#64748b", display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, background: FUND_COLORS[id], display: "inline-block", borderRadius: 2 }} />{id}
            </span>
          ))}
        </span>
      </div>
      <svg viewBox={`0 0 ${n} 12`} preserveAspectRatio="none" style={{ width: "100%", height: 14, display: "block", borderRadius: 3 }} role="img" aria-label="Fund held by the trend rule over time">
        {runs.map((r, i) => (
          <rect key={i} x={r.start} y={0} width={r.end - r.start} height={12} fill={FUND_COLORS[r.held]}>
            <title>{`${FUND_NAMES[r.held]} from ${r.from}`}</title>
          </rect>
        ))}
      </svg>
    </div>
  );
}

export default function Backtest() {
  const [rangeKey, setRangeKey] = useState("all");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const requestId = useRef(0);
  const load = useCallback(async (key) => {
    const id = ++requestId.current; // a later request wins, whatever order the responses arrive in
    setLoading(true);
    setError(null);
    const range = RANGES.find((r) => r.key === key) || RANGES[0];
    const start = startFor(range);
    try {
      const q = new URLSearchParams({ coverage: String(readCoverage()) });
      if (start) q.set("start", start);
      const res = await fetch(`/api/backtest?${q}`);
      const json = await res.json();
      if (id !== requestId.current) return;
      if (!res.ok) throw new Error(json.error || "Backtest failed");
      setResult(json);
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(rangeKey); }, [rangeKey, load]);

  const years = useMemo(() => {
    if (!result) return [];
    const byYear = {};
    const add = (key, rows) => rows.forEach((r) => { byYear[r.year] = { ...(byYear[r.year] || {}), [key]: r.ret }; });
    add("trend", result.strategies.trend.annual);
    add("C", result.benchmarks.C.annual);
    add("composite", result.strategies.composite.annual);
    return Object.entries(byYear).sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([year, v]) => ({ year, ...v }));
  }, [result]);

  const t = result?.strategies?.trend;
  const k = result?.strategies?.composite;
  const c = result?.benchmarks?.C;
  const keptShare = t && c && c.cagr > 0 ? t.cagr / c.cagr : 0;
  const h = result?.strategies?.hybrid;
  const showMix = h && result.coverage < 1;

  return (
    <>
      <Head>
        <title>Backtest · TSP Fund Signal Tracker</title>
        <meta name="description" content="How the trend rule and the five-signal score would have performed against holding the C Fund, on official tsp.gov prices" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        {ShareMeta({ title: "Rule Backtest · TSP Fund Signal Tracker", description: "The trend rule and the five-signal score replayed over 22 years of official tsp.gov prices against holding the C Fund.", path: "/backtest" })}
      </Head>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #070d1a; color: #e2e8f0; }
        @keyframes spin { to{transform:rotate(360deg)} }
        .bt-range button:focus-visible { outline: 2px solid #00ff88; outline-offset: 2px; }
        .bt-table { width: 100%; border-collapse: collapse; font-family: ${mono}; font-size: 11px; font-variant-numeric: tabular-nums; }
        .bt-table th, .bt-table td { padding: 6px 8px; text-align: right; border-bottom: 1px solid #0f172a; white-space: nowrap; }
        .bt-table th { color: #475569; font-weight: 400; letter-spacing: 1px; font-size: 9px; }
        .bt-table th:first-child, .bt-table td:first-child { text-align: left; }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
      `}</style>

      <main style={{ minHeight: "100vh", background: "#070d1a", padding: "32px 16px", fontFamily: mono }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #0f172a", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 9, color: "#334155", letterSpacing: 4, marginBottom: 6 }}>THRIFT SAVINGS PLAN</div>
              <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -1 }}>RULE <span style={{ color: "#00ff88" }}>BACKTEST</span></h1>
              <p style={{ fontSize: 11, color: "#334155", fontStyle: "italic", marginTop: 4 }}>
                Growth of $10,000 under the action rule and the five-signal score, on official tsp.gov share prices
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Link href="/crises" style={{ color: "#475569", fontSize: 10, letterSpacing: 2, textDecoration: "none", border: "1px solid #1e293b", padding: "6px 14px", borderRadius: 6 }}>CRISES</Link>
              <Link href="/" style={{ color: "#475569", fontSize: 10, letterSpacing: 2, textDecoration: "none", border: "1px solid #1e293b", padding: "6px 14px", borderRadius: 6 }}>← DASHBOARD</Link>
            </div>
          </div>

          {/* Range presets: one row, above everything they scope */}
          <div className="bt-range" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
            {RANGES.map((r) => (
              <button key={r.key} onClick={() => setRangeKey(r.key)} aria-pressed={rangeKey === r.key} style={{
                background: rangeKey === r.key ? "rgba(0,255,136,0.08)" : "transparent",
                border: `1px solid ${rangeKey === r.key ? "#00ff88" : "#1e293b"}`,
                color: rangeKey === r.key ? "#00ff88" : "#475569",
                fontFamily: mono, fontSize: 10, letterSpacing: 2, padding: "6px 12px", borderRadius: 6, cursor: "pointer",
              }}>{r.label}</button>
            ))}
          </div>

          {error ? (
            <div style={{ textAlign: "center", padding: 60, color: "#ff4466" }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>⚠</div>
              <div style={{ fontSize: 13 }}>{error}</div>
              <button onClick={() => load(rangeKey)} style={{ marginTop: 16, background: "transparent", border: "1px solid #ff4466", color: "#ff4466", fontFamily: mono, padding: "8px 20px", borderRadius: 6, cursor: "pointer" }}>Retry</button>
            </div>
          ) : !result ? (
            <div style={{ textAlign: "center", padding: 80, color: "#334155" }}>
              <div style={{ fontSize: 28, animation: "spin 1s linear infinite", display: "inline-block", marginBottom: 12 }}>◈</div>
              <div style={{ fontSize: 11, letterSpacing: 3 }}>REPLAYING {rangeKey === "all" ? "22 YEARS" : "HISTORY"}...</div>
            </div>
          ) : (
            <div style={{ opacity: loading ? 0.5 : 1, transition: "opacity 0.2s" }}>
              {/* Verdict */}
              <div style={{ background: "rgba(0,255,136,0.05)", border: "1px solid rgba(0,255,136,0.2)", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
                <div style={{ fontSize: 9, color: "#475569", letterSpacing: 3, marginBottom: 8 }}>◈ VERDICT · {result.start} TO {result.end}</div>
                <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7, fontFamily: "Georgia, serif" }}>
                  The trend rule turned $10,000 into {money(t.final)} against {money(c.final)} for holding the C Fund
                  {keptShare > 0 && keptShare < 1 ? `, keeping ${Math.round(keptShare * 100)}% of its compounding` : ""}
                  {" "}while the worst drawdown went from {pct(c.maxDrawdown)} to {pct(t.maxDrawdown)}. It switched {t.switches} times and sat in G for {Math.round(t.timeIn.G * 100)}% of the period.
                  {" "}The five-signal score on its own reached {money(k.final)} with {k.switches} switches, which is why it is shown as context rather than used as the action rule.
                </p>
              </div>

              {/* Stat tiles */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
                <Stat label="TREND RULE · CAGR" value={pct(t.cagr)} sub={`${money(t.final)} final`} tone={t.cagr >= c.cagr ? "good" : undefined} />
                <Stat label="C FUND · CAGR" value={pct(c.cagr)} sub={`${money(c.final)} final`} tone={c.cagr > t.cagr ? "good" : undefined} />
                <Stat label="TREND RULE · WORST DRAWDOWN" value={pct(t.maxDrawdown)} tone="bad" />
                <Stat label="C FUND · WORST DRAWDOWN" value={pct(c.maxDrawdown)} tone="bad" />
                {showMix && <Stat label={`YOUR MIX · RULE ON ${Math.round(result.coverage * 100)}%`} value={pct(h.cagr)} sub={`worst loss ${pct(h.maxDrawdown)} · ${money(h.final)} final`} tone="good" />}
              </div>

              {/* Equity curves */}
              <div style={{ background: "rgba(15,23,42,0.6)", border: "1px solid #1e293b", borderRadius: 12, padding: "16px 12px 10px", marginBottom: 20 }}>
                <div style={{ fontSize: 9, color: "#475569", letterSpacing: 3, marginBottom: 8, paddingLeft: 6 }}>GROWTH OF $10,000 · LOG SCALE</div>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={result.curve} margin={{ top: 8, right: 28, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#0f172a" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 10, fontFamily: mono }} tickLine={false} axisLine={{ stroke: "#1e293b" }}
                      tickFormatter={(d) => d.slice(0, 4)} minTickGap={40} />
                    <YAxis scale="log" domain={["auto", "auto"]} tick={{ fill: "#475569", fontSize: 10, fontFamily: mono }} tickLine={false} axisLine={false}
                      tickFormatter={(v) => `$${Math.round(v / 1000)}k`} width={48} />
                    <Tooltip content={<CurveTooltip />} cursor={{ stroke: "#334155", strokeWidth: 1 }} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: mono, color: "#94a3b8", paddingTop: 8 }} iconType="plainline" />
                    {SERIES.map((sr) => (
                      <Line key={sr.key} type="monotone" dataKey={sr.key} name={sr.label} stroke={sr.color} strokeWidth={sr.key === "trend" ? 2.5 : 2}
                        dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#070d1a" }} isAnimationActive={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
                <div style={{ padding: "0 6px" }}><HoldingsBand curve={result.curve} /></div>
              </div>

              {/* Annual returns + switches */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 20 }}>
                <div style={{ background: "rgba(15,23,42,0.6)", border: "1px solid #1e293b", borderRadius: 12, padding: 14, minWidth: 0 }}>
                  <div style={{ fontSize: 9, color: "#475569", letterSpacing: 3, marginBottom: 8 }}>RETURN BY YEAR</div>
                  <div style={{ overflowX: "auto" }}>
                    <table className="bt-table">
                      <thead><tr><th>YEAR</th><th>TREND RULE</th><th>C FUND</th><th>5-SIGNAL</th></tr></thead>
                      <tbody>
                        {years.map((y) => (
                          <tr key={y.year}>
                            <td style={{ color: "#94a3b8" }}>{y.year}</td>
                            {["trend", "C", "composite"].map((key) => (
                              <td key={key} style={{ color: y[key] == null ? "#334155" : y[key] < 0 ? "#ff4466" : "#e2e8f0" }}>{y[key] == null ? "—" : pct(y[key])}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ background: "rgba(15,23,42,0.6)", border: "1px solid #1e293b", borderRadius: 12, padding: 14, minWidth: 0 }}>
                  <div style={{ fontSize: 9, color: "#475569", letterSpacing: 3, marginBottom: 8 }}>TREND RULE · EVERY SWITCH · IN {FUND_NAMES[t.lastHeld]} NOW</div>
                  <div style={{ overflowX: "auto", maxHeight: 420, overflowY: "auto" }}>
                    <table className="bt-table">
                      <thead><tr><th>DATE</th><th>FROM</th><th>TO</th></tr></thead>
                      <tbody>
                        {t.recentSwitches.map((sw, i) => (
                          <tr key={i}>
                            <td style={{ color: "#94a3b8" }}>{sw.date}</td>
                            <td style={{ color: FUND_COLORS[sw.from] }}>{sw.from}</td>
                            <td style={{ color: FUND_COLORS[sw.to] }}>{sw.to}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ fontSize: 10, color: "#475569", marginTop: 10, lineHeight: 1.6 }}>
                    Trend rule time in C {Math.round(t.timeIn.C * 100)}% · G {Math.round(t.timeIn.G * 100)}%.
                    Five-signal score: {k.switches} switches, time in {Object.entries(k.timeIn).map(([id, share]) => `${id} ${Math.round(share * 100)}%`).join(" · ")}.
                  </div>
                </div>
              </div>

              {/* Live record: only results after the parameters were fixed */}
              {result.liveRecord && (() => {
                const lr = result.liveRecord;
                const longDate = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
                return (
                  <div style={{ background: "rgba(15,23,42,0.6)", border: "1px solid #1e293b", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
                    <div style={{ fontSize: 9, color: "#475569", letterSpacing: 3, marginBottom: 8 }}>◈ LIVE RECORD · SINCE THE RULE WAS FIXED ON {lr.adopted}</div>
                    {lr.days === 0 ? (
                      <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.7 }}>
                        Nothing yet. Everything above is a backtest; the live record starts with the first close after {longDate(lr.adopted)} and can never be tuned after the fact.
                      </div>
                    ) : (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                          <Stat label="RULE" value={pct(lr.trend.totalReturn)} sub={`worst ${pct(lr.trend.maxDrawdown)}`} />
                          {showMix && <Stat label={`YOUR MIX · ${Math.round(result.coverage * 100)}%`} value={pct(lr.hybrid.totalReturn)} sub={`worst ${pct(lr.hybrid.maxDrawdown)}`} />}
                          <Stat label="HOLD C" value={pct(lr.C.totalReturn)} sub={`worst ${pct(lr.C.maxDrawdown)}`} />
                          <Stat label="HOLD G" value={pct(lr.G.totalReturn)} />
                        </div>
                        <div style={{ fontSize: 10, color: "#475569", marginTop: 10, lineHeight: 1.6 }}>
                          {lr.days} trading {lr.days === 1 ? "day" : "days"} from the close of {longDate(lr.from)} to {longDate(lr.to)}, {lr.switches} {lr.switches === 1 ? "move" : "moves"}. Short live records say little; they are shown so the backtest can be checked against what actually happened.
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}

              {/* Rules */}
              <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.8, borderTop: "1px solid #0f172a", paddingTop: 14 }}>
                <div style={{ fontSize: 9, letterSpacing: 3, marginBottom: 6 }}>HOW THIS WAS REPLAYED</div>
                Trend rule: hold C while it closes more than {Math.round(result.trendRule.band * 100)}% above its {result.trendRule.n}-day average, move to G once it closes more than {Math.round(result.trendRule.band * 100)}% below, otherwise do nothing.
                Five-signal score: each day the funds are scored exactly as the dashboard scores them using the trailing {result.lookback} closes; move into the top-ranked fund when it reads BUY, to G when the held fund reads SELL.
                A shorter range starts the trend rule in whatever state it was actually in on that date; the five-signal score starts in G.
                Both act at the close after the signal and obey the TSP limit of two unrestricted interfund transfers per calendar month (further moves only into G).
                The rule&apos;s parameters were fixed on {result.trendRule.adopted || "2026-10-06"}; every result before that date is a backtest, and only results after it are a live record. Benchmarks reinvest nothing and pay no costs; neither do the rules. Past performance of a rule set does not predict its future, and this page is not financial advice.
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
