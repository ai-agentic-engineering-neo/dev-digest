import type { CSSProperties } from "react";

export const s = {
  page: {
    minHeight: "100vh",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },
  actions: { display: "flex", justifyContent: "center" },
} satisfies Record<string, CSSProperties>;
