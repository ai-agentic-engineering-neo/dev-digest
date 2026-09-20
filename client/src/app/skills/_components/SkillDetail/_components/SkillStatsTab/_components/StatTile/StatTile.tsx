import React from "react";
import { s } from "./styles";

export function StatTile({
  label,
  value,
  unit,
  aside,
}: {
  label: string;
  value: string;
  unit?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div style={s.tile}>
      <div style={s.head}>
        <span style={s.label}>{label}</span>
        {aside}
      </div>
      <div>
        <span style={s.value}>{value}</span>
        {unit ? <span style={s.unit}>{unit}</span> : null}
      </div>
    </div>
  );
}
