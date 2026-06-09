import React from "react";
import { Icon } from "../icons";
import { type ButtonProps } from "./tokens";

export type { ButtonProps };

type ButtonKind = "primary" | "secondary" | "tertiary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export function Button({
  kind = "secondary",
  size = "md",
  icon,
  iconRight,
  children,
  active,
  full,
  loading,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  // While loading, show a spinning RefreshCw regardless of the configured icon.
  const I = loading ? Icon.RefreshCw : icon ? Icon[icon] : null;
  const IR = iconRight ? Icon[iconRight] : null;
  const pad = size === "sm" ? "5px 9px" : size === "lg" ? "10px 18px" : "7px 13px";
  const fs = size === "sm" ? 12.5 : size === "lg" ? 14 : 13;
  const [h, setH] = React.useState(false);
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
    padding: children ? pad : size === "sm" ? 6 : 8,
    fontSize: fs,
    fontWeight: 500,
    borderRadius: 6,
    border: "1px solid transparent",
    whiteSpace: "nowrap",
    transition: "background .12s, border-color .12s, color .12s",
    lineHeight: 1.2,
    width: full ? "100%" : undefined,
    letterSpacing: "-0.01em",
  };
  const kinds: Record<ButtonKind, React.CSSProperties> = {
    primary: { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" },
    secondary: {
      background: "var(--bg-elevated)",
      color: "var(--text-primary)",
      borderColor: "var(--border-strong)",
    },
    tertiary: {
      background: active ? "var(--bg-hover)" : "transparent",
      color: active ? "var(--text-primary)" : "var(--text-secondary)",
      borderColor: "transparent",
    },
    ghost: { background: "transparent", color: "var(--text-secondary)", borderColor: "var(--border)" },
    danger: { background: "transparent", color: "var(--crit)", borderColor: "var(--border-strong)" },
  };
  const hoverMap: Record<ButtonKind, React.CSSProperties> = {
    primary: { background: "var(--accent-hover)", borderColor: "var(--accent-hover)" },
    secondary: { background: "var(--bg-hover)", borderColor: "var(--text-muted)" },
    tertiary: { background: "var(--bg-hover)", color: "var(--text-primary)" },
    ghost: { background: "var(--bg-hover)", color: "var(--text-primary)" },
    danger: { background: "var(--crit-bg)", borderColor: "var(--crit)" },
  };
  const hover = h ? hoverMap[kind] : {};
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      style={{
        ...base,
        ...kinds[kind],
        ...hover,
        ...(disabled || loading ? { opacity: 0.6, cursor: "not-allowed" } : {}),
        ...style,
      }}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
    >
      {I && <I size={fs + 2} style={loading ? { animation: "ddspin 1s linear infinite" } : undefined} />}
      {children}
      {IR && <IR size={fs + 2} />}
    </button>
  );
}
