import React from "react";

export function ProgressBar({
  value,
  color = "var(--accent)",
  height = 6,
  bg = "var(--bg-hover)",
}: {
  value: number;
  color?: string;
  height?: number;
  bg?: string;
}) {
  return (
    <div style={{ width: "100%", height, background: bg, borderRadius: 99, overflow: "hidden" }}>
      <div
        style={{
          width: Math.max(0, Math.min(100, value)) + "%",
          height: "100%",
          background: color,
          borderRadius: 99,
          transition: "width .4s ease",
        }}
      />
    </div>
  );
}

/** Indexing progress with explicit percentage label (spec §11: percent, not spinner). */
export function PercentProgress({
  value,
  label,
  color = "var(--accent)",
}: {
  value: number;
  label?: string;
  color?: string;
}) {
  const pct = Math.round(Math.max(0, Math.min(100, value)));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", fontSize: 13, color: "var(--text-secondary)" }}>
        {label && <span style={{ flex: 1 }}>{label}</span>}
        <span className="mono tnum" style={{ fontWeight: 600, color: "var(--text-primary)" }}>
          {pct}%
        </span>
      </div>
      <ProgressBar value={pct} color={color} />
    </div>
  );
}
