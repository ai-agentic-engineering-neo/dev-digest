import type { Conflict, ConflictTake, Severity } from '@devdigest/shared';

/**
 * T6 — deterministic conflict matcher (AC-20..23).
 *
 * Pure, synchronous, and side-effect free: no DB, no network, no LLM/embedding
 * calls. Grouping is same-file + overlapping inclusive [start_line, end_line]
 * line ranges — nothing fuzzier. This file must have zero references to
 * `container.llm`, reviewer-core, openai, or embeddings (verifiable by grep).
 *
 * The server returns EVERY overlapping-finding group (not just ones where
 * agents disagree) — "Show only conflicts" is a client-side filter over this
 * full list (AC-22/23), so we don't need to decide here what counts as a
 * "real" disagreement.
 */

/** One agent that ran as part of the multi-agent run (the roster). */
export interface RosterAgent {
  agent_id: string;
  agent_name: string;
}

/** A persisted finding, reduced to the fields the matcher needs. */
export interface ConflictFinding {
  agent_id: string;
  file: string;
  start_line: number;
  end_line: number;
  severity: Severity;
  title: string;
}

const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 3,
  WARNING: 2,
  SUGGESTION: 1,
};

/** Inclusive-range overlap test. */
function rangesOverlap(a: ConflictFinding, b: ConflictFinding): boolean {
  return a.start_line <= b.end_line && b.start_line <= a.end_line;
}

/**
 * Union-find grouping of findings that share a file and have overlapping
 * ranges, directly or transitively (A~B~C groups even if A and C don't
 * overlap directly, as long as both overlap B).
 */
function groupOverlapping(findings: ConflictFinding[]): ConflictFinding[][] {
  const n = findings.length;
  const parent = Array.from({ length: n }, (_, i) => i);

  // `parent[x]` is always in-bounds by construction (x ranges over 0..n-1 and
  // path-compression/union only ever write valid indices back into it), so
  // the non-null assertions below are safe under noUncheckedIndexedAccess.
  function find(x: number): number {
    while (parent[x]! !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  }

  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (rangesOverlap(findings[i]!, findings[j]!)) union(i, j);
    }
  }

  const groups = new Map<number, ConflictFinding[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const item = findings[i]!;
    const group = groups.get(root);
    if (group) group.push(item);
    else groups.set(root, [item]);
  }
  return [...groups.values()];
}

/**
 * Builds one `Conflict` for a group of overlapping findings on the same
 * file. Every roster agent gets a `ConflictTake`: its highest-severity
 * finding in the group, or `'ignored'` when it produced no matched finding.
 */
function buildConflict(file: string, group: ConflictFinding[], roster: RosterAgent[]): Conflict {
  const line = Math.min(...group.map((f) => f.start_line));

  // Representative title = the highest-severity finding in the group
  // (ties broken by first-encountered, for determinism given a stable input order).
  const title = group.reduce((best, f) =>
    SEVERITY_RANK[f.severity] > SEVERITY_RANK[best.severity] ? f : best,
  ).title;

  // Each agent's strongest take in this group (an agent may have produced
  // more than one overlapping finding here; keep only the most severe).
  const byAgent = new Map<string, ConflictFinding>();
  for (const f of group) {
    const existing = byAgent.get(f.agent_id);
    if (!existing || SEVERITY_RANK[f.severity] > SEVERITY_RANK[existing.severity]) {
      byAgent.set(f.agent_id, f);
    }
  }

  const takes: ConflictTake[] = roster.map((agent) => {
    const match = byAgent.get(agent.agent_id);
    return {
      agent_id: agent.agent_id,
      persona: agent.agent_name,
      verdict: match ? match.severity : 'ignored',
      note: match ? match.title : 'Did not flag',
    };
  });

  return { file, line, title, takes };
}

/**
 * Computes the full list of file/line conflict groups for a multi-agent run.
 *
 * @param roster every agent that was part of the multi-agent run (used to
 *   derive "did not flag" takes — this is NOT limited to agents that produced
 *   a finding).
 * @param findings all persisted findings from all agent runs in the roster.
 */
export function computeConflicts(roster: RosterAgent[], findings: ConflictFinding[]): Conflict[] {
  const byFile = new Map<string, ConflictFinding[]>();
  for (const f of findings) {
    const list = byFile.get(f.file);
    if (list) list.push(f);
    else byFile.set(f.file, [f]);
  }

  const conflicts: Conflict[] = [];
  for (const [file, fileFindings] of byFile) {
    for (const group of groupOverlapping(fileFindings)) {
      conflicts.push(buildConflict(file, group, roster));
    }
  }

  // Deterministic ordering for stable UI/testing: by file, then by line.
  conflicts.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));
  return conflicts;
}
