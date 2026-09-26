import type { CSSProperties } from "react";

/** Co-located styles for FindingsSummary. */
export const s = {
  group: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    margin: "0 0 12px",
  } satisfies CSSProperties,
  button: {
    display: "inline-flex",
    padding: 0,
    // Longhands, NOT the `border` shorthand: the active state below overrides
    // only borderColor, and React warns when it removes a longhand on rerender
    // while a conflicting shorthand is still set.
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    borderRadius: 7,
    background: "none",
    cursor: "pointer",
  } satisfies CSSProperties,
  buttonActive: { borderColor: "var(--accent)" } satisfies CSSProperties,
  // While a filter is on, the counters it excludes stay readable but recede —
  // the row still reads as a summary, not as three equal buttons.
  buttonMuted: { opacity: 0.45 } satisfies CSSProperties,
} as const;
