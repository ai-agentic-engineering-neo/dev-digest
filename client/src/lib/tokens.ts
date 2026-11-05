/**
 * Rough token estimate for prompt text (~4 chars per token). Used wherever the
 * UI shows "~N tokens" (run trace skills block, skill editors). The exact cl100k
 * count lives server-side (run log line "Skills: N attached …").
 */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
