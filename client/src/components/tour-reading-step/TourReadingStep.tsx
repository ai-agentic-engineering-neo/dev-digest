import React from "react";
import { s } from "./styles";

interface TourReadingStepProps {
  index: number;
  path: string;
  why: string;
}

/** One step of the reading path: numbered badge, monospace path, rationale. */
export function TourReadingStep({ index, path, why }: TourReadingStepProps) {
  return (
    <div style={s.row}>
      <span style={s.badge} aria-hidden>
        {index}
      </span>
      <div style={s.text}>
        <div className="mono" style={s.path}>
          {path}
        </div>
        <div style={s.why}>{why}</div>
      </div>
    </div>
  );
}
