import type { Finding, Intent } from '@devdigest/shared';

/**
 * Out-of-scope policy (server/specs/05-intent-layer.md, "Out-of-scope finding
 * policy"). Deterministic and mechanical — like `grounding.ts`, it never drops
 * a finding and never changes its severity; it only normalizes the model's own
 * `out_of_scope` judgment (made against `## PR intent` when that section was
 * in the prompt) into the policy's guarantees:
 *
 *  - no intent in the prompt → every flag forced to `null` (the model had
 *    nothing to judge scope against; defends against it setting the field anyway);
 *  - intent present → the flag is coerced to a plain boolean;
 *  - the finding list's length, order and severities are NEVER touched here.
 */
export interface ScopePolicyResult {
  findings: Finding[];
  outOfScopeCount: number;
  outOfScopeCriticalCount: number;
}

export function applyScopePolicy(findings: Finding[], intent: Intent | undefined): ScopePolicyResult {
  if (!intent) {
    const cleared = findings.map((f) => (f.out_of_scope == null ? f : { ...f, out_of_scope: null }));
    return { findings: cleared, outOfScopeCount: 0, outOfScopeCriticalCount: 0 };
  }
  let outOfScopeCount = 0;
  let outOfScopeCriticalCount = 0;
  const normalized = findings.map((f) => {
    const flagged = f.out_of_scope === true;
    if (flagged) {
      outOfScopeCount++;
      if (f.severity === 'CRITICAL') outOfScopeCriticalCount++;
    }
    return f.out_of_scope === flagged ? f : { ...f, out_of_scope: flagged };
  });
  return { findings: normalized, outOfScopeCount, outOfScopeCriticalCount };
}
