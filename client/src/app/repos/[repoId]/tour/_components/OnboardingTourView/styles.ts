import type { CSSProperties } from "react";

export const s = {
  layout: { display: "grid", gridTemplateColumns: "220px minmax(0, 1fr)", gap: 32, alignItems: "start" } satisfies CSSProperties,
  toc: { position: "sticky", top: 16, paddingTop: 8 } satisfies CSSProperties,
  main: { minWidth: 0, display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  stack: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  banner: {
    padding: "10px 14px",
    borderRadius: 8,
    fontSize: 13.5,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
};
