import type { CSSProperties } from "react";

/** Mirrors the kit `SectionLabel` values, on a real heading element. */
export const s: Record<"root" | "icon" | "text", CSSProperties> = {
  root: { display: "flex", alignItems: "center", gap: 10, margin: 0, marginBottom: 14 },
  icon: { color: "var(--text-muted)", flexShrink: 0 },
  text: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  },
};
