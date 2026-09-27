/**
 * Prompt-size estimate shared by the skill editor and the run-trace prompt
 * blocks.
 *
 * `ceil(chars / 4)` is deliberately the SAME heuristic the server falls back to
 * (`adapters/tokenizer/index.ts:approxTokens`), so the number shown while
 * editing a skill and the number shown on the prompt block it produced come
 * from one rule. It is an estimate and every label says so — a real BPE count
 * would mean shipping an encoder to the browser for a figure nobody bills on.
 */
export function approxTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
