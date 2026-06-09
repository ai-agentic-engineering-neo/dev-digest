import React from "react";
import { Icon, type IconName } from "../icons";

export function SectionLabel({
  children,
  icon,
  right,
}: {
  children?: React.ReactNode;
  icon?: IconName;
  right?: React.ReactNode;
}) {
  const I = icon ? Icon[icon] : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      {I && <I size={14} style={{ color: "var(--text-muted)" }} />}
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}
      >
        {children}
      </span>
      {right && <div style={{ marginLeft: "auto" }}>{right}</div>}
    </div>
  );
}
