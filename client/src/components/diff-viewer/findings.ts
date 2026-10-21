/* Inline-finding support for the DiffViewer (Smart Diff / Files changed tab).
   Pure helpers + the API shape the viewer needs; mirrors comments.ts. Findings
   are persisted review findings anchored to the RIGHT (new) side of the patch. */
import type { Severity } from "@devdigest/ui";
import type { FindingActionKind, FindingRecord } from "@devdigest/shared";
import { SEVERITY_RANK } from "./constants";
import type { Line } from "./helpers";

/** What the viewer needs to render findings and report Accept / Reject. */
export interface DiffFindingApi {
  /** Findings to render, any path (each file card picks its own). */
  findings: FindingRecord[];
  /** When false, comments, stripes and pills are hidden (the dot stays). */
  show: boolean;
  /** Id of the finding whose action is in flight. */
  pendingId: string | null;
  onAction: (findingId: string, action: FindingActionKind) => void;
}

export function findingsForPath(findings: FindingRecord[], path: string): FindingRecord[] {
  return findings.filter((f) => f.file === path);
}

/** True when any finding is not dismissed (drives the file dot). */
export function hasOpenFindings(findings: FindingRecord[]): boolean {
  return findings.some((f) => !f.dismissed_at);
}

export function strongestSeverity(a: Severity | undefined, b: Severity): Severity {
  return a === undefined || SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a;
}

export interface AnchoredFindings {
  /** Left stripe per rendered line index (open findings only). */
  stripe: Map<number, Severity>;
  /** Severity pill on the first rendered line of a finding's range. */
  pill: Map<number, Severity>;
  /** Comments rendered after the last rendered line of the range. */
  after: Map<number, FindingRecord[]>;
  /** Findings whose range has no rendered line in this patch. */
  unanchored: FindingRecord[];
}

/** Match findings to rendered lines (RIGHT side: add + ctx lines by new line number). */
export function anchorFindings(findings: FindingRecord[], lines: Line[]): AnchoredFindings {
  const out: AnchoredFindings = {
    stripe: new Map(),
    pill: new Map(),
    after: new Map(),
    unanchored: [],
  };
  for (const f of findings) {
    const idx: number[] = [];
    lines.forEach((ln, i) => {
      if (
        (ln.kind === "add" || ln.kind === "ctx") &&
        ln.newNo != null &&
        ln.newNo >= f.start_line &&
        ln.newNo <= f.end_line
      )
        idx.push(i);
    });
    if (idx.length === 0) {
      out.unanchored.push(f);
      continue;
    }
    const sev = f.severity as Severity;
    if (!f.dismissed_at) {
      for (const i of idx) out.stripe.set(i, strongestSeverity(out.stripe.get(i), sev));
      const first = idx[0]!;
      out.pill.set(first, strongestSeverity(out.pill.get(first), sev));
    }
    const last = idx[idx.length - 1]!;
    out.after.set(last, [...(out.after.get(last) ?? []), f]);
  }
  return out;
}
