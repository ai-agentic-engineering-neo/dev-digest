import type { LucideIcon } from "lucide-react";

export type RoleShape = "rect" | "pill" | "diamond" | "hexagon";

/** Visual definition of a node role. Encoded as shape + icon + text label — never colour alone. */
export interface GraphRoleDef {
  label: string;
  shape: RoleShape;
  icon: LucideIcon;
}

/** Data-agnostic node. `label`/`secondary` are rendered as plain text only. */
export interface GraphNodeInput {
  id: string;
  label: string;
  /** Key into the roles map (defaults in `constants.ts`, overridable via `roles` prop). */
  role: string;
  /** Optional second line (e.g. a file path). */
  secondary?: string;
  /** Renders strikethrough + a "deleted" tag. */
  deleted?: boolean;
  /** Extra short text tags, e.g. "type". Plain text. */
  tags?: string[];
  highlighted?: boolean;
  dimmed?: boolean;
  selected?: boolean;
}

export interface GraphEdgeInput {
  id: string;
  source: string;
  target: string;
  /** Dashed stroke. */
  inferred?: boolean;
  /** Thin stroke + "type" tag. */
  typeOnly?: boolean;
  /**
   * Number of underlying edges an aggregate edge stands for (project graph
   * directory roll-ups). > 1 ⇒ an `×N` label and a log-scaled thicker stroke.
   */
  weight?: number;
  highlighted?: boolean;
  dimmed?: boolean;
}

/** Data carried by the custom React Flow node. */
export interface GraphNodeData extends Record<string, unknown> {
  node: GraphNodeInput;
  roleDef: GraphRoleDef;
  onSelect?: (id: string) => void;
  /** True when the caller supplied its own role definition (its label wins over i18n). */
  customLabel?: boolean;
}

export interface Position {
  x: number;
  y: number;
}

export type LayoutStatus = "idle" | "loading" | "ready" | "skipped" | "error";

export interface BannerCondition {
  id: string;
  /** Already-localised sentence; callers format numbers via their own i18n. */
  text: string;
  tone?: "info" | "warning";
  /** Optional numeric facts shown as "label: value" chips. */
  stats?: { label: string; value: number }[];
}
