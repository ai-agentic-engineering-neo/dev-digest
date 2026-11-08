import type { IconName } from "@devdigest/ui";
import type { BlastCounts } from "@/lib/types";

export const STATS: readonly { key: keyof BlastCounts; icon: IconName }[] = [
  { key: "symbols", icon: "Code" },
  { key: "callers", icon: "CornerDownRight" },
  { key: "endpoints", icon: "Globe" },
  { key: "crons", icon: "Clock" },
];
