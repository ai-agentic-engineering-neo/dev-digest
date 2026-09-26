/** skills — pure helpers (ring 2). Unit-testable without any double. */

import { SKILL_NAME_PATTERN } from './constants.js';

/** A body edit that only changes surrounding whitespace is not a new version. */
export function isMeaningfulChange(previous: string, next: string): boolean {
  return previous.trim() !== next.trim();
}

/** True when `name` is a kebab-case slug the API accepts. */
export function isValidSkillName(name: string): boolean {
  return SKILL_NAME_PATTERN.test(name);
}
