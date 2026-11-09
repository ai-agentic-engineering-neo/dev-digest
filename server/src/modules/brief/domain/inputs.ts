import type { Intent } from '@devdigest/shared';
import type {
  BriefBlastFacts,
  BriefBlastView,
  BriefCaller,
  BriefIntentView,
  BriefMissingInput,
} from './types.js';

/** AC-5. Order: intent, blast, smart_diff_roles (roles are never available in this build). */
export function missingInputs(args: {
  intent: BriefIntentView | null;
  blast: BriefBlastView | null;
}): BriefMissingInput[] {
  const out: BriefMissingInput[] = [];
  const { intent, blast } = args;
  if (!intent || intent.intent === null) {
    out.push({ input: 'intent', reason: intent?.status === 'failed' ? 'failed' : 'not_derived' });
  }
  if (!blast) out.push({ input: 'blast', reason: 'no_data' });
  else if (blast.degraded) out.push({ input: 'blast', reason: blast.reason ?? 'no_data' });
  out.push({ input: 'smart_diff_roles', reason: 'not_in_build' });
  return out;
}

export function intentFacts(view: BriefIntentView | null): Intent | null {
  if (!view || view.intent === null) return null;
  return { intent: view.intent, in_scope: view.in_scope, out_of_scope: view.out_of_scope };
}

/** Issue refs Intent already read (reference only), de-duplicated, view order. */
export function linkedIssueRefs(view: BriefIntentView | null): string[] {
  if (!view) return [];
  const seen = new Set<string>();
  for (const s of view.sources) {
    if (s.kind === 'issue' && s.status === 'read') seen.add(s.ref);
  }
  return [...seen];
}

export function blastFacts(view: BriefBlastView | null): BriefBlastFacts | null {
  if (!view || view.degraded) return null;
  const callers: BriefCaller[] = [];
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  for (const d of view.downstream) {
    for (const c of d.callers) callers.push({ symbol: d.symbol, file: c.file, line: c.line, name: c.name });
    for (const e of d.endpoints_affected) endpoints.add(e);
    for (const c of d.crons_affected) crons.add(c);
  }
  return {
    summary: view.summary,
    changedSymbols: view.changed_symbols.map((s) => ({ name: s.name, file: s.file, kind: s.kind })),
    callers,
    endpoints: [...endpoints].sort(),
    crons: [...crons].sort(),
  };
}

/** D5: files of the full blast map (before any caller cut). null when blast is unavailable. */
export function blastMapFiles(view: BriefBlastView | null): Set<string> | null {
  if (!view || view.degraded) return null;
  const files = new Set<string>();
  for (const s of view.changed_symbols) files.add(s.file);
  for (const d of view.downstream) {
    for (const c of d.callers) files.add(c.file);
  }
  return files;
}
