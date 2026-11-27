import type { CSSProperties } from "react";

export const s = {
  loading: { display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 },
  redirecting: { color: "var(--text-secondary)", marginBottom: 14 },
} satisfies Record<string, CSSProperties>;
