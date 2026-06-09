import React from "react";
import { Icon, type IconName } from "../icons";
import { SEV, CAT, type Severity, type Category } from "./tokens";

export function Badge({
  children,
  color = "var(--text-secondary)",
  bg = "var(--bg-hover)",
  icon,
  dot,
  mono,
  style,
}: {
  children?: React.ReactNode;
  color?: string;
  bg?: string;
  icon?: IconName;
  dot?: boolean;
  mono?: boolean;
  style?: React.CSSProperties;
}) {
  const I = icon ? Icon[icon] : null;
  return (
    <span
      className={mono ? "mono" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 10px",
        borderRadius: 5,
        fontSize: 12,
        fontWeight: 600,
        color,
        background: bg,
        letterSpacing: mono ? 0 : "0.01em",
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {dot && (
        <span style={{ width: 6, height: 6, borderRadius: 99, background: color }} />
      )}
      {I && <I size={12} />}
      {children}
    </span>
  );
}

/** Severity badge — always icon + label (WCAG AA: never color alone). */
export function SeverityBadge({
  severity,
  count,
  compact,
}: {
  severity: Severity;
  count?: number;
  compact?: boolean;
}) {
  const s = SEV[severity];
  const I = Icon[s.icon];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: compact ? "2px 6px" : "3px 9px",
        borderRadius: 5,
        fontSize: 12,
        fontWeight: 600,
        color: s.c,
        background: s.bg,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      <I size={12.5} />
      {compact ? null : s.label}
      {count != null && (
        <span className="tnum" style={{ opacity: 0.85 }}>
          {count}
        </span>
      )}
    </span>
  );
}

export function CategoryTag({ category }: { category: Category }) {
  const c = CAT[category];
  if (!c) return null;
  const I = Icon[c.icon];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 12,
        color: "var(--text-muted)",
        fontWeight: 500,
      }}
    >
      <I size={12} />
      {c.label}
    </span>
  );
}
