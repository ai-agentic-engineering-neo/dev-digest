/**
 * Findings → terminal text (specs/08-pre-push-cli.md §"Output format").
 * Pure, string-in/string-out — no I/O, no process/exit-code knowledge. The
 * exit-code decision line ("Blocking findings present — exiting 1.") is
 * `run.ts`'s job, not this module's; this file only renders the report body
 * (header, finding blocks or "No findings.", counts footer, grounding line,
 * context note).
 */

export type RenderSeverity = 'CRITICAL' | 'WARNING' | 'SUGGESTION';

export interface RenderFinding {
  severity: RenderSeverity;
  file: string;
  start_line: number;
  end_line: number;
  title: string;
  rationale: string;
  suggestion?: string | null;
}

/**
 * specs/09-project-context-folder.md (D5/AC-30/AC-31) — one document the
 * server's project-context resolution considered for this run, WITH its
 * pinned repo (the CLI path has no single bound repo — see
 * `mcp-server/src/cli/run.ts`'s `RawProjectContextDoc`).
 */
export interface RenderProjectContextDoc {
  repo: { full_name: string };
  path: string;
  tokens: number;
  origin: 'agent' | 'skill';
  skill?: string | null;
  /** Present only on a skipped document — why it isn't in the prompt. */
  reason?: string | null;
}

export interface RenderReviewInput {
  /** Only 'working' is reachable today; the map below is future-proofed for
   *  when 'staged'/'branch' render too. */
  mode: string;
  filesReviewed: number;
  agentName: string;
  findings: RenderFinding[];
  /** `countBlockers(findings, ci_fail_on)` from the API response. */
  blockers: number;
  /** The agent's blocking gate, e.g. 'critical' — shown so the reader knows
   *  WHICH policy produced `blockers`. */
  ciFailOn: string;
  /** e.g. "3/4 passed" — the API's citation-grounding summary, as-is. */
  grounding: string;
  /** specs/09 — always present (empty arrays when nothing is attached), so
   *  this renderer never branches on the field's absence. */
  projectContext: { injected: RenderProjectContextDoc[]; skipped: RenderProjectContextDoc[] };
}

const MODE_LABELS: Record<string, string> = {
  working: 'working tree',
  staged: 'staged changes',
  branch: 'branch diff',
};

/** Same ordering `SEV_RANK` (`reviewer-core/src/output/to-review.ts:23`)
 *  defines — CRITICAL first. */
const SEV_RANK: Record<RenderSeverity, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

function formatLocation(f: RenderFinding): string {
  return f.start_line === f.end_line ? `${f.file}:${f.start_line}` : `${f.file}:${f.start_line}-${f.end_line}`;
}

/** Two-space continuation indent, applied line-by-line so a multi-line
 *  rationale/suggestion stays readable without re-wrapping it. */
function indentedLines(text: string): string[] {
  return text.split('\n').map((line) => `  ${line}`);
}

export function renderReview(input: RenderReviewInput): string {
  const lines: string[] = [];
  const modeLabel = MODE_LABELS[input.mode] ?? input.mode;
  lines.push(`devdigest review — ${modeLabel} (${input.filesReviewed} file(s), agent "${input.agentName}")`);
  lines.push('');

  if (input.findings.length === 0) {
    lines.push('No findings. Looks good.');
  } else {
    // Severity rank descending, then file path ascending, then start_line ascending.
    const sorted = [...input.findings].sort((a, b) => {
      const rankDiff = SEV_RANK[b.severity] - SEV_RANK[a.severity];
      if (rankDiff !== 0) return rankDiff;
      const fileDiff = a.file.localeCompare(b.file);
      if (fileDiff !== 0) return fileDiff;
      return a.start_line - b.start_line;
    });

    for (const f of sorted) {
      lines.push(`${f.severity.padEnd(8)}  ${formatLocation(f)}  ${f.title}`);
      lines.push(...indentedLines(f.rationale));
      if (f.suggestion) {
        const [first, ...rest] = f.suggestion.split('\n');
        lines.push(`  Suggestion: ${first}`);
        lines.push(...rest.map((l) => `  ${l}`));
      }
      lines.push('');
    }

    const counts: Record<RenderSeverity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
    for (const f of input.findings) counts[f.severity] += 1;
    lines.push(
      `${input.findings.length} finding(s) · ${counts.CRITICAL} critical · ${counts.WARNING} warning · ` +
        `${counts.SUGGESTION} suggestion — ${input.blockers} blocking (gate: ${input.ciFailOn})`,
    );
  }

  lines.push(...renderProjectContextSection(input.projectContext));

  lines.push(`Citation grounding: ${input.grounding}`);
  lines.push(
    'Note: no repo-map, caller or PR-intent context — this is the pre-push pass. Project context ' +
      "(attached documents) IS included, read from each document's repo's synced default-branch " +
      'checkout — never your local working-copy edits.',
  );

  return lines.join('\n');
}

/**
 * specs/09-project-context-folder.md AC-31 — because the CLI path persists
 * no run trace, this is the ONLY place a pre-push run's project-context
 * outcome is surfaced at all. Empty (no lines) when nothing was attached, so
 * a run with zero attachments renders identically to before this feature.
 */
function renderProjectContextSection(projectContext: RenderReviewInput['projectContext']): string[] {
  const { injected, skipped } = projectContext;
  if (injected.length === 0 && skipped.length === 0) return [];

  const lines: string[] = ['', 'Project context:'];
  for (const d of injected) {
    lines.push(`  + ${d.path} (${d.repo.full_name}) — ${d.tokens} token(s) — ${originLabel(d)}`);
  }
  for (const d of skipped) {
    lines.push(`  - ${d.path} (${d.repo.full_name}) — skipped: ${d.reason ?? 'unknown'} — ${originLabel(d)}`);
  }
  return lines;
}

function originLabel(d: RenderProjectContextDoc): string {
  return d.origin === 'skill' ? `via skill "${d.skill}"` : 'direct';
}
