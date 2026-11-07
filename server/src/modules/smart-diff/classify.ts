import type { SmartDiffRole } from '@devdigest/shared';
import { SMART_DIFF_FALLBACK_ROLE, SMART_DIFF_RULES, type SmartDiffRule } from './constants.js';
import { matchesGlob } from './glob.js';

export function classifyWith(path: string, rules: readonly SmartDiffRule[]): SmartDiffRole {
  for (const rule of rules) {
    if (rule.patterns.some((p) => matchesGlob(path, p))) return rule.role;
  }
  return SMART_DIFF_FALLBACK_ROLE;
}

export function classifyFile(path: string): SmartDiffRole {
  return classifyWith(path, SMART_DIFF_RULES);
}
