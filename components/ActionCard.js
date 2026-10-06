import Link from "next/link";

const mono = "'Space Mono', monospace";

// The one card that tells the reader what to do: the slow trend rule on the
// C Fund. Everything else on the dashboard is context.
export default function ActionCard({ trend }) {
  if (!trend) return null;

  if (!trend.available) {
    return (
      <div style={{ background: "rgba(15,23,42,0.9)", border: "1px solid #1e293b", borderRadius: 12, padding: "18px 22px", marginBottom: 16 }}>
        <div style={{ fontSize: 9, color: "#475569", letterSpacing: 3, marginBottom: 8 }}>◈ ACTION RULE · 200-DAY TREND ON THE C FUND</div>
        <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.7 }}>
          Not enough price history to evaluate the rule ({trend.reason}). It needs official tsp.gov prices; the proxy feed only carries 100 days.
        </div>
      </div>
    );
  }

  const on = trend.state === "ON";
  const color = on ? "#00ff88" : "#94a3b8";
  const bandPct = (trend.band * 100).toFixed(0);
  const distance = Math.abs(trend.pctVsSma).toFixed(1);
  const cushion = on
    ? `${(((trend.price - trend.sellTrigger) / trend.price) * 100).toFixed(1)}% fall`
    : `${(((trend.buyTrigger - trend.price) / trend.price) * 100).toFixed(1)}% rise`;

  return (
    <div style={{
      background: on ? "linear-gradient(135deg, rgba(0,255,136,0.07) 0%, rgba(0,207,255,0.03) 100%)" : "rgba(148,163,184,0.05)",
      border: `1px solid ${on ? "rgba(0,255,136,0.3)" : "rgba(148,163,184,0.3)"}`,
      borderRadius: 12, padding: "20px 24px", marginBottom: 16, position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: `radial-gradient(circle, ${on ? "rgba(0,255,136,0.08)" : "rgba(148,163,184,0.06)"} 0%, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ fontSize: 9, color: "#475569", letterSpacing: 3, marginBottom: 12 }}>◈ ACTION RULE · {trend.n}-DAY TREND ON THE C FUND · AS OF {trend.asOf}</div>

      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: color, boxShadow: `0 0 12px ${color}` }} />
          <span style={{ fontFamily: mono, fontSize: 30, fontWeight: 700, color, letterSpacing: -1 }}>
            {on ? "BE IN C" : "BE IN G"}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 220, color: "#94a3b8", fontSize: 13, lineHeight: 1.65, fontFamily: "Georgia, serif" }}>
          {on
            ? `The C Fund closed ${distance}% above its ${trend.n}-day average. Stay in C. Move everything to G only if it closes below $${trend.sellTrigger.toFixed(2)}, a ${cushion} from here.`
            : `The C Fund closed ${distance}% below its ${trend.n}-day average. Stay in G. Move back to C only if it closes above $${trend.buyTrigger.toFixed(2)}, a ${cushion} from here.`}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginTop: 16 }}>
        {[
          ["C FUND CLOSE", `$${trend.price.toFixed(2)}`],
          [`${trend.n}-DAY AVERAGE`, `$${trend.sma.toFixed(2)}`],
          ["VS AVERAGE", `${trend.pctVsSma > 0 ? "+" : ""}${trend.pctVsSma.toFixed(1)}%`],
          [on ? "SELL TRIGGER" : "BUY TRIGGER", `$${(on ? trend.sellTrigger : trend.buyTrigger).toFixed(2)}`],
          ["IN THIS STATE SINCE", trend.since],
        ].map(([k, v]) => (
          <div key={k} style={{ background: "rgba(7,13,26,0.6)", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 10px", minWidth: 0 }}>
            <div style={{ fontSize: 8, color: "#475569", letterSpacing: 2, marginBottom: 3 }}>{k}</div>
            <div style={{ fontFamily: mono, fontSize: 13, color: "#e2e8f0", fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, fontSize: 10, color: "#475569", lineHeight: 1.7 }}>
        Checked on every close, acted on at the next close: a TSP interfund transfer requested before noon ET settles that day. A ±{bandPct}% band around the average avoids whipsaw; this rule switched {trend.flipCount} times since 2004.{" "}
        <Link href="/backtest" style={{ color: "#64748b" }}>See the 22-year replay →</Link>
      </div>
    </div>
  );
}
