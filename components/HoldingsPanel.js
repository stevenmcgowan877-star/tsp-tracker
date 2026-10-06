import { useEffect, useMemo, useState } from "react";
import { HOLDING_FUNDS, HOLDINGS_STORAGE_KEY, assessHoldings, transferTicket, readStoredHoldings, readTransfers, writeTransfers, processingDate, transfersThisMonth, MONTHLY_TRANSFER_LIMIT } from "../lib/holdings";

const mono = "'Space Mono', monospace";
const FUND_COLORS = { C: "#00ff88", S: "#00cfff", I: "#a78bfa", F: "#fbbf24", G: "#94a3b8", L: "#f472b6" };
const STORAGE_KEY = HOLDINGS_STORAGE_KEY;
const money = (x) => `${x < 0 ? "-" : ""}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
const signedMoney = (x) => `${x >= 0 ? "+" : "−"}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
const monthName = (ym, offset = 0) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
};

function writeStored(balances) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(balances));
  } catch {
    // Private mode or blocked storage: the panel still works for this visit.
  }
}

// Balances stay in this browser only (localStorage). Nothing is sent anywhere.
export default function HoldingsPanel({ trend, backtest, coverage }) {
  const [balances, setBalances] = useState({ C: "", S: "", I: "", F: "", G: "", L: "" });
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [transfers, setTransfers] = useState([]);
  useEffect(() => { setTransfers(readTransfers()); }, []);
  const budget = transfersThisMonth(transfers);
  const logTransfer = () => { const next = [...transfers, processingDate()]; setTransfers(next); writeTransfers(next); };
  const undoTransfer = () => { const next = transfers.slice(0, -1); setTransfers(next); writeTransfers(next); };

  useEffect(() => {
    const stored = readStoredHoldings();
    if (stored) {
      setBalances({ C: "", S: "", I: "", F: "", G: "", L: "", ...stored });
      setOpen(true);
    }
    setLoaded(true);
  }, []);

  const assessment = useMemo(() => assessHoldings(balances, trend, backtest, coverage), [balances, trend, backtest, coverage]);
  const remaining = budget.remaining;
  const ticket = useMemo(() => transferTicket(balances, trend, coverage, { remaining }), [balances, trend, coverage, remaining]);

  const update = (id, value) => {
    const next = { ...balances, [id]: value.replace(/[^\d.]/g, "") };
    setBalances(next);
    writeStored(next);
  };
  const clear = () => {
    const empty = { C: "", S: "", I: "", F: "", G: "", L: "" };
    setBalances(empty);
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  };

  if (!loaded) return null;

  return (
    <div style={{ background: "rgba(15,23,42,0.6)", border: "1px solid #1e293b", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 9, color: "#475569", letterSpacing: 3 }}>◈ YOUR BALANCES · STAYS IN THIS BROWSER</div>
        <button onClick={() => setOpen(!open)} aria-expanded={open} style={{
          background: "transparent", border: "1px solid #1e293b", color: "#64748b", fontFamily: mono, fontSize: 10,
          letterSpacing: 2, padding: "5px 12px", borderRadius: 6, cursor: "pointer",
        }}>{open ? "HIDE" : assessment.empty ? "ENTER BALANCES" : "EDIT"}</button>
      </div>

      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginTop: 12 }}>
          {HOLDING_FUNDS.map((id) => (
            <label key={id} style={{ display: "block", minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 9, letterSpacing: 2, color: FUND_COLORS[id], marginBottom: 4 }}>{id === "L" ? "L FUNDS $" : `${id} FUND $`}</span>
              <input
                id={`holding-${id}`}
                inputMode="decimal"
                value={balances[id]}
                onChange={(e) => update(id, e.target.value)}
                placeholder="0"
                style={{
                  width: "100%", background: "#070d1a", border: "1px solid #1e293b", borderRadius: 6, color: "#e2e8f0",
                  fontFamily: mono, fontSize: 13, padding: "7px 9px", fontVariantNumeric: "tabular-nums",
                }}
              />
            </label>
          ))}
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button onClick={clear} style={{ background: "transparent", border: "1px solid #1e293b", color: "#475569", fontFamily: mono, fontSize: 10, letterSpacing: 2, padding: "7px 12px", borderRadius: 6, cursor: "pointer" }}>CLEAR</button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 12, fontSize: 11, color: "#64748b" }}>
        <span style={{ fontSize: 9, letterSpacing: 2, color: "#475569" }}>TRANSFERS {budget.month}</span>
        <span style={{ fontFamily: mono, color: budget.remaining > 0 ? "#e2e8f0" : "#fbbf24" }}>
          {budget.used} of {MONTHLY_TRANSFER_LIMIT} used{budget.remaining === 0 ? " · only moves into G allowed until next month" : ""}
        </span>
        <button onClick={logTransfer} style={{ background: "transparent", border: "1px solid #1e293b", color: "#64748b", fontFamily: mono, fontSize: 10, letterSpacing: 1, padding: "4px 10px", borderRadius: 6, cursor: "pointer" }}>I MADE A TRANSFER</button>
        {transfers.length > 0 && (
          <button onClick={undoTransfer} style={{ background: "transparent", border: "none", color: "#475569", fontFamily: mono, fontSize: 10, cursor: "pointer", textDecoration: "underline" }}>undo</button>
        )}
      </div>

      {!assessment.empty && (
        <div style={{ marginTop: 14 }}>
          {/* Allocation bar */}
          <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", background: "#0f172a" }} role="img" aria-label="Allocation by fund">
            {HOLDING_FUNDS.map((id) => assessment.alloc[id] > 0 && (
              <div key={id} title={`${id} ${Math.round(assessment.alloc[id] * 100)}%`} style={{ width: `${assessment.alloc[id] * 100}%`, background: FUND_COLORS[id], borderRight: "2px solid #070d1a" }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6, fontSize: 10, color: "#64748b", fontFamily: mono }}>
            <span style={{ color: "#e2e8f0" }}>{money(assessment.total)} total</span>
            {HOLDING_FUNDS.map((id) => assessment.alloc[id] > 0 && (
              <span key={id}><span style={{ color: FUND_COLORS[id] }}>{id}</span> {Math.round(assessment.alloc[id] * 100)}%</span>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0, background: assessment.aligned == null ? "#475569" : assessment.aligned ? "#00ff88" : "#fbbf24", boxShadow: `0 0 8px ${assessment.aligned ? "#00ff88" : "#fbbf24"}` }} />
            <div style={{ fontSize: 13, color: "#94a3b8", fontFamily: "Georgia, serif", lineHeight: 1.6 }}>{assessment.message}</div>
          </div>

          {ticket?.needed && (
            <div style={{ marginTop: 12, border: "1px solid rgba(251,191,36,0.35)", background: "rgba(251,191,36,0.05)", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 9, letterSpacing: 2, color: "#fbbf24", marginBottom: 8 }}>TRANSFER TICKET · TSP.GOV → INTERFUND TRANSFER, BEFORE NOON ET</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontFamily: mono }}>
                {["C", "G"].map((id) => (
                  <span key={id} style={{ border: `1px solid ${FUND_COLORS[id]}`, color: FUND_COLORS[id], borderRadius: 6, padding: "4px 10px", fontSize: 14, fontWeight: 700 }}>{id} {ticket.percents[id]}%</span>
                ))}
                <span style={{ fontSize: 11, color: "#64748b" }}>every other fund 0%</span>
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8, fontFamily: mono, display: "flex", gap: 12, flexWrap: "wrap" }}>
                {ticket.changes.map((m) => (
                  <span key={m.fund}><span style={{ color: FUND_COLORS[m.fund] }}>{m.fund}</span> {signedMoney(m.change)}</span>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8, lineHeight: 1.6 }}>
                {ticket.blocked
                  ? `Both transfers for ${monthName(budget.month)} are used and this one buys C, so it has to wait until ${monthName(budget.month, 1)}. Until then, point new contributions at C with a contribution allocation, which is unlimited.`
                  : ticket.partial
                    ? `Both transfers for ${monthName(budget.month)} are used, so this version only moves money into G, which is still allowed. It keeps C at ${ticket.percents.C}% instead of the target ${ticket.targetC}%; top C up in ${monthName(budget.month, 1)}. `
                    : budget.remaining === 0
                      ? `Both transfers for ${monthName(budget.month)} are used, but this one only moves money into G, which is still allowed. `
                      : `This counts as one of your ${MONTHLY_TRANSFER_LIMIT} transfers for ${monthName(budget.month)} (${budget.remaining - 1} left after it)${ticket.intoGOnly ? ". Once both are used, moves into G are still allowed but moves back into C are not" : ""}. `}
                {!ticket.blocked && "Then set your contribution allocation to the same split; it is unlimited and does not count. Press “I made a transfer” once it is submitted."}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 12 }}>
            {assessment.cushionDollars != null && (
              <Tile label="ROOM BEFORE THE SELL TRIGGER" value={money(assessment.cushionDollars)} sub={`${(assessment.cushionPct * 100).toFixed(1)}% of your C balance`} />
            )}
            {assessment.worstCase && (
              <>
                <Tile label="WORST LOSS, RULE (SINCE 2004)" value={money(assessment.worstCase.rule)} sub={`${(assessment.worstCase.ruleCagr * 100).toFixed(1)}% a year`} tone="bad" />
                <Tile label="WORST LOSS, HOLD C (SINCE 2004)" value={money(assessment.worstCase.holdC)} sub={`${(assessment.worstCase.holdCagr * 100).toFixed(1)}% a year`} tone="bad" />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, sub, tone }) {
  return (
    <div style={{ background: "rgba(7,13,26,0.6)", border: "1px solid #1e293b", borderRadius: 8, padding: "9px 11px", minWidth: 0 }}>
      <div style={{ fontSize: 8, color: "#475569", letterSpacing: 2, marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: mono, fontSize: 15, fontWeight: 700, color: tone === "bad" ? "#ff4466" : "#e2e8f0", fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
