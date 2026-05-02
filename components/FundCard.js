import { useState } from "react";
import MiniChart from "./MiniChart";

function SignalBadge({ signal }) {
  const cfg = {
    BUY:   { color: "#00ff88", bg: "#00ff8818", border: "#00ff8844", label: "SWITCH IN" },
    HOLD:  { color: "#fbbf24", bg: "#fbbf2418", border: "#fbbf2444", label: "HOLD" },
    AVOID: { color: "#ff4466", bg: "#ff446618", border: "#ff446644", label: "SWITCH OUT" },
  }[signal] || {};
  return (
    <span style={{
      fontFamily: "monospace", fontSize: 10, fontWeight: 700, letterSpacing: 2,
      padding: "4px 10px", borderRadius: 20,
      color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`,
      display: "inline-flex", alignItems: "center", gap: 6,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color, display: "inline-block", boxShadow: `0 0 6px ${cfg.color}` }} />
      {cfg.label}
    </span>
  );
}

function ScoreBar({ label, value }) {
  const pct = ((value + 1) / 2) * 100;
  const color = value > 0.2 ? "#00ff88" : value < -0.2 ? "#ff4466" : "#fbbf24";
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>{label}</span>
        <span style={{ fontSize: 10, color, fontFamily: "monospace" }}>{value > 0 ? "+" : ""}{(value * 100).toFixed(0)}</span>
      </div>
      <div style={{ height: 3, background: "#1e293b", borderRadius: 2 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.8s ease" }} />
      </div>
    </div>
  );
}

export default function FundCard({ fund }) {
  const [open, setOpen] = useState(false);
  const up = parseFloat(fund.change) >= 0;

  return (
    <div
      onClick={() => setOpen(!open)}
      style={{
        background: open ? `${fund.color}08` : "rgba(15,23,42,0.9)",
        border: `1px solid ${open ? fund.color + "44" : "#1e293b"}`,
        borderRadius: 12, padding: "18px 20px", cursor: "pointer",
        transition: "all 0.25s ease",
        boxShadow: open ? `0 0 24px ${fund.color}12` : "none",
      }}
    >
      {/* Top row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "monospace", fontSize: 24, fontWeight: 700, color: fund.color, letterSpacing: -1 }}>{fund.id}</span>
            <span style={{ color: "#475569", fontSize: 12, fontFamily: "monospace" }}>{fund.name}</span>
            {fund.source === "demo" && (
              <span style={{ fontSize: 9, color: "#fbbf24", background: "#fbbf2415", border: "1px solid #fbbf2430", padding: "2px 6px", borderRadius: 4, fontFamily: "monospace", letterSpacing: 1 }}>DEMO</span>
            )}
          </div>
          <div style={{ color: "#334155", fontSize: 11, fontStyle: "italic", marginTop: 2 }}>{fund.desc} · via {fund.proxy}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "monospace", fontSize: 18, color: "#e2e8f0" }}>${fund.current?.toFixed(2)}</div>
          <div style={{ fontSize: 11, fontFamily: "monospace", color: up ? "#00ff88" : "#ff4466" }}>
            {up ? "▲" : "▼"} {Math.abs(fund.change)}%
          </div>
        </div>
      </div>

      {/* Chart row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: open ? 16 : 0 }}>
        <div style={{ flex: 1 }}><MiniChart prices={fund.prices} color={fund.color} /></div>
        <SignalBadge signal={fund.signal} />
      </div>

      {/* Expanded detail */}
      {open && (
        <div style={{ borderTop: "1px solid #1e293b", paddingTop: 16, animation: "fadeIn 0.3s ease" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Signal breakdown */}
            <div>
              <div style={{ fontSize: 9, color: "#475569", fontFamily: "monospace", letterSpacing: 3, marginBottom: 10 }}>SIGNAL BREAKDOWN</div>
              <ScoreBar label="Moving Averages" value={fund.maScore} />
              <ScoreBar label="RSI Momentum" value={fund.rsiScore} />
              <ScoreBar label="MACD Histogram" value={fund.macdScore} />
              <ScoreBar label="Supply / Demand" value={fund.sdScore} />
            </div>

            {/* Key levels */}
            <div>
              <div style={{ fontSize: 9, color: "#475569", fontFamily: "monospace", letterSpacing: 3, marginBottom: 10 }}>KEY LEVELS</div>
              {[
                ["SMA 20", fund.sma20?.toFixed(2)],
                ["SMA 50", fund.sma50?.toFixed(2)],
                ["SMA 200", fund.sma200?.toFixed(2)],
                ["RSI (14)", fund.rsi],
                ["MACD", fund.macd],
                ["20D High", fund.high20?.toFixed(2)],
                ["20D Low", fund.low20?.toFixed(2)],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 10, color: "#475569", fontFamily: "monospace" }}>{k}</span>
                  <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Zone badges */}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {fund.inDemandZone && (
              <span style={{ fontSize: 10, color: "#00ff88", background: "#00ff8815", border: "1px solid #00ff8830", padding: "3px 10px", borderRadius: 6, fontFamily: "monospace" }}>◆ DEMAND ZONE</span>
            )}
            {fund.inSupplyZone && (
              <span style={{ fontSize: 10, color: "#ff4466", background: "#ff446615", border: "1px solid #ff446630", padding: "3px 10px", borderRadius: 6, fontFamily: "monospace" }}>◆ SUPPLY ZONE</span>
            )}
          </div>

          {/* Composite bar */}
          <div style={{ marginTop: 14, background: "#0f172a", borderRadius: 8, padding: "12px 14px", border: `1px solid ${fund.composite > 0.25 ? "#00ff8830" : fund.composite < -0.25 ? "#ff446630" : "#fbbf2430"}` }}>
            <div style={{ fontSize: 9, color: "#475569", fontFamily: "monospace", letterSpacing: 3, marginBottom: 6 }}>COMPOSITE SCORE</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, height: 6, background: "#1e293b", borderRadius: 3 }}>
                <div style={{
                  height: "100%", borderRadius: 3, transition: "width 0.8s ease",
                  width: `${((fund.composite + 1) / 2) * 100}%`,
                  background: fund.composite > 0.25 ? "#00ff88" : fund.composite < -0.25 ? "#ff4466" : "#fbbf24",
                }} />
              </div>
              <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: fund.composite > 0.25 ? "#00ff88" : fund.composite < -0.25 ? "#ff4466" : "#fbbf24" }}>
                {fund.composite > 0 ? "+" : ""}{(fund.composite * 100).toFixed(0)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
