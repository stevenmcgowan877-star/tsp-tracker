import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Head from "next/head";
import ShareMeta from "../components/ShareMeta";
import Link from "next/link";
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from "recharts";
import { totalBalance, readStoredHoldings } from "../lib/holdings";
import { readCoverage, writeCoverage, COVERAGE_OPTIONS, pctLabel } from "../lib/settings";

// Colours validated for the dark surface (#070d1a): see pages/backtest.js.
const COLORS = { rule: "#16a34a", C: "#2563eb", G: "#7c3aed" };
const mono = "'Space Mono', monospace";
const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
const short = (x) => (Math.abs(x) >= 1e6 ? `$${(x / 1e6).toFixed(1)}M` : `$${Math.round(x / 1000)}k`);
const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
const STORAGE_KEY = "tsp-tracker:plan:v2";
const LEGACY_STORAGE_KEY = "tsp-tracker:plan";
const BLOCKS = [
  { value: 60, label: "3 MONTHS" },
  { value: 250, label: "1 YEAR" },
  { value: 750, label: "3 YEARS" },
];
const DEFAULTS = { balance: "", salary: "100000", pct: "5", contribution: "", age: "45", years: 20, retireYears: 30, withdrawalRate: "4", block: 250 };

// Saved inputs; the first planner stored { balance, contribution, years }
// under the old key, which carries over as a flat per-pay-period amount.
function readStored() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    const old = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!old) return null;
    const { balance, contribution, years } = JSON.parse(old) || {};
    const out = {};
    if (balance != null) out.balance = String(balance);
    if (Number(contribution) > 0) { out.contribution = String(contribution); out.salary = ""; }
    if (Number.isFinite(Number(years))) out.years = Math.max(1, Math.min(40, Math.round(Number(years))));
    return out;
  } catch {
    return null;
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
      <div style={{ color: "#94a3b8", marginBottom: 6 }}>Year {label}{p.phase ? ` · ${p.phase}` : ""}</div>
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

function Field({ id, label, value, onChange, suffix }) {
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <span style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#64748b", marginBottom: 4 }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input id={id} inputMode="decimal" value={value} onChange={onChange} style={inputStyle} />
        {suffix && <span style={{ fontSize: 11, color: "#475569" }}>{suffix}</span>}
      </span>
    </label>
  );
}

function Toggle({ options, value, onChange, format }) {
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      {options.map((o) => {
        const v = typeof o === "object" ? o.value : o;
        const label = typeof o === "object" ? o.label : format(o);
        return (
          <button key={v} onClick={() => onChange(v)} aria-pressed={value === v} style={{
            background: value === v ? "rgba(0,255,136,0.08)" : "transparent",
            border: `1px solid ${value === v ? "#00ff88" : "#1e293b"}`,
            color: value === v ? "#00ff88" : "#64748b",
            fontFamily: mono, fontSize: 10, letterSpacing: 1, padding: "5px 10px", borderRadius: 6, cursor: "pointer",
          }}>{label}</button>
        );
      })}
    </span>
  );
}

export default function Plan() {
  const [inputs, setInputs] = useState(DEFAULTS);
  const [coverage, setCoverage] = useState(0.75);
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  useEffect(() => {
    const stored = readStored();
    const holdings = readStoredHoldings();
    const fromHoldings = holdings ? totalBalance(holdings) : 0;
    setInputs({ ...DEFAULTS, ...(stored || {}), balance: stored?.balance ?? (fromHoldings > 0 ? String(Math.round(fromHoldings)) : "100000") });
    setCoverage(readCoverage());
    setLoaded(true);
  }, []);

  const load = useCallback(async (inp, cov) => {
    const req = ++requestId.current;
    setLoading(true);
    setError(null);
    const q = new URLSearchParams({
      balance: Number(inp.balance) || 0, salary: Number(inp.salary) || 0, pct: Number(inp.pct) || 0, contribution: Number(inp.contribution) || 0, age: Number(inp.age) || 0,
      years: inp.years, retireYears: inp.retireYears, withdrawalRate: Number(inp.withdrawalRate) || 0, coverage: cov, block: inp.block,
    });
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

  useEffect(() => {
    if (!loaded) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs)); } catch { /* ignore */ }
    const t = setTimeout(() => load(inputs, coverage), 450);
    return () => clearTimeout(t);
  }, [inputs, coverage, loaded, load]);

  const setText = (key) => (e) => setInputs((prev) => ({ ...prev, [key]: e.target.value.replace(/[^\d.]/g, "") }));
  const setNum = (key) => (e) => setInputs((prev) => ({ ...prev, [key]: Number(e.target.value) }));
  const changeCoverage = (c) => { setCoverage(c); writeCoverage(c); };

  const rows = useMemo(() => {
    if (!data) return [];
    const { trend, C, G } = data.strategies;
    return trend.yearly.map((y, i) => ({
      year: y.year, phase: y.year <= data.years ? "working" : "retired",
      ruleBand: [y.p10, y.p90], rule: y.p50, C: C.yearly[i].p50, G: G.yearly[i].p50,
    }));
  }, [data]);

  const t = data?.strategies?.trend;
  const c = data?.strategies?.C;
  const g = data?.strategies?.G;
  const retiring = data && data.retireYears > 0;
  const ageAtRetire = data?.age ? data.age + data.years : null;

  return (
    <>
      <Head>
        <title>Planner · TSP Fund Signal Tracker</title>
        <meta name="description" content="A range of TSP outcomes through your working years and retirement under the trend rule, holding C and holding G" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        {ShareMeta({ title: "Planner · TSP Fund Signal Tracker", description: "A range of TSP outcomes through your working years and retirement under the trend rule, holding C and holding G.", path: "/plan" })}
      </Head>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #070d1a; color: #e2e8f0; }
        .pl input:focus-visible, .pl button:focus-visible { outline: 2px solid #00ff88; outline-offset: 2px; }
        .pl input[type=range] { accent-color: #00ff88; width: 100%; }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
      `}</style>

      <main className="pl" style={{ minHeight: "100vh", background: "#070d1a", padding: "32px 16px", fontFamily: mono }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid #0f172a", display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 9, color: "#334155", letterSpacing: 4, marginBottom: 6 }}>THRIFT SAVINGS PLAN</div>
              <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -1 }}>RETIREMENT <span style={{ color: "#00ff88" }}>PLANNER</span></h1>
              <p style={{ fontSize: 11, color: "#334155", fontStyle: "italic", marginTop: 4 }}>
                Your working years and retirement, from resampled official tsp.gov history
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
              <Field id="plan-balance" label="BALANCE TODAY $" value={inputs.balance} onChange={setText("balance")} />
              <Field id="plan-salary" label="ANNUAL SALARY $" value={inputs.salary} onChange={setText("salary")} />
              <Field id="plan-pct" label="YOU CONTRIBUTE" value={inputs.pct} onChange={setText("pct")} suffix="% of pay" />
              <Field id="plan-flat" label="OR $ PER PAYCHECK · SALARY BLANK" value={inputs.contribution} onChange={setText("contribution")} />
              <Field id="plan-age" label="AGE TODAY" value={inputs.age} onChange={setText("age")} />
              <Field id="plan-wr" label="FIRST-YEAR WITHDRAWAL" value={inputs.withdrawalRate} onChange={setText("withdrawalRate")} suffix="% of balance" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginTop: 14 }}>
              <label style={{ display: "block", minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#64748b", marginBottom: 4 }}>YEARS UNTIL RETIREMENT · {inputs.years}</span>
                <input id="plan-years" type="range" min="1" max="40" value={inputs.years} onChange={setNum("years")} />
              </label>
              <label style={{ display: "block", minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 9, letterSpacing: 2, color: "#64748b", marginBottom: 4 }}>YEARS IN RETIREMENT · {inputs.retireYears}</span>
                <input id="plan-retire" type="range" min="0" max="40" value={inputs.retireYears} onChange={setNum("retireYears")} />
              </label>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 14, alignItems: "center" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 9, letterSpacing: 2, color: "#64748b" }}>RULE MOVES</span>
                <Toggle options={COVERAGE_OPTIONS} value={coverage} onChange={changeCoverage} format={pctLabel} />
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 9, letterSpacing: 2, color: "#64748b" }}>HISTORY CHUNKS</span>
                <Toggle options={BLOCKS} value={inputs.block} onChange={(v) => setInputs((p) => ({ ...p, block: v }))} />
              </span>
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
                <div style={{ fontSize: 9, color: "#475569", letterSpacing: 3, marginBottom: 8 }}>
                  ◈ {data.years} YEARS WORKING{retiring ? ` · ${data.retireYears} RETIRED` : ""} · {data.paths} FUTURES · RULE ON {pctLabel(data.coverage)} · STARTS {data.startState === "ON" ? "IN C" : "IN G"}
                </div>
                <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.7, fontFamily: "Georgia, serif" }}>
                  {data.salary > 0
                    ? `Contributing ${pct(data.pct, 0)} of ${money(data.salary)} adds ${money(data.employeeTotal)} of your own money and ${money(data.agencyTotal)} from your agency over ${data.years} years. `
                    : `You add ${money(data.contributed)} over ${data.years} years (a flat amount every two weeks). `}
                  {`At retirement the middle outcome is ${money(t.retire.p50)} with the rule on ${pctLabel(data.coverage)} of the balance, against ${money(c.retire.p50)} holding C. `}
                  {retiring
                    ? `Drawing ${pct(data.withdrawalRate, 1)} in the first year and 2.5% more each year after${data.rmdAge ? `, with required minimum distributions from age ${data.rmdAge}` : ""}, the money runs out in ${pct(t.depletedShare)} of futures under the rule, ${pct(c.depletedShare)} holding C and ${pct(g.depletedShare)} holding G. In the bad case (10th percentile) you end with ${money(t.final.p10)} under the rule versus ${money(c.final.p10)} holding C.`
                    : `The rule ends ahead of holding C in ${pct(data.ruleBeatsC)} of futures and within 20% of it in ${pct(data.ruleWithin20pctOfC)}.`}
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
                <Stat label={`RULE · AT RETIREMENT${ageAtRetire ? ` (AGE ${ageAtRetire})` : ""}`} value={money(t.retire.p50)} sub={`bad case ${money(t.retire.p10)}`} />
                <Stat label="HOLD C · AT RETIREMENT" value={money(c.retire.p50)} sub={`bad case ${money(c.retire.p10)}`} />
                {retiring ? (
                  <>
                    <Stat label="RULE · MONEY RUNS OUT" value={pct(t.depletedShare)} sub={`bad-case end ${money(t.final.p10)}`} tone={t.depletedShare <= c.depletedShare ? "good" : "bad"} />
                    <Stat label="HOLD C · MONEY RUNS OUT" value={pct(c.depletedShare)} sub={`bad-case end ${money(c.final.p10)}`} tone={c.depletedShare < t.depletedShare ? "good" : "bad"} />
                  </>
                ) : (
                  <>
                    <Stat label="RULE · TYPICAL WORST FALL" value={pct(t.worstDrawdown.p50)} sub={`bad case ${pct(t.worstDrawdown.p10)}`} tone="bad" />
                    <Stat label="HOLD C · TYPICAL WORST FALL" value={pct(c.worstDrawdown.p50)} sub={`bad case ${pct(c.worstDrawdown.p10)}`} tone="bad" />
                  </>
                )}
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
                    {retiring && <ReferenceLine x={data.years} stroke="#334155" strokeDasharray="4 4" label={{ value: "retire", fill: "#475569", fontSize: 10, position: "insideTopRight" }} />}
                    <Area type="monotone" dataKey="ruleBand" name="Rule, likely range" fill={COLORS.rule} fillOpacity={0.18} stroke="none" isAnimationActive={false} legendType="rect" />
                    <Line type="monotone" dataKey="rule" name="Rule, median" stroke={COLORS.rule} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="C" name="Hold C, median" stroke={COLORS.C} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="G" name="Hold G, median" stroke={COLORS.G} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.8, borderTop: "1px solid #0f172a", paddingTop: 14 }}>
                <div style={{ fontSize: 9, letterSpacing: 3, marginBottom: 6 }}>HOW TO READ THIS</div>
                Each future strings together chunks of the real daily C and G Fund history since 2003, drawn at random. Short chunks scramble multi-year trends, which works against a trend rule; three-year chunks keep more of how markets actually move but reuse more of the same history. The rule runs on each future exactly as on the dashboard, on the share of the balance you choose, starting in its real current state. Working years: 26 deposits a year at your contribution rate, capped at the 2026 limit ($24,500, plus $8,000 from age 50 or $11,250 at ages 60 to 63), with the FERS automatic 1% and a match on the first 5% that stops in any pay period you have hit the limit. Retirement: the first-year withdrawal grows 2.5% a year, is at least the required minimum distribution, and is taken pro rata from every fund held, as the TSP pays it. Salary and limits are held flat; dollars are nominal; there are no taxes or fees. Not financial advice.
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}

const inputStyle = {
  width: "100%", minWidth: 0, background: "#070d1a", border: "1px solid #1e293b", borderRadius: 6, color: "#e2e8f0",
  fontFamily: mono, fontSize: 14, padding: "8px 10px", fontVariantNumeric: "tabular-nums",
};
