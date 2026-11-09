import {
  MAX_BRIEF_FOCUS,
  MAX_BRIEF_RISKS,
  MAX_REFS_PER_RISK,
  FOCUS_REASON_MAX_CHARS,
  RISK_EXPLANATION_MAX_CHARS,
  RISK_KIND_MAX_CHARS,
  RISK_TITLE_MAX_CHARS,
  SUMMARY_MAX_CHARS,
} from '../constants.js';
import { newSideRanges, parseFileRef, snapLine } from './hunks.js';
import type { BriefFileRef, BriefFocusItem, BriefReplyData, BriefRisk, HunkRange } from './types.js';

export interface GroundingContext {
  changed: ReadonlyMap<string, HunkRange[]>;
  /** null = blast unavailable: blast-only paths are not groundable. */
  blastFiles: ReadonlySet<string> | null;
}

const SEVERITY_RANK: Record<BriefRisk['severity'], number> = { high: 2, medium: 1, low: 0 };

function clamp(text: string, max: number): string {
  return text.trim().slice(0, max);
}

function isKnownPath(path: string, ctx: GroundingContext): boolean {
  return ctx.changed.has(path) || (ctx.blastFiles?.has(path) ?? false);
}

function groundRef(raw: string, ctx: GroundingContext): BriefFileRef | null {
  const { path, start, end } = parseFileRef(raw);
  if (!isKnownPath(path, ctx)) return null;
  const ref = start === null ? path : end === null ? `${path}:${start}` : `${path}:${start}-${end}`;
  return { ref, path, start_line: start, end_line: end, in_diff: ctx.changed.has(path) };
}

function groundRisks(risks: BriefReplyData['risks'], ctx: GroundingContext): BriefRisk[] {
  const grounded: { index: number; risk: BriefRisk }[] = [];
  risks.forEach((risk, index) => {
    const seen = new Set<string>();
    const refs: BriefFileRef[] = [];
    for (const raw of risk.file_refs) {
      const ref = groundRef(raw, ctx);
      if (!ref || seen.has(ref.ref) || refs.length >= MAX_REFS_PER_RISK) continue;
      seen.add(ref.ref);
      refs.push(ref);
    }
    if (refs.length === 0) return;
    const kind = clamp(risk.kind, RISK_KIND_MAX_CHARS).toLowerCase();
    grounded.push({
      index,
      risk: {
        kind: kind === '' ? 'other' : kind,
        title: clamp(risk.title, RISK_TITLE_MAX_CHARS),
        explanation: clamp(risk.explanation, RISK_EXPLANATION_MAX_CHARS),
        severity: risk.severity,
        file_refs: refs.map((r) => r.ref),
        refs,
      },
    });
  });
  return [...grounded]
    .sort((a, b) => SEVERITY_RANK[b.risk.severity] - SEVERITY_RANK[a.risk.severity] || a.index - b.index)
    .slice(0, MAX_BRIEF_RISKS)
    .sort((a, b) => a.index - b.index)
    .map((g) => g.risk);
}

function groundFocus(items: BriefReplyData['review_focus'], ctx: GroundingContext): BriefFocusItem[] {
  const out: BriefFocusItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const file = item.file.trim();
    if (!isKnownPath(file, ctx)) continue;
    const reason = clamp(item.reason, FOCUS_REASON_MAX_CHARS);
    const hunks = ctx.changed.get(file);
    let focus: BriefFocusItem;
    if (hunks) {
      const snapped = snapLine(item.line, newSideRanges(hunks));
      focus = { file, line: snapped.line, file_level: snapped.fileLevel, in_diff: true, reason };
    } else {
      if (item.line < 1) continue;
      focus = { file, line: item.line, file_level: false, in_diff: false, reason };
    }
    const key = `${focus.file}\0${focus.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(focus);
  }
  return out.slice(0, MAX_BRIEF_FOCUS);
}

/** Drops invented paths, snaps lines into the diff, applies the caps and clamps text (AC-6/7/14/15). */
export function groundBrief(
  reply: BriefReplyData,
  ctx: GroundingContext,
): { summary: string; risks: BriefRisk[]; review_focus: BriefFocusItem[] } {
  return {
    summary: clamp(reply.summary, SUMMARY_MAX_CHARS),
    risks: groundRisks(reply.risks, ctx),
    review_focus: groundFocus(reply.review_focus, ctx),
  };
}
