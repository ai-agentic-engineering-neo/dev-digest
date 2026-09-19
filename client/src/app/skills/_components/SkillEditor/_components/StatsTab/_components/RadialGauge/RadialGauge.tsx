"use client";

import React from "react";

/**
 * A tiny accent ring for the ACCEPT RATE tile: one muted background circle and
 * one accent arc drawn with `stroke-dasharray`. Deliberately not
 * `@devdigest/ui`'s `CircularScore` — that one prints its own numeral in the
 * middle (the tile already shows the number) and colours itself against
 * ok/warn/crit thresholds, which is a severity reading, not a rate.
 */
export function RadialGauge({
  /** 0–1. */
  ratio,
  size = 34,
  stroke = 4,
}: {
  ratio: number;
  size?: number;
  stroke?: number;
}) {
  const clamped = Math.min(Math.max(ratio, 0), 1);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      style={{ flexShrink: 0, transform: "rotate(-90deg)" }}
    >
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-hover)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
      />
    </svg>
  );
}
