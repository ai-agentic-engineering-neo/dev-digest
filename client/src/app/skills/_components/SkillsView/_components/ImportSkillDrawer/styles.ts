import type { CSSProperties } from "react";

export const s = {
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 },
  dropzone: {
    border: "1px dashed var(--border-strong)",
    borderRadius: 8,
    padding: "22px 16px",
    textAlign: "center",
    background: "var(--bg-elevated)",
  },
  fileName: { marginTop: 10, fontSize: 13, color: "var(--text-secondary)" },
  error: { fontSize: 12, color: "var(--crit)", marginTop: 8 },
  previewCard: {
    marginTop: 20,
    padding: 16,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  },
  previewHead: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 },
  previewName: { fontSize: 14, fontWeight: 700 },
  previewMeta: { fontSize: 12, color: "var(--text-muted)", marginBottom: 10 },
  previewBody: {
    maxHeight: 220,
    overflow: "auto",
    fontSize: 12,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    color: "var(--text-secondary)",
  },
  notice: { fontSize: 12, color: "var(--text-muted)", marginTop: 14, lineHeight: 1.5 },
  collides: { fontSize: 12, color: "var(--warn)", marginTop: 10 },
} satisfies Record<string, CSSProperties>;
