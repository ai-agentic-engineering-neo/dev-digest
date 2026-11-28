import type { CSSProperties } from "react";

export const s = {
  layout: { display: "flex", height: "calc(100vh - 52px)" },
  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 },
  placeholder: { flex: 1, display: "grid", placeItems: "center", padding: 28 },
} satisfies Record<string, CSSProperties>;
