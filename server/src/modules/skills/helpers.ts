/** skills — pure helpers (ring 2). Unit-testable without any double. */

import { createTwoFilesPatch, diffLines } from 'diff';
import { SKILL_NAME_PATTERN } from './constants.js';

/** Unified diff of a skill body from `fromVersion` to `toVersion`, plus line counts. */
export function diffSkillBodies(
  name: string,
  from: { version: number; body: string },
  to: { version: number; body: string },
): { patch: string; additions: number; deletions: number } {
  // Normalise the trailing newline so a body that merely gains a line is not
  // reported as "last line removed + two added".
  const a = from.body.endsWith('\n') ? from.body : `${from.body}\n`;
  const b = to.body.endsWith('\n') ? to.body : `${to.body}\n`;
  const patch = createTwoFilesPatch(`${name}@v${from.version}`, `${name}@v${to.version}`, a, b, '', '', { context: 3 });
  let additions = 0;
  let deletions = 0;
  for (const part of diffLines(a, b)) {
    if (part.added) additions += part.count ?? 0;
    else if (part.removed) deletions += part.count ?? 0;
  }
  return { patch, additions, deletions };
}

/** A body edit that only changes surrounding whitespace is not a new version. */
export function isMeaningfulChange(previous: string, next: string): boolean {
  return previous.trim() !== next.trim();
}

/** True when `name` is a kebab-case slug the API accepts. */
export function isValidSkillName(name: string): boolean {
  return SKILL_NAME_PATTERN.test(name);
}
