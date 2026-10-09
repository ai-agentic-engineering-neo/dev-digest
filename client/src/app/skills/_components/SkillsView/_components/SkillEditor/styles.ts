import type { CSSProperties } from "react";

export const s = {
  wrap: { flex: 1, display: "flex", flexDirection: "column", minHeight: 0 },
  tabsBar: { borderBottom: "1px solid var(--border)", flexShrink: 0 },
  body: { flex: 1, minHeight: 0, overflow: "auto", padding: 24 },
} satisfies Record<string, CSSProperties>;
