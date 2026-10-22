/** Rough token estimate for the editor (~4 chars/token). The exact count the
    agent pays is computed server-side and shown on the Preview tab. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** True when the form can be submitted (the server enforces the same rules). */
export function isSkillValid(v: { name: string; body: string }): boolean {
  return v.name.trim().length > 0 && v.body.trim().length > 0;
}
