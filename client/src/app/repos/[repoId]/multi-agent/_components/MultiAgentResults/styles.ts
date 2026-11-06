import type { CSSProperties } from "react";
import { COLUMN_MIN_WIDTH_PX, MAX_GRID_COLUMNS } from "../../constants";

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 20 } as CSSProperties,
  grid: (count: number): CSSProperties => ({
    display: "grid",
    gridTemplateColumns: `repeat(${Math.min(count, MAX_GRID_COLUMNS)}, minmax(${COLUMN_MIN_WIDTH_PX}px, 1fr))`,
    gridAutoFlow: "column",
    gridAutoColumns: `minmax(${COLUMN_MIN_WIDTH_PX}px, 1fr)`,
    overflowX: "auto",
    gap: 12,
    alignItems: "start",
  }),
};
