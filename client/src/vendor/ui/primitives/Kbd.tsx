import React from "react";

export function Kbd({ children }: { children?: React.ReactNode }) {
  return (
    <kbd
      className="mono"
      style={{
        display: "inline-grid",
        placeItems: "center",
        minWidth: 18,
        height: 18,
        padding: "0 6px",
        fontSize: 12,
        color: "var(--text-secondary)",
        background: "var(--bg-surface)",
        border: "1px solid var(--border-strong)",
        borderRadius: 4,
        lineHeight: 1,
      }}
    >
      {children}
    </kbd>
  );
}
