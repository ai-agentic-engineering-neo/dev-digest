import { MODEL_COLOR } from "./constants";

/** Resolve the chip colour for an agent's model (unknown → secondary token). */
export function modelColor(model: string): string {
  return MODEL_COLOR[shortModel(model)] ?? MODEL_COLOR[model] ?? "var(--text-secondary)";
}

/** "deepseek/deepseek-v4-flash" → "deepseek-v4-flash" (OpenRouter ids carry a vendor prefix). */
export function shortModel(model: string): string {
  return model.slice(model.lastIndexOf("/") + 1);
}

export { acceptColor } from "@/lib/accept-rate";
