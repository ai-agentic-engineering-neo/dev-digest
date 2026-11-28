import { CHARS_PER_TOKEN } from "./constants";

/** Client-side token estimate: `ceil(chars / 4)`. */
export function estimateTokens(body: string): number {
  return Math.ceil(body.length / CHARS_PER_TOKEN);
}

/** Message key (under `skills.editor`) and count for the token label. */
export interface TokenLabel {
  key: "tokens" | "tokensApprox";
  count: number;
}

/**
 * The server's exact count when it is known for this body; otherwise the
 * estimate, marked approximate. Pass `null` as `serverCount` while the body has
 * unsaved edits.
 */
export function tokenLabel(body: string, serverCount: number | null | undefined): TokenLabel {
  if (serverCount != null) return { key: "tokens", count: serverCount };
  return { key: "tokensApprox", count: estimateTokens(body) };
}

/** Line numbers for the gutter: one per line of the body, at least one. */
export function lineNumbers(body: string): number[] {
  const count = body.split("\n").length;
  return Array.from({ length: count }, (_, i) => i + 1);
}
