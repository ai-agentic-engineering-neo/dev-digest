import { MODEL_COLOR } from "./constants";

/** Resolve the chip colour for an agent's model (unknown → secondary token). */
export function modelColor(model: string): string {
  return MODEL_COLOR[model] ?? "var(--text-secondary)";
}

/** `0.78` → `78`; null when no finding has been decided yet. */
export function acceptPercent(rate: number | null | undefined): number | null {
  return rate == null ? null : Math.round(rate * 100);
}
