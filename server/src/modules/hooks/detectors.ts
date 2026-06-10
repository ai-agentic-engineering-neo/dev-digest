import type { Finding, UnifiedDiff } from '@devdigest/shared';
import type { RepoIntel } from '../repo-intel/types.js';
import {
  PHANTOM_IMPORT,
  PHANTOM_RULES,
  SECRET_ALLOW,
  SECRET_FORCE,
  SECRET_RULES,
} from './constants.js';

/**
 * A4 — built-in finding DETECTORS (§7 L06 "Hooks"). Deterministic, full-file
 * scanners that emit grounding-exempt findings (kinds `secret_leak` / `phantom`
 * are exempt per ARCHITECTURE.md §8 — only the file must be in the diff). They
 * run additively alongside A2's LLM reviewer; they never call a model.
 *
 * Each detector scans the ADDED lines of the unified diff (so we only flag what
 * the PR introduces) and returns Findings with a stable, descriptive shape.
 * Rule tables live in ./constants.
 */

export interface AddedLine {
  file: string;
  line: number; // line number in the NEW file
  text: string; // line content (without the leading '+')
}

/** Walk a unified diff's raw text → the added lines with their new-file numbers. */
export function addedLines(diff: UnifiedDiff): AddedLine[] {
  const out: AddedLine[] = [];
  const lines = diff.raw.split('\n');
  let file = '';
  let newLine = 0;
  for (const raw of lines) {
    if (raw.startsWith('diff --git')) {
      file = '';
      continue;
    }
    if (raw.startsWith('+++ ')) {
      file = raw.replace(/^\+\+\+\s+b\//, '').replace(/^\+\+\+\s+/, '').trim();
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      out.push({ file, line: newLine, text: raw.slice(1) });
      newLine += 1;
    } else if (!raw.startsWith('-') && !raw.startsWith('\\')) {
      // context line advances the new-file counter
      newLine += 1;
    }
    // deletion lines ('-') do not advance the new-file counter
  }
  return out;
}

// ===========================================================================
// Secret-Leakage detector
// ===========================================================================

export function detectSecretLeaks(diff: UnifiedDiff): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const { file, line, text } of addedLines(diff)) {
    if (SECRET_ALLOW.test(text)) {
      // still flag the high-confidence provider-prefixed keys even with env around them
      if (!SECRET_FORCE.test(text)) continue;
    }
    for (const rule of SECRET_RULES) {
      if (!rule.re.test(text)) continue;
      const key = `${file}:${line}:${rule.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        id: `secret-${rule.id}-${file}-${line}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
        severity: rule.id === 'generic_secret' ? 'WARNING' : 'CRITICAL',
        category: 'security',
        title: `Hardcoded ${rule.label}`,
        file,
        start_line: line,
        end_line: line,
        rationale: `A ${rule.label.toLowerCase()} appears to be hardcoded in source at ${file}:${line}. Committed secrets are exposed to anyone with repo access and in git history.`,
        suggestion:
          'Move the value to an environment variable / secret manager and rotate the leaked credential immediately.',
        confidence: rule.id === 'generic_secret' ? 0.7 : 0.97,
        kind: 'secret_leak',
        trifecta_components: null,
        evidence: null,
      });
      break; // one finding per line is enough
    }
  }
  return findings;
}

// ===========================================================================
// Phantom-API detector
// ===========================================================================

export function detectPhantomApis(diff: UnifiedDiff): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const push = (
    file: string,
    line: number,
    id: string,
    label: string,
    severity: Finding['severity'],
  ) => {
    const key = `${file}:${line}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({
      id: `phantom-${id}-${file}-${line}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
      severity,
      category: 'bug',
      title: `Phantom API: ${label}`,
      file,
      start_line: line,
      end_line: line,
      rationale: `${file}:${line} references an API that does not appear to exist or is an unfilled stub (${label}). This will fail at runtime or silently no-op.`,
      suggestion: 'Wire up the real implementation or remove the placeholder before merging.',
      confidence: severity === 'SUGGESTION' ? 0.55 : 0.75,
      kind: 'phantom',
      trifecta_components: null,
      evidence: null,
    });
  };

  for (const { file, line, text } of addedLines(diff)) {
    for (const rule of PHANTOM_RULES) {
      if (rule.re.test(text)) push(file, line, rule.id, rule.label, rule.severity);
    }
    if (PHANTOM_IMPORT.test(text)) {
      push(file, line, 'fake_import', 'import of a non-existent package', 'WARNING');
    }
  }
  return findings;
}

// ===========================================================================
// Phantom-API reference detector (T1.3) — augments PHANTOM_RULES with a
// structural check via repo-intel. A call/new/JSX head on an ADDED diff line
// that the file neither declares nor imports (and isn't a known global) is
// emitted as a Finding with kind:'phantom'.
//
// This is the "hallucinated/renamed/mis-imported API" gate. It complements the
// regex-based PHANTOM_RULES (which catch placeholder/TODO stubs); the two run
// independently and dedupe by line+id so a single line never emits twice.
// ===========================================================================

/**
 * Detect phantom references in the added lines of a diff.
 *
 * Inputs:
 *  - `diff`: the unified diff (same shape every detector takes).
 *  - `repoIntel`: the facade. Behind the flag this returns `[]` — the gate
 *    then emits nothing (acceptance #10: flag off → zero behavior change).
 *  - `repoId`: forwarded to `getUnresolvedReferences` so the facade can find
 *    the clone path / repo basics.
 *
 * Output: zero or more `Finding`s with `kind: 'phantom'`. Empty input + a
 * degraded facade both produce `[]`. NEVER throws — any repo-intel error is
 * swallowed (the deterministic regex layer is the always-on baseline).
 */
export async function detectPhantomReferences(
  diff: UnifiedDiff,
  repoIntel: RepoIntel,
  repoId: string,
): Promise<Finding[]> {
  // Build (file, line)-keyed set of added lines so we only flag NEW code (per
  // §3 — never penalize pre-existing references that the PR happens to touch).
  const added = addedLines(diff);
  if (added.length === 0) return [];
  const addedByFile = new Map<string, Set<number>>();
  for (const a of added) {
    let set = addedByFile.get(a.file);
    if (!set) {
      set = new Set();
      addedByFile.set(a.file, set);
    }
    set.add(a.line);
  }

  const changedFiles = [...addedByFile.keys()];

  let unresolved: Awaited<ReturnType<RepoIntel['getUnresolvedReferences']>>;
  try {
    unresolved = await repoIntel.getUnresolvedReferences(repoId, changedFiles);
  } catch {
    // Degraded silently — never let the deterministic layer go silent.
    return [];
  }
  if (unresolved.length === 0) return [];

  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const ref of unresolved) {
    const fileAdded = addedByFile.get(ref.refFile);
    if (!fileAdded || !fileAdded.has(ref.refLine)) continue;

    const key = `${ref.refFile}:${ref.refLine}:${ref.symbolName}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const safeId =
      `phantom-ref-${ref.symbolName}-${ref.refFile}-${ref.refLine}`.replace(
        /[^a-zA-Z0-9_-]/g,
        '_',
      );
    findings.push({
      id: safeId,
      severity: 'WARNING',
      category: 'bug',
      title: `Phantom API: \`${ref.symbolName}\` not declared or imported`,
      file: ref.refFile,
      start_line: ref.refLine,
      end_line: ref.refLine,
      rationale: `\`${ref.symbolName}\` is called but not declared or imported in this file (possible hallucinated/renamed/mis-imported API).`,
      suggestion:
        'Import the symbol from the correct module, or remove the call if it was added by mistake.',
      confidence: 0.7,
      kind: 'phantom',
      trifecta_components: null,
      evidence: null,
    });
  }
  return findings;
}

/** Run the regex-driven detectors. */
export function runHookDetectors(
  diff: UnifiedDiff,
  which: { secret?: boolean; phantom?: boolean } = { secret: true, phantom: true },
): Finding[] {
  const out: Finding[] = [];
  if (which.secret !== false) out.push(...detectSecretLeaks(diff));
  if (which.phantom !== false) out.push(...detectPhantomApis(diff));
  return out;
}
