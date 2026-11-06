import type React from "react";

export const s: Record<"root", React.CSSProperties> = {
  // Page padding matches the other pages (pulls header 24/32, agents & conventions 24-28/32/44).
  root: { display: "flex", flexDirection: "column", gap: 16, padding: "24px 32px 44px" },
};
