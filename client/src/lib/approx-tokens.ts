/** Rough client-side token estimate (≈4 chars/token); the server counts exactly per run. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
