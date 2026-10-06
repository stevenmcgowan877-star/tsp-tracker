import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Head from "next/head";
import ShareMeta from "../components/ShareMeta";
import Link from "next/link";
import { ResponsiveContainer, ComposedChart, LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { EPISODES } from "../lib/episodes";
import { totalBalance, readStoredHoldings } from "../lib/holdings";
import { readCoverage, writeCoverage, COVERAGE_OPTIONS, pctLabel } from "../lib/settings";

// Colours validated for the dark surface (#070d1a): see pages/backtest.js.
const COLORS = { price: "#2563eb", sma: "#d97706", rule: "#16a34a", mix: "#d97706", inG: "rgba(148,163,184,0.18)" };
const mono = "'Space Mono', monospace";
const pct = (x, d = 1) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)}%`);
const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
const longDate = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—");

function Stat({ label, value, sub, tone }) {
  const color = tone === "good" ? "#00ff88" : tone === "bad" ? "#ff4466" : "#e2e8f0";
  return (
    <div style={{ background: "rgba(15,23,42,0.9)", border: "1px solid #1e293b", borderRadius: 10, padding: "12px 14px", minWidth: 0 }}>
      <div style={{ fontSize: 9, color: "#475569", letterSpacing: 3, marginBottom: 5 }}>{label}</div>
      <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#64748b", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function PriceTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, padding: "10px 12px", fontFamily: mono, fontSize: 11 }}>
      <div style={{ color: "#94a3b8", marginBottom: 6 }}>{label} · rule in {p.held === "G" ? "G Fund" : "C Fund"}</div>
      <Row color={COLORS.price} value={`$${p.cClose.toFixed(2)}`} name="C Fund close" />
      <Row color={COLORS.sma} value={`$${p.cSma.toFixed(2)}`} name="200-day average" />
      <Row color="#94a3b8" value={`${((p.cClose / p.cSma - 1) * 100).toFixed(1)}%`} name="vs average" />
    </div>
  );
}
function GrowthTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, padding: "10px 12px", fontFamily: mono, fontSize: 11 }}>
      <div style={{ color: "#94a3b8", marginBottom: 6 }}>{label}</div>
      {payload.map((s) => <Row key={s.dataKey} color={s.color} value={money(s.value)} name={s.name} />)}
    </div>
  );
}
function Row({ color, value, name }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
      <span style={{ width: 14, height: 2, background: color, display: "inline-block" }} />
      <span style={{ color: "#e2e8f0", fontWeight: 700, minWidth: 70, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{value}</span>
      <span style={{ color: "#64748b" }}>{name}</span>
    </div>
  );
}

export default function Crises() {
  const [id, setId] = useState(EPISODES[0].id);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [holdings, setHoldings] = useState(null);
  const [coverage, setCoverage] = useState(null);
  const requestId = useRef(0);

  useEffect(() => { setHoldings(readStoredHoldings()); setCoverage(readCoverage()); }, []);

  const changeCoverage = (c) => { setCoverage(c); writeCoverage(c); };

  const load = useCallback(async (episodeId, cov) => {
    const req = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/crisis?id=${encodeURIComponent(episodeId)}&coverage=${cov}`);
      const json = await res.json();
      if (req !== requestId.current) return;
      if (!res.ok) throw new Error(json.error || "Replay failed");
      setData(json);
    } catch (e) {
      if (req !== requestId.current) return;
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (coverage != null) load(id, coverage); }, [id, coverage, load]);

  // Chart rows: the G shading is an area that spans the price axis while the
  // rule is in G and is null otherwise, so it reads as a band behind the line.
  const rows = useMemo(() => {
    if (!data) return [];
    const max = Math.max(...data.curve.map((p) => Math.max(p.cClose, p.cSma))) * 1.02;
    return data.curve.map((p) => ({ ...p, gBand: p.held === "G" ? max : null }));
  }, [data]);

  const s = data?.stats;
  const st = data?.story;
  const total = holdings ? totalBalance(holdings) : 0;
  const showMix = data && data.coverage < 1;

  return (
    <>
      <Head>
        <title>Crisis Replays · TSP Fund Signal Tracker</title>
        <meta name="description" content="What the 200-day trend rule did through each market crisis since 2007, day by day, on official tsp.gov prices" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        {ShareMeta({ title: "Crisis Replays · TSP Fund Signal Tracker", description: "What the 200-day trend rule did through each market crisis since 2007, day by day.", path: "/crises" })}
      </Head>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #070d1a; color: #e2e8f0; }
        @keyframes spin { to{transform:rotate(360deg)} }
        .ep button:focus-visible { outline: 2px solid #00ff88; outline-offset: 2px; }
        .flips { width: 100%; border-collapse: collapse; font-family: ${mono}; font-size: 11px; font-variant-numeric: tabular-nums; }
        .flips th, .flips td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #0f172a; white-space: nowrap; }
        .flips th { color: #475569; font-weight: 400; letter-spacing: 1px; font-size: 9px; }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
      `}</style>

      <main style={{ minHeight: "100vh", background: "#070d1a", padding: "32px 16px", fontFamily: mono }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #0f172a", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 9, color: "#334155", letterSpacing: 4, marginBottom: 6 }}>THRIFT SAVINGS PLAN</div>
              <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -1 }}>CRISIS <span style={{ color: "#00ff88" }}>REPLAYS</span></h1>
              <p style={{ fontSize: 11, color: "#334155", fontStyle: "italic", marginTop: 4 }}>
                What the action rule did when it mattered, day by day, on official tsp.gov prices
              </p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Link href="/backtest" style={{ color: "#475569", fontSize: 10, letterSpacing: 2, textDecoration: "none", border: "1px solid #1e293b", padding: "6px 14px", borderRadius: 6 }}>BACKTEST</Link>
              <Link href="/" style={{ color: "#475569", fontSize: 10, letterSpacing: 2, textDecoration: "none", border: "1px solid #1e293b", padding: "6px 14px", borderRadius: 6 }}>← DASHBOARD</Link>
            </div>
          </div>

          <div className="ep" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
            {EPISODES.map((e) => (
              <button key={e.id} onClick={() => setId(e.id)} aria-pressed={id === e.id} style={{
                background: id === e.id ? "rgba(0,255,136,0.08)" : "transparent",
                border: `1px solid ${id === e.id ? "#00ff88" : "#1e293b"}`,
                color: id === e.id ? "#00ff88" : "#475569",
                fontFamily: mono, fontSize: 10, letterSpacing: 1, padding: "6px 12px", borderRadius: 6, cursor: "pointer",
              }}>{e.name.toUpperCase()}</button>
            ))}
          </div>
          <div className="ep" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: -10, marginBottom: 20 }}>
            <span style={{ fontSize: 9, letterSpacing: 2, color: "#64748b", marginRight: 4 }}>RULE MOVES</span>
            {COVERAGE_OPTIONS.map((c) => (
              <button key={c} onClick={() => changeCoverage(c)} aria-pressed={coverage === c} style={{
                background: coverage === c ? "rgba(0,255,136,0.08)" : "transparent",
                border: `1px solid ${coverage === c ? "#00ff88" : "#1e293b"}`,
                color: coverage === c ? "#00ff88" : "#64748b",
                fontFamily: mono, fontSize: 10, letterSpacing: 1, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
              }}>{pctLabel(c)}</button>
            ))}
            <span style={{ fontSize: 10, color: "#475569" }}>of the balance at each flip; the rest stays in C</span>
          </div>

          {error ? (
            <div style={{ textAlign: "center", padding: 60, color: "#ff4466" }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>⚠</div>
              <div style={{ fontSize: 13 }}>{error}</div>
              <button onClick={() => load(id, coverage ?? 1)} style={{ marginTop: 16, background: "transparent", border: "1px solid #ff4466", color: "#ff4466", fontFamily: mono, padding: "8px 20px", borderRadius: 6, cursor: "pointer" }}>Retry</button>
            </div>
          ) : !data ? (
            <div style={{ textAlign: "center", padding: 80, color: "#334155" }}>
              <div style={{ fontSize: 28, animation: "spin 1s linear infinite", display: "inline-block", marginBottom: 12 }}>◈</div>
              <div style={{ fontSize: 11, letterSpacing: 3 }}>REPLAYING...</div>
            </div>
          ) : (
            <div style={{ opacity: loading ? 0.5 : 1, transition: "opacity 0.2s" }}>
              {/* Story */}
              <div style={{ background: "rgba(0,255,136,0.05)", border: "1px solid rgba(0,255,136,0.2)", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
                <div style={{ fontSize: 9, color: "#475569", letterSpacing: 3, marginBottom: 8 }}>◈ {data.episode.name.toUpperCase()} · {data.start} TO {data.end}</div>
                <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7, fontFamily: "Georgia, serif" }}>
                  The C Fund peaked on {longDate(s.cPeakDate)} and fell {pct(s.cDrawdown)} to its low on {longDate(s.cTroughDate)}.
                  {st.exitDate
                    ? ` The rule moved to G on ${longDate(st.exitDate)}, ${pct(st.exitPctFromPeak)} from the peak${st.reentryDate ? `, and returned to C on ${longDate(st.reentryDate)}, ${pct(st.reentryPctFromTrough)} above the low` : ", and had not returned by the end of the window"}.`
                    : s.initialHeld === "G"
                      ? " The rule was already in G when the window opened."
                      : " The rule never left C: the decline stayed inside the 3% band around the 200-day average."}
                  {" "}Over the whole window the rule&apos;s worst loss was {pct(s.ruleDrawdown)} against {pct(s.cDrawdown)} for holding C, and $10,000 ended at {money(s.ruleFinal)} versus {money(s.holdCFinal)}.
                  {showMix && ` Moving ${pctLabel(data.coverage)} at each flip and leaving the rest in C, the worst loss was ${pct(s.mixDrawdown)} and $10,000 ended at ${money(s.mixFinal)}.`}
                  {total > 0 && (showMix
                    ? ` On your ${money(total)}, the worst loss would have been ${money(total * s.mixDrawdown)} with your mix and ${money(total * s.cDrawdown)} holding C.`
                    : ` On your ${money(total)}, those worst losses would have been ${money(total * s.ruleDrawdown)} under the rule and ${money(total * s.cDrawdown)} holding C.`)}
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
                <Stat label="RULE · WORST LOSS" value={pct(s.ruleDrawdown)} tone={s.ruleDrawdown > s.cDrawdown ? "good" : "bad"} />
                <Stat label="HOLD C · WORST LOSS" value={pct(s.cDrawdown)} tone="bad" />
                <Stat label="RULE · WINDOW RETURN" value={pct(s.ruleReturn)} sub={`${money(s.ruleFinal)} from $10,000`} tone={s.ruleReturn >= s.holdCReturn ? "good" : undefined} />
                <Stat label="HOLD C · WINDOW RETURN" value={pct(s.holdCReturn)} sub={`${money(s.holdCFinal)} from $10,000`} tone={s.holdCReturn > s.ruleReturn ? "good" : undefined} />
                {showMix && <Stat label={`YOUR MIX · ${pctLabel(data.coverage)} MOVED`} value={pct(s.mixDrawdown)} sub={`worst loss · ${pct(s.mixReturn)} over the window`} tone={s.mixDrawdown > s.cDrawdown ? "good" : "bad"} />}
              </div>

              {/* Price vs average, with G periods shaded */}
              <div style={{ background: "rgba(15,23,42,0.6)", border: "1px solid #1e293b", borderRadius: 12, padding: "16px 12px 10px", marginBottom: 16 }}>
                <div style={{ fontSize: 9, color: "#475569", letterSpacing: 3, marginBottom: 8, paddingLeft: 6 }}>C FUND VS ITS 200-DAY AVERAGE · SHADED WHILE THE RULE HELD G</div>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={rows} margin={{ top: 8, right: 28, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#0f172a" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 10, fontFamily: mono }} tickLine={false} axisLine={{ stroke: "#1e293b" }} tickFormatter={(d) => d.slice(0, 7)} minTickGap={50} />
                    <YAxis domain={["auto", "auto"]} tick={{ fill: "#475569", fontSize: 10, fontFamily: mono }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${Math.round(v)}`} width={48} />
                    <Tooltip content={<PriceTooltip />} cursor={{ stroke: "#334155", strokeWidth: 1 }} />
                    <Legend wrapperStyle={{ fontSize: 11, fontFamily: mono, color: "#94a3b8", paddingTop: 8 }} iconType="plainline" />
                    <Area type="step" dataKey="gBand" name="Rule in G Fund" fill={COLORS.inG} stroke="none" isAnimationActive={false} legendType="rect" connectNulls={false} />
                    <Line type="monotone" dataKey="cClose" name="C Fund close" stroke={COLORS.price} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#070d1a" }} isAnimationActive={false} />
                    <Line type="monotone" dataKey="cSma" name="200-day average" stroke={COLORS.sma} strokeWidth={2} dot={false} activeDot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Growth of $10k */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, marginBottom: 20 }}>
                <div style={{ background: "rgba(15,23,42,0.6)", border: "1px solid #1e293b", borderRadius: 12, padding: "16px 12px 10px", minWidth: 0 }}>
                  <div style={{ fontSize: 9, color: "#475569", letterSpacing: 3, marginBottom: 8, paddingLeft: 6 }}>GROWTH OF $10,000 THROUGH THE WINDOW</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={rows} margin={{ top: 8, right: 28, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#0f172a" vertical={false} />
                      <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 10, fontFamily: mono }} tickLine={false} axisLine={{ stroke: "#1e293b" }} tickFormatter={(d) => d.slice(0, 7)} minTickGap={50} />
                      <YAxis domain={["auto", "auto"]} tick={{ fill: "#475569", fontSize: 10, fontFamily: mono }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} width={52} />
                      <Tooltip content={<GrowthTooltip />} cursor={{ stroke: "#334155", strokeWidth: 1 }} />
                      <Legend wrapperStyle={{ fontSize: 11, fontFamily: mono, color: "#94a3b8", paddingTop: 8 }} iconType="plainline" />
                      <Line type="monotone" dataKey="trend" name="Trend rule" stroke={COLORS.rule} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                      {showMix && <Line type="monotone" dataKey="mix" name={`Your mix (${pctLabel(data.coverage)} moved)`} stroke={COLORS.mix} strokeWidth={2} dot={false} isAnimationActive={false} />}
                      <Line type="monotone" dataKey="C" name="Hold C Fund" stroke={COLORS.price} strokeWidth={2} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ background: "rgba(15,23,42,0.6)", border: "1px solid #1e293b", borderRadius: 12, padding: 14, minWidth: 0 }}>
                  <div style={{ fontSize: 9, color: "#475569", letterSpacing: 3, marginBottom: 8 }}>MOVES IN THIS WINDOW · {s.daysInG} OF {data.curve.length} DAYS IN G</div>
                  {data.flips.length ? (
                    <table className="flips">
                      <thead><tr><th>EXECUTED</th><th>MOVE</th><th>C CLOSE</th></tr></thead>
                      <tbody>
                        {data.flips.map((f, i) => {
                          const p = data.curve.find((q) => q.date === f.date);
                          return (
                            <tr key={i}>
                              <td style={{ color: "#94a3b8" }}>{f.date}</td>
                              <td style={{ color: f.to === "G" ? "#94a3b8" : "#00ff88" }}>{f.from} → {f.to}</td>
                              <td style={{ color: "#e2e8f0" }}>{p ? `$${p.cClose.toFixed(2)}` : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>No moves. The rule stayed in {s.initialHeld} throughout.</div>
                  )}
                  <div style={{ fontSize: 10, color: "#475569", marginTop: 10, lineHeight: 1.6 }}>
                    Moves execute at the close after the signal. Windows begin a few months before each peak and run past the recovery, so the round trip is visible.
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.8, borderTop: "1px solid #0f172a", paddingTop: 14 }}>
                The rule is the same one the dashboard runs: hold C while it closes more than 3% above its 200-day average, move to G once it closes more than 3% below. Each window starts the rule in whatever state it was actually in on that date. It is never early: by design it steps aside only after a decline has begun, and it returns only after a recovery is under way. Episodes with a fast V-shaped drop and rebound are where it costs the most. Not financial advice.
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
