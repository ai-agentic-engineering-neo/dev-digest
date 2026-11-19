import type { GraphEdgeInput } from "./types";
import { NODE_HEIGHT, NODE_WIDTH } from "./constants";
import type { Position, RoleShape } from "./types";

/** Deterministic fallback placement used when ELK is skipped (too many nodes). */
export function gridLayout(ids: string[]): Record<string, Position> {
  const sorted = [...ids].sort();
  const cols = Math.max(1, Math.ceil(Math.sqrt(sorted.length)));
  const out: Record<string, Position> = {};
  sorted.forEach((id, i) => {
    out[id] = { x: (i % cols) * (NODE_WIDTH + 40), y: Math.floor(i / cols) * (NODE_HEIGHT + 40) };
  });
  return out;
}

const SHAPE_CLIP: Partial<Record<RoleShape, string>> = {
  diamond: "polygon(8% 50%, 50% 0, 92% 50%, 50% 100%)",
  hexagon: "polygon(8% 0, 92% 0, 100% 50%, 92% 100%, 8% 100%, 0 50%)",
};

export function shapeStyle(shape: RoleShape): { borderRadius?: number; clipPath?: string } {
  if (shape === "pill") return { borderRadius: 999 };
  if (shape === "rect") return { borderRadius: 6 };
  return { clipPath: SHAPE_CLIP[shape] };
}

/** Text on an edge: the type-only tag and/or the aggregate weight (`×N`). */
export function edgeLabel(e: GraphEdgeInput, t: (key: string, values?: Record<string, number>) => string): string | undefined {
  const parts: string[] = [];
  if (e.typeOnly) parts.push(t("tag.type"));
  if (e.weight && e.weight > 1) parts.push(t("tag.weight", { count: e.weight }));
  return parts.length ? parts.join(" · ") : undefined;
}

/** Type-only stays thin; weight adds up to +3 px on a log scale; highlight adds 1. */
export function edgeStrokeWidth(e: GraphEdgeInput): number {
  if (e.typeOnly) return 1;
  const weighted = e.weight && e.weight > 1 ? Math.min(3, Math.log2(e.weight)) : 0;
  return 2 + weighted + (e.highlighted ? 1 : 0);
}

/** The server's module-scope pseudo-symbol (SPEC-18 AC-10/26). */
export const MODULE_SYMBOL = "<module>";

/**
 * Human label for a symbol name: the `<module>` pseudo-symbol becomes the
 * localised "module scope" text; every other name is shown verbatim.
 */
export function symbolDisplayName(name: string, moduleScope: string): string {
  return name === MODULE_SYMBOL ? moduleScope : name;
}
