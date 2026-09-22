/**
 * Candidate gate (spec: Pipeline §3): evidence verification + de-duplication over
 * files the caller already read. Pure — the file reads happen in the application ring.
 */
import { CONVENTION_EVIDENCE_MAX, type ConventionDropReason, type DroppedConvention } from '@devdigest/shared';
import { MAX_CANDIDATES, RULE_MAX_CHARS } from './constants.js';
import { ruleKey, safeRelativePath, verifyEvidence } from './evidence.js';
import type { ConventionExtraction } from './extraction.js';
import type { KeptConvention } from './types.js';

export type Candidate = ConventionExtraction['candidates'][number];

export interface GateResult {
  kept: KeptConvention[];
  dropped: DroppedConvention[];
}

/** Every safe path the candidates cite (to read each file once). */
export function citedPaths(candidates: readonly Candidate[]): string[] {
  const out = new Set<string>();
  for (const c of candidates.slice(0, MAX_CANDIDATES)) {
    for (const e of c.evidence.slice(0, CONVENTION_EVIDENCE_MAX)) {
      const p = safeRelativePath(e.path);
      if (p) out.add(p);
    }
  }
  return [...out];
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

/**
 * Keep a candidate when at least one evidence item verifies; relocated items keep
 * their real lines. `lines(path)` is null for a missing/unsafe/unreadable file.
 * `knownKeys` = ruleKey of rules the repo already decided on (never re-proposed).
 */
export function gateCandidates(
  candidates: readonly Candidate[],
  lines: (path: string) => readonly string[] | null,
  knownKeys: ReadonlySet<string>,
): GateResult {
  const kept: KeptConvention[] = [];
  const dropped: DroppedConvention[] = [];
  const seen = new Set(knownKeys);

  for (const c of candidates.slice(0, MAX_CANDIDATES)) {
    const rule = c.rule.trim().replace(/\s+/g, ' ').slice(0, RULE_MAX_CHARS);
    const firstPath = c.evidence[0]?.path ?? '';
    const key = ruleKey(rule);
    if (!key) {
      dropped.push({ rule, path: firstPath, reason: 'invalid' });
      continue;
    }
    if (seen.has(key)) {
      dropped.push({ rule, path: firstPath, reason: 'duplicate' });
      continue;
    }

    const evidence: KeptConvention['evidence'] = [];
    let firstFailure: ConventionDropReason = c.evidence.length === 0 ? 'invalid' : 'file_not_found';
    let failed = false;
    for (const claimed of c.evidence.slice(0, CONVENTION_EVIDENCE_MAX)) {
      const path = safeRelativePath(claimed.path);
      const file = path ? lines(path) : null;
      const check = file
        ? verifyEvidence(file, { ...claimed, path: path! })
        : ({ ok: false, reason: 'file_not_found' } as const);
      if (check.ok) {
        const dup = evidence.some((e) => e.path === check.evidence.path && e.start_line === check.evidence.start_line);
        if (!dup) evidence.push(check.evidence);
      } else if (!failed) {
        firstFailure = check.reason;
        failed = true;
      }
    }

    if (evidence.length === 0) {
      dropped.push({ rule, path: firstPath, reason: firstFailure });
      continue;
    }
    seen.add(key);
    kept.push({ category: c.category, rule, evidence, confidence: clamp01(c.confidence) });
  }
  return { kept, dropped };
}
