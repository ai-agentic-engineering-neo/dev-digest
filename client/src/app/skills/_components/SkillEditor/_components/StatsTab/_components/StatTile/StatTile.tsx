/* StatTile — KPI tile for the skill Stats tab (label, big value, optional unit
   and an optional 0..1 progress ring, as in the design's ACCEPT RATE tile). */
import React from "react";

const RING = 26;
const STROKE = 3;

function Ring({ value, color }: { value: number; color: string }) {
  const r = (RING - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <svg width={RING} height={RING} role="img" aria-label={`${pct}%`} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={RING / 2} cy={RING / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={STROKE} />
      <circle
        cx={RING / 2}
        cy={RING / 2}
        r={r}
        fill="none"
        style={{ stroke: color }}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={`${(c * pct) / 100} ${c}`}
      />
    </svg>
  );
}

export function StatTile({
  label,
  value,
  unit,
  ring,
  color = "var(--accent)",
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  /** 0..1 — draws a progress ring; null/undefined → no ring. */
  ring?: number | null;
  color?: string;
}) {
  return (
    <div
      style={{
        minWidth: 0,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 9,
        padding: 18,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: RING }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.04em" }}>
          {label}
        </span>
        {ring != null && <Ring value={ring} color={color} />}
      </div>
      <div className="tnum" style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 8 }}>
        {value}
        {unit && <span style={{ fontSize: 15, color: "var(--text-muted)", marginLeft: 6 }}>{unit}</span>}
      </div>
    </div>
  );
}
