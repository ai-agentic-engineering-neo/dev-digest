import type { SpecKind } from "@devdigest/shared";

/** Colour of the kind badge on attach rows (CSS variables from the design system). */
export const KIND_COLOR: Record<SpecKind | "none", { c: string; bg: string }> = {
  specs: { c: "var(--info)", bg: "var(--info-bg)" },
  docs: { c: "var(--ok)", bg: "var(--ok-bg)" },
  insights: { c: "var(--warn)", bg: "var(--warn-bg)" },
  none: { c: "var(--text-secondary)", bg: "var(--bg-hover)" },
};

/** Split "docs/guides/a.md" into its folder ("docs/guides/") and name ("a.md"). */
export function splitPath(path: string): { folder: string; name: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { folder: "", name: path } : { folder: path.slice(0, i + 1), name: path.slice(i + 1) };
}
