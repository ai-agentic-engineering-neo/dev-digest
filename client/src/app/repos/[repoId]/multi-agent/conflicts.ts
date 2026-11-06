import type { Conflict, ConflictTake, FindingRecord, Severity } from "@devdigest/shared";
import { SEVERITY_RANK } from "./constants";
import type { AgentColumnView } from "./types";

interface Located {
  columnIndex: number;
  finding: FindingRecord;
}

interface Analyzed {
  conflict: Conflict;
  findingIds: string[];
}

export function countedColumns(columns: readonly AgentColumnView[]): AgentColumnView[] {
  return columns.filter((c) => c.state.kind === "done");
}

/** Group findings of one file into locations; overlapping ranges merge transitively. */
function groupLocations(items: readonly Located[]): Located[][] {
  const sorted = [...items].sort((a, b) => a.finding.start_line - b.finding.start_line);
  const groups: Located[][] = [];
  let currentEnd = Number.NEGATIVE_INFINITY;
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    if (last !== undefined && item.finding.start_line <= currentEnd) {
      last.push(item);
      currentEnd = Math.max(currentEnd, item.finding.end_line);
    } else {
      groups.push([item]);
      currentEnd = item.finding.end_line;
    }
  }
  return groups;
}

function analyzeLocation(
  file: string,
  group: readonly Located[],
  counted: readonly AgentColumnView[],
): Analyzed | null {
  // Highest severity per counted column (first finding wins ties); overall top = first in column order.
  const best = new Map<number, FindingRecord>();
  let top: FindingRecord | null = null;
  for (const { columnIndex, finding } of [...group].sort((a, b) => a.columnIndex - b.columnIndex)) {
    const current = best.get(columnIndex);
    if (current === undefined || SEVERITY_RANK[finding.severity] > SEVERITY_RANK[current.severity]) {
      best.set(columnIndex, finding);
    }
    if (top === null || SEVERITY_RANK[finding.severity] > SEVERITY_RANK[top.severity]) top = finding;
  }
  if (top === null) return null;

  const verdicts = new Set<Severity>([...best.values()].map((f) => f.severity));
  const someIgnored = best.size < counted.length;
  if (!someIgnored && verdicts.size <= 1) return null;

  const takes: ConflictTake[] = counted.map((column, i) => {
    const finding = best.get(i);
    return {
      agent_id: column.agent.id,
      persona: column.agent.name,
      verdict: finding ? finding.severity : "ignored",
      note: finding ? finding.title : "",
    };
  });
  return {
    conflict: { file, line: Math.min(...group.map((g) => g.finding.start_line)), title: top.title, takes },
    findingIds: group.map((g) => g.finding.id),
  };
}

function analyze(columns: readonly AgentColumnView[]): Analyzed[] {
  const counted = countedColumns(columns);
  if (counted.length < 2) return [];

  const byFile = new Map<string, Located[]>();
  counted.forEach((column, columnIndex) => {
    for (const finding of column.findings) {
      const list = byFile.get(finding.file) ?? [];
      list.push({ columnIndex, finding });
      byFile.set(finding.file, list);
    }
  });

  const result: Analyzed[] = [];
  for (const [file, items] of byFile) {
    for (const group of groupLocations(items)) {
      const analyzed = analyzeLocation(file, group, counted);
      if (analyzed) result.push(analyzed);
    }
  }
  return result.sort(
    (a, b) =>
      (a.conflict.file < b.conflict.file ? -1 : a.conflict.file > b.conflict.file ? 1 : 0) ||
      a.conflict.line - b.conflict.line,
  );
}

export function findConflicts(columns: readonly AgentColumnView[]): Conflict[] {
  return analyze(columns).map((a) => a.conflict);
}

export function conflictFindingIds(columns: readonly AgentColumnView[]): Set<string> {
  return new Set(analyze(columns).flatMap((a) => a.findingIds));
}
