/**
 * specs/13-multi-agent-review.md — conflict computation. Pure (no `this`, no
 * I/O, no LLM call); same posture as `smart-diff.ts`. Conflicts are computed
 * ON READ, every time, and never stored (D6, N13, AC-35).
 *
 * `computeConflicts` deliberately does NOT take the wire-shape `AgentColumn`
 * from `contracts/observability.ts` — `AgentColumnFinding` is a deliberate
 * display subset with no `end_line` (D13), but D-P1/D-P3's matching needs a
 * finding's full [start_line, end_line] span. `MultiAgentService` builds the
 * richer `ConflictColumn[]` input below straight from the persisted
 * `FindingRow`s, separately from the compact response columns.
 */
import type { Conflict, ConflictTake, Severity } from '@devdigest/shared';
import { CONFLICT_MAX_RANGE_LINES, CONFLICT_NOTE_MAX_CHARS, FULL_FILE_KINDS } from './constants.js';

/** One finding as needed for conflict matching (a superset of the fields
 *  `AgentColumnFinding` exposes, plus `end_line` and the raw `rationale`). */
export interface ConflictFinding {
  id: string;
  severity: Severity;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  kind: string | null;
  rationale: string;
}

/** One agent's column, as needed to compute conflicts — a subset of
 *  `AgentColumn` (drops everything conflicts don't read) plus full findings. */
export interface ConflictColumn {
  agent_id: string;
  agent_name: string;
  status: 'done' | 'failed' | 'running' | 'cancelled';
  findings: ConflictFinding[];
}

interface TaggedFinding extends ConflictFinding {
  agentId: string;
  agentName: string;
}

interface Location {
  file: string;
  findings: TaggedFinding[];
}

/** kind class for file-scoped matching (D-P1): the finding's own `kind`,
 *  defaulting to 'finding' — NOT necessarily one of `FULL_FILE_KINDS` (a
 *  finding can be file-scoped purely because its range is oversized). */
function kindClassOf(f: ConflictFinding): string {
  return f.kind ?? 'finding';
}

function isFileScoped(f: ConflictFinding): boolean {
  if (FULL_FILE_KINDS.has(kindClassOf(f))) return true;
  const spanLines = f.end_line - f.start_line + 1;
  return spanLines > CONFLICT_MAX_RANGE_LINES;
}

function severityRank(s: Severity): number {
  return s === 'CRITICAL' ? 3 : s === 'WARNING' ? 2 : 1;
}

/** Deterministic pick when one agent has >1 finding in the same location
 *  (possible via D-P3's transitive-closure chaining): most severe first,
 *  tie-broken by the lexicographically smallest finding id. */
function morePreferred(a: TaggedFinding, b: TaggedFinding): boolean {
  const ra = severityRank(a.severity);
  const rb = severityRank(b.severity);
  if (ra !== rb) return ra > rb;
  return a.id < b.id;
}

function noteFromRationale(rationale: string): string {
  const firstLine = (rationale.split('\n')[0] ?? '').trim();
  return firstLine.length > CONFLICT_NOTE_MAX_CHARS
    ? `${firstLine.slice(0, CONFLICT_NOTE_MAX_CHARS - 1)}…`
    : firstLine;
}

/** Group one file's findings into locations (D-P1, D-P3). File-scoped
 *  findings group by kind class (line numbers ignored); line-scoped findings
 *  group by the interval-merge transitive closure of "ranges intersect". */
function locationsForFile(file: string, findings: TaggedFinding[]): Location[] {
  const fileScopedByKind = new Map<string, TaggedFinding[]>();
  const lineScoped: TaggedFinding[] = [];
  for (const f of findings) {
    if (isFileScoped(f)) {
      const key = kindClassOf(f);
      const list = fileScopedByKind.get(key) ?? [];
      list.push(f);
      fileScopedByKind.set(key, list);
    } else {
      lineScoped.push(f);
    }
  }

  const locations: Location[] = [...fileScopedByKind.values()].map((group) => ({ file, findings: group }));

  // D-P3: sort by (start_line, end_line, id), sweep, start a new location
  // whenever the next finding's start_line exceeds the running max end_line.
  const sorted = [...lineScoped].sort(
    (a, b) => a.start_line - b.start_line || a.end_line - b.end_line || a.id.localeCompare(b.id),
  );
  let current: TaggedFinding[] | null = null;
  let runningMaxEnd = -Infinity;
  for (const f of sorted) {
    if (current && f.start_line <= runningMaxEnd) {
      current.push(f);
      runningMaxEnd = Math.max(runningMaxEnd, f.end_line);
    } else {
      current = [f];
      runningMaxEnd = f.end_line;
      locations.push({ file, findings: current });
    }
  }

  return locations;
}

/**
 * Compute every conflict across a multi-agent run's columns. Participants
 * (D8, AC-38) are columns with status 'done' — a failed, cancelled or still
 * running agent is never rendered as "did not flag". Fewer than two
 * participants → no conflicts are computable (AC-42; the client, not this
 * function, distinguishes that from "zero conflicts, agents agree", AC-40).
 */
export function computeConflicts(columns: ConflictColumn[]): Conflict[] {
  // Sort participants by agent_id up front: `takes` order (and therefore the
  // whole `Conflict` object) must be identical for the same stored run
  // regardless of the order `columns` happened to arrive in (D-P2's
  // determinism requirement) — the caller's row order is not guaranteed.
  const participants = columns.filter((c) => c.status === 'done').sort((a, b) => a.agent_id.localeCompare(b.agent_id));
  if (participants.length < 2) return [];

  const byFile = new Map<string, TaggedFinding[]>();
  for (const col of participants) {
    for (const f of col.findings) {
      const list = byFile.get(f.file) ?? [];
      list.push({ ...f, agentId: col.agent_id, agentName: col.agent_name });
      byFile.set(f.file, list);
    }
  }

  const locations: Location[] = [];
  for (const [file, findings] of byFile) {
    locations.push(...locationsForFile(file, findings));
  }

  const conflicts: Conflict[] = [];
  for (const loc of locations) {
    // One flagging finding per participating agent (D-P3's chaining caveat
    // can put >1 of one agent's findings in the same location).
    const byAgent = new Map<string, TaggedFinding>();
    for (const f of loc.findings) {
      const existing = byAgent.get(f.agentId);
      if (!existing || morePreferred(f, existing)) byAgent.set(f.agentId, f);
    }

    const takes: ConflictTake[] = participants.map((col) => {
      const chosen = byAgent.get(col.agent_id);
      if (chosen) {
        return {
          agent_id: col.agent_id,
          persona: col.agent_name,
          verdict: chosen.severity,
          note: noteFromRationale(chosen.rationale),
        };
      }
      return { agent_id: col.agent_id, persona: col.agent_name, verdict: 'ignored' as const, note: '' };
    });

    const flagging = takes.filter((t) => t.verdict !== 'ignored');
    const ignored = takes.filter((t) => t.verdict === 'ignored');
    const distinctSeverities = new Set(flagging.map((t) => t.verdict));
    // AC-37: contended when at least one agent ignored while another flagged,
    // OR when >=2 flagging agents disagree on severity. Same severity from
    // every flagging agent (with no ignoring participant) is agreement.
    const contended = (ignored.length > 0 && flagging.length > 0) || (flagging.length >= 2 && distinctSeverities.size >= 2);
    if (!contended) continue;

    // D-P2: line = min start_line among the flagging findings (the ones
    // chosen above), tie-broken by the lexicographically smallest finding id.
    // Title comes from that same anchor finding.
    const flaggingFindings = [...byAgent.values()].sort(
      (a, b) => a.start_line - b.start_line || a.id.localeCompare(b.id),
    );
    const anchor = flaggingFindings[0]!;

    conflicts.push({ file: loc.file, line: anchor.start_line, title: anchor.title, takes });
  }

  conflicts.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.title.localeCompare(b.title));
  return conflicts;
}
