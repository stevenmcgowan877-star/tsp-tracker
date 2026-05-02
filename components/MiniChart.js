import { ResponsiveContainer, AreaChart, Area, YAxis, Tooltip } from "recharts";

export default function MiniChart({ prices, color }) {
  if (!prices || prices.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={48}>
      <AreaChart data={prices} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis domain={["auto", "auto"]} hide />
        <Tooltip
          contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6, fontSize: 11, fontFamily: "monospace" }}
          labelFormatter={(i) => prices[i]?.date || ""}
          formatter={(v) => [`$${v.toFixed(2)}`, ""]}
        />
        <Area
          type="monotone"
          dataKey="close"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#grad-${color.replace("#", "")})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
