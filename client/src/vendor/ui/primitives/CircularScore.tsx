import React from "react";

export function CircularScore({
  score,
  size = 44,
  stroke = 4,
}: {
  score: number;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const c = score >= 75 ? "var(--ok)" : score >= 50 ? "var(--warn)" : "var(--crit)";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        {/* Track tinted with the score colour so a low score (even 0, which draws
            no arc) still reads as red/orange at a glance. */}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c} strokeOpacity={0.22} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={c}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - score / 100)}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .6s ease" }}
        />
      </svg>
      <div
        className="tnum"
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          fontSize: size * 0.3,
          fontWeight: 700,
        }}
      >
        {score}
      </div>
    </div>
  );
}
