import type { FindingRecord } from "@devdigest/shared";
import type { LineRange } from "@/components/diff-viewer";
import { DIFF_FOCUS_PARAM } from "./constants";

const LINE_RE = /^[1-9]\d*$/;

/** findings = all stored findings (dismissed included); blockers = CRITICAL with dismissed_at === null. */
export function reviewCounts(
  findings: readonly Pick<FindingRecord, "severity" | "dismissed_at">[],
): { findings: number; blockers: number } {
  return {
    findings: findings.length,
    blockers: findings.filter((f) => f.severity === "CRITICAL" && f.dismissed_at === null).length,
  };
}

/** Query string with tab=diff, file=path and line/lineEnd set (deleted when lines is null); other params kept. */
export function withDiffFocus(search: string, path: string, lines: LineRange | null): string {
  const p = new URLSearchParams(search);
  p.set(DIFF_FOCUS_PARAM.tab, "diff");
  p.set(DIFF_FOCUS_PARAM.file, path);
  if (lines) {
    p.set(DIFF_FOCUS_PARAM.line, String(lines.start));
    p.set(DIFF_FOCUS_PARAM.lineEnd, String(lines.end));
  } else {
    p.delete(DIFF_FOCUS_PARAM.line);
    p.delete(DIFF_FOCUS_PARAM.lineEnd);
  }
  return p.toString();
}

/** Query string with tab set and file/line/lineEnd deleted; other params kept. */
export function withTab(search: string, tab: string): string {
  const p = new URLSearchParams(search);
  p.set(DIFF_FOCUS_PARAM.tab, tab);
  p.delete(DIFF_FOCUS_PARAM.file);
  p.delete(DIFF_FOCUS_PARAM.line);
  p.delete(DIFF_FOCUS_PARAM.lineEnd);
  return p.toString();
}

/** line must match /^[1-9]\d*$/ (else lines null); lineEnd missing/invalid/< line → end = start; no file → lines null. */
export function diffFocusFrom(search: { get(name: string): string | null }): {
  path: string | null;
  lines: LineRange | null;
} {
  const path = search.get(DIFF_FOCUS_PARAM.file) || null;
  const rawLine = search.get(DIFF_FOCUS_PARAM.line);
  if (!path || rawLine === null || !LINE_RE.test(rawLine)) return { path, lines: null };
  const start = Number(rawLine);
  const rawEnd = search.get(DIFF_FOCUS_PARAM.lineEnd);
  const end = rawEnd !== null && LINE_RE.test(rawEnd) && Number(rawEnd) >= start ? Number(rawEnd) : start;
  return { path, lines: { start, end } };
}
