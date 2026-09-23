import type { CSSProperties } from "react";

/** Co-located styles for RunReviewDropdown's agent picker.
 *
 * The panel deliberately mirrors the vendored `Dropdown` (kit/Dropdown.tsx) —
 * same tokens, radius, shadow and offset — because this menu sits next to real
 * Dropdowns in the same header and must not read as a different primitive. We
 * render our own panel only because `Dropdown` closes on every item click,
 * which a multi-select list cannot do. */
export const s = {
  wrap: { position: "relative", display: "inline-block" },

  panel: {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: 0,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-strong)",
    borderRadius: 9,
    boxShadow: "var(--shadow-modal)",
    padding: 6,
    zIndex: 40,
    animation: "ddpop .12s ease",
  },

  divider: { height: 1, background: "var(--border)", margin: "6px 0" },

  mergedWarning: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    fontSize: 14,
    fontWeight: 500,
    color: "var(--text-secondary)",
  },

  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "4px 10px 6px",
  },
  headerLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
  },
  headerAction: {
    border: "none",
    background: "transparent",
    padding: 0,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--accent)",
    cursor: "pointer",
  },

  list: { maxHeight: 280, overflowY: "auto" },

  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
    padding: "8px 10px",
    borderRadius: 6,
    cursor: "pointer",
  },
  rowHover: { background: "var(--bg-hover)" },
  checkbox: { marginTop: 2, flexShrink: 0, cursor: "pointer", accentColor: "var(--accent)" },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { display: "flex", alignItems: "baseline", gap: 8 },
  rowName: { fontSize: 14, fontWeight: 500, color: "var(--text-primary)" },
  /* The right edge of the row: model today, a future "~16s" estimate later. */
  rowMeta: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", flexShrink: 0 },
  rowDescription: {
    fontSize: 12,
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  empty: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "8px 10px",
    borderRadius: 6,
    border: "none",
    background: "transparent",
    fontSize: 14,
    fontWeight: 500,
    color: "var(--text-secondary)",
    textAlign: "left",
    cursor: "pointer",
  },

  footer: { padding: "2px 4px 4px" },

  configure: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "8px 10px",
    borderRadius: 6,
    border: "none",
    background: "transparent",
    fontSize: 14,
    fontWeight: 500,
    color: "var(--text-secondary)",
    textAlign: "left",
    cursor: "pointer",
  },
} satisfies Record<string, CSSProperties>;
