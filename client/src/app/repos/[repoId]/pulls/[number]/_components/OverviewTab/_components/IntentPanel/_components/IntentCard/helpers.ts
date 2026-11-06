import type { IntentConfidence, IntentSource } from "@/lib/types";
import { CONFIDENCE_TONE, SHORT_SHA_LENGTH } from "./constants";

export function confidenceTone(c: IntentConfidence): { color: string; bg: string } {
  return CONFIDENCE_TONE[c];
}

export function isDimmed(s: IntentSource): boolean {
  return s.status !== "read";
}

export function shortSha(sha: string | null): string | null {
  return sha ? sha.slice(0, SHORT_SHA_LENGTH) : null;
}

export function linesToItems(text: string, max: number): { items: string[]; tooMany: boolean } {
  const items = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return { items, tooMany: items.length > max };
}

export function itemsToLines(items: readonly string[]): string {
  return items.join("\n");
}
