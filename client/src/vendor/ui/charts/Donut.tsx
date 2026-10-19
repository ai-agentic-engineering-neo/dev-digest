/* Donut — ring chart with a legend, on Recharts. */
import React from "react";
import { PieChart, Pie, Cell } from "recharts";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export function Donut({
  segments,
  size = 130,
  stroke = 22,
  valuePrefix = "$",
  formatValue = (v: number) => `${valuePrefix}${v.toFixed(2)}`,
}: {
  segments: DonutSegment[];
  size?: number;
  stroke?: number;
  valuePrefix?: string;
  /** Legend value text; defaults to `${valuePrefix}${value.toFixed(2)}` (money). */
  formatValue?: (value: number) => string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <PieChart width={size} height={size}>
        <Pie
          data={segments}
          dataKey="value"
          nameKey="label"
          cx="50%"
          cy="50%"
          innerRadius={(size - stroke) / 2 - stroke / 2}
          outerRadius={(size - stroke) / 2 + stroke / 2}
          startAngle={90}
          endAngle={-270}
          isAnimationActive={false}
          stroke="none"
        >
          {segments.map((s, i) => (
            <Cell key={i} fill={s.color} />
          ))}
        </Pie>
      </PieChart>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color }} />
            <span style={{ color: "var(--text-secondary)", flex: 1 }}>{s.label}</span>
            <span className="mono tnum" style={{ color: "var(--text-primary)", fontWeight: 600 }}>
              {formatValue(s.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
