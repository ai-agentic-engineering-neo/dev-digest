import React from "react";

export function ConfidenceNum({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const c = pct >= 85 ? "var(--ok)" : pct >= 65 ? "var(--warn)" : "var(--text-muted)";
  return (
    <span
      className="mono tnum"
      title="Model confidence"
      style={{
        fontSize: 12,
        color: "var(--text-muted)",
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 99, background: c }} />
      {pct + "% conf"}
    </span>
  );
}
