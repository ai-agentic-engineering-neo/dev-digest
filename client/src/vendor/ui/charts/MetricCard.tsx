/* MetricCard — KPI tile: big value, signed delta, and an optional Sparkline. */
import React from "react";
import { Icon } from "../icons";
import { Sparkline } from "./Sparkline";

export function MetricCard({
  label,
  value,
  delta,
  color,
  trend,
  suffix,
  deltaLabel,
}: {
  label: string;
  value: React.ReactNode;
  delta?: number;
  color?: string;
  trend?: number[];
  suffix?: string;
  /** specs/16-agent-performance-dashboard.md — `delta` alone renders a bare
   *  unit-less number; this optional label (e.g. "vs. previous period",
   *  "runs") renders after it. Additive — omitting it keeps the previous
   *  output byte-for-byte. */
  deltaLabel?: string;
}) {
  const up = (delta ?? 0) > 0;
  const flat = delta === 0;
  const dc = flat ? "var(--text-muted)" : up ? "var(--ok)" : "var(--crit)";
  const DeltaIcon = flat ? Icon.Slash : up ? Icon.ArrowUp : Icon.ArrowDown;
  return (
    <div
      style={{
        flex: 1,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 9,
        padding: 18,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-muted)",
            letterSpacing: "0.03em",
          }}
        >
          {label}
        </span>
        {trend && <Sparkline data={trend} color={color || "var(--accent)"} w={56} h={20} />}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 12 }}>
        <span className="tnum" style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em" }}>
          {value}
          {suffix && <span style={{ fontSize: 18, color: "var(--text-muted)" }}>{suffix}</span>}
        </span>
        {delta != null && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 2,
              fontSize: 13,
              fontWeight: 600,
              color: dc,
            }}
          >
            <DeltaIcon size={12} />
            <span className="tnum">{Math.abs(delta).toFixed(2)}</span>
            {deltaLabel && <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>{deltaLabel}</span>}
          </span>
        )}
      </div>
    </div>
  );
}
