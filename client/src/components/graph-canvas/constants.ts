import { Box, Circle, FileCode, Folder, FlaskConical, LogIn, Pencil, RefreshCw } from "lucide-react";
import type { GraphRoleDef } from "./types";

/** ELK runs on the main thread; above this we fall back to a grid (AC / non-functional). */
export const MAX_LAYOUT_NODES = 300;
export const NODE_WIDTH = 190;
export const NODE_HEIGHT = 56;

/** Role keys have no i18n label here: `labelKey` is resolved in components via messages. */
export const DEFAULT_ROLES: Record<string, Omit<GraphRoleDef, "label">> = {
  changed: { shape: "rect", icon: Pencil, tone: "var(--warn)" },
  impacted: { shape: "pill", icon: Circle, tone: "var(--accent-text)" },
  entry: { shape: "hexagon", icon: LogIn, tone: "var(--ok)" },
  test: { shape: "diamond", icon: FlaskConical, tone: "var(--info)" },
  file: { shape: "rect", icon: FileCode },
  directory: { shape: "pill", icon: Folder },
  cycle: { shape: "hexagon", icon: RefreshCw, tone: "var(--crit)" },
  other: { shape: "rect", icon: Box },
};
