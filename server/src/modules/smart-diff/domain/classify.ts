/**
 * Pure PR-file classifier (server/specs/06-smart-diff.md). Independent of any
 * route: L08 imports it as a pre-filter before assembling a prompt, the same
 * way run-executor imports skills' renderSkillBlock (server/INSIGHTS.md).
 */
import type { SmartDiffRole } from '@devdigest/shared';
import { ROLE_CHECK_ORDER, ROLE_PATTERNS } from './constants.js';

/** Escapes every regex metacharacter the glob body may contain, except '*' (handled separately). */
function escapeGlobLiteral(ch: string): string {
  return /[.+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

/**
 * Compiles one fixed glob (never user input) into a single-pass RegExp, no
 * nested quantifiers:
 *   - a leading "**\/" → matches at any depth, regardless of the rest
 *   - a plain "/" elsewhere → anchors the rest at the repo root
 *   - no "/" at all → matches the basename, at any depth
 *   - "*" → one path segment ([^/]*); "**" elsewhere → ".*"
 */
function compileGlob(pattern: string): RegExp {
  const anyDepth = pattern.startsWith('**/');
  const body = anyDepth ? pattern.slice(3) : pattern;
  const hasSlash = body.includes('/');
  let out = '';
  for (let i = 0; i < body.length; ) {
    if (body.startsWith('**', i)) {
      out += '.*';
      i += 2;
    } else if (body[i] === '*') {
      out += '[^/]*';
      i += 1;
    } else {
      out += escapeGlobLiteral(body[i]!);
      i += 1;
    }
  }
  const prefix = anyDepth || !hasSlash ? '(?:^|.*/)' : '^';
  return new RegExp(`${prefix}${out}$`);
}

const COMPILED: Readonly<Record<Exclude<SmartDiffRole, 'core'>, RegExp[]>> = Object.fromEntries(
  ROLE_CHECK_ORDER.map((role) => [role, ROLE_PATTERNS[role].map(compileGlob)]),
) as Record<Exclude<SmartDiffRole, 'core'>, RegExp[]>;

/** Normalises separators and a leading "./" so classification never depends on how the caller built the path. */
function normalisePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

/** Pure: which of the 5 SmartDiff roles a PR file path belongs to (server/specs/06-smart-diff.md, "Classification"). */
export function classifyFile(path: string): SmartDiffRole {
  const normalised = normalisePath(path);
  for (const role of ROLE_CHECK_ORDER) {
    if (COMPILED[role].some((re) => re.test(normalised))) return role;
  }
  return 'core';
}
