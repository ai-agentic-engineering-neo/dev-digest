/** Rough token estimate (chars / 4) — same approximation the design uses. */
export function estimateTokens(body: string): number {
  return Math.round(body.length / 4);
}
