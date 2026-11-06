/* atoms — trivial presentational layout helpers shared by the trace body
   (Stat tile, labelled Row). Grouped in one file: no logic, never tested alone. */
import React from "react";
import { s } from "../styles";

export function Stat({ label, val }: { label: string; val: React.ReactNode }) {
  return (
    <div style={s.stat}>
      <div style={s.statLabel}>{label}</div>
      <div className="tnum" style={s.statVal}>
        {val}
      </div>
    </div>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={s.row}>
      <span style={s.rowLabel}>{label}</span>
      {children}
    </div>
  );
}
