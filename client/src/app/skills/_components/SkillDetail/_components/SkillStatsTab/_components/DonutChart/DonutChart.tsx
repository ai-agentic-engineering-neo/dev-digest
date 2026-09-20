import React from "react";
import type { Segment } from "../../helpers";
import { arcPath } from "../../helpers";

const SIZE = 190;
const C = SIZE / 2;
const R_OUTER = 92;
const R_INNER = 62;

/** Inline-SVG donut. Purely visual: the accessible content is the aria-label + the legend. */
export function DonutChart({ segments, label }: { segments: Segment[]; label: string }) {
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={label} style={{ flexShrink: 0 }}>
      {segments.map((seg) => (
        <path key={seg.category} d={arcPath(C, C, R_OUTER, R_INNER, seg.start, seg.end)} fill={seg.color} />
      ))}
    </svg>
  );
}
