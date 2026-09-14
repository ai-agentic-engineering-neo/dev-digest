import type { ChatMessage } from '@devdigest/shared';
import { INJECTION_GUARD, wrapUntrusted } from '../../platform/prompt.js';
import type { BriefFactSet } from './facts.js';
import type { Tokenizer } from './ports.js';
import { BRIEF_INPUT_TOKEN_BUDGET, FACT_CALLERS_MAX, FACT_ENDPOINTS_MAX, FACT_FILES_MAX } from './constants.js';

/**
 * System prompt + fact-payload renderer + the budget/drop loop for the ONE
 * structured call (Approach §4). `INJECTION_GUARD` is imported from
 * `platform/prompt.js` and appended to the system prompt exactly as
 * `onboarding/prompts.ts` does — no per-field keyword scanning
 * (`server/CLAUDE.md:41-43`). Every attacker-influenceable string (PR
 * title/body, issue title/body, spec content, repo-controlled paths/symbol
 * names) travels through `wrapUntrusted(label, content)` — data, never
 * instructions.
 */

export const BRIEF_SYSTEM_PROMPT = `You write a PR's Why + Risk Brief: a short "read this first" summary for a
reviewer who has not yet opened the diff. You are given a DETERMINISTIC fact
set — the PR's title/body, its cached intent (if available), a linked issue
(if any), a referenced spec document (if any), the changed-file list with
add/delete counts and HUNK LINE RANGES, and blast-radius facts (changed
symbols, cross-file callers, impacted endpoints/crons, index status). You do
NOT have file contents and you do NOT have hunk body text — only paths,
counts, and the numeric line ranges each hunk covers. Do not invent code you
cannot see.

Produce:
  what           — 1-2 sentences: what this PR changes, in plain language.
  why            — 1-2 sentences: why, grounded in the intent/issue/spec facts
                    given to you. If none of those signals are available, say
                    so plainly rather than inventing a motivation.
  risk_level     — one of "high" | "medium" | "low" for the PR as a whole.
  risks          — up to 6 risk areas. Each has:
                      kind        — one of: auth_surface, dependency,
                        performance, data_migration, api_contract,
                        config_secrets, test_coverage, other.
                      title, explanation — grounded in the facts given.
                      severity    — "high" | "medium" | "low".
                      file_refs   — 1+ {file, line?} pairs, COPIED VERBATIM
                        from the changed-file list or the blast-radius facts —
                        never a path or line you were not given.
  review_focus   — up to 5 entries, each {file, line?, reason}: a REASON TO
                    LOOK, never an asserted defect. "This touches the auth
                    middleware" is a reason to look; "this has a bug" is not
                    what this field is for.

Every file path you cite MUST be copied verbatim from the facts below —
either the changed-file list or a blast-radius caller/endpoint/symbol. Every
line number you cite MUST be a real line you were given evidence for. If you
are unsure a path or line is real, omit it rather than guess — an ungrounded
reference is dropped before any reviewer sees it, so guessing only wastes
your own output.`;

interface PayloadFlags {
  callersLimit: number;
  includeCrons: boolean;
  endpointsLimit: number;
  filesLimit: number;
  includeSpec: boolean;
  includeIssueBody: boolean;
}

/**
 * Fixed drop order (Approach §4, lowest-priority first). Never dropped: PR
 * title/body, intent, index status, the changed-file count and totals.
 * Whole-item drops only — never truncated mid-item (AC-8).
 */
const DROP_STEPS: ReadonlyArray<(f: PayloadFlags) => PayloadFlags> = [
  (f) => ({ ...f, callersLimit: Math.min(f.callersLimit, FACT_CALLERS_MAX) }),
  (f) => ({ ...f, includeCrons: false }),
  (f) => ({ ...f, endpointsLimit: Math.min(f.endpointsLimit, FACT_ENDPOINTS_MAX) }),
  (f) => ({ ...f, filesLimit: Math.min(f.filesLimit, FACT_FILES_MAX) }),
  (f) => ({ ...f, includeSpec: false }),
  (f) => ({ ...f, includeIssueBody: false }),
];

export interface RenderedBriefPayload {
  text: string;
  tokens: number;
  /** How many of the six drop CATEGORIES above were actually applied — the
   *  value persisted as `dropped_inputs` (AC-8). A category counts once
   *  regardless of how many individual entries it removed. */
  droppedCount: number;
}

/** The full messages array for the one `completeStructured` call, plus what
 *  the budget loop had to drop to get there. */
export function buildBriefMessages(
  facts: BriefFactSet,
  tokenizer: Tokenizer,
): { messages: ChatMessage[]; payload: RenderedBriefPayload } {
  let flags: PayloadFlags = {
    callersLimit: facts.blast.callers.length,
    includeCrons: true,
    endpointsLimit: facts.blast.impactedEndpoints.length,
    filesLimit: facts.files.length,
    includeSpec: facts.spec.available,
    includeIssueBody: facts.issue.available,
  };
  const system = `${BRIEF_SYSTEM_PROMPT}\n\n${INJECTION_GUARD}`;

  let stepIdx = 0;
  for (;;) {
    const user = buildUserPayload(facts, flags);
    // Q3: the budget applies to the WHOLE assembled model input — system
    // prompt + guard + user payload — not the facts payload alone.
    const tokens = tokenizer.count(system + user);
    if (tokens <= BRIEF_INPUT_TOKEN_BUDGET || stepIdx >= DROP_STEPS.length) {
      return {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        payload: { text: user, tokens, droppedCount: countDroppedCategories(facts, flags) },
      };
    }
    flags = DROP_STEPS[stepIdx]!(flags);
    stepIdx += 1;
  }
}

function countDroppedCategories(facts: BriefFactSet, flags: PayloadFlags): number {
  let n = 0;
  if (flags.callersLimit < facts.blast.callers.length) n += 1;
  if (!flags.includeCrons && facts.blast.crons.length > 0) n += 1;
  if (flags.endpointsLimit < facts.blast.impactedEndpoints.length) n += 1;
  if (flags.filesLimit < facts.files.length) n += 1;
  if (!flags.includeSpec && facts.spec.available) n += 1;
  if (!flags.includeIssueBody && facts.issue.available) n += 1;
  return n;
}

function buildUserPayload(facts: BriefFactSet, flags: PayloadFlags): string {
  const sections = [
    renderPr(facts),
    renderIntent(facts),
    renderDiff(facts, flags),
    facts.issue.available ? renderIssue(facts, flags) : null,
    flags.includeSpec && facts.spec.available ? renderSpec(facts) : null,
    renderBlast(facts, flags),
  ].filter((s): s is string => s != null);
  return sections.join('\n\n');
}

function renderPr(facts: BriefFactSet): string {
  const p = facts.pr;
  const meta = [
    `number: ${p.number}`,
    `base: ${p.base}`,
    `head sha: ${p.headSha}`,
    `totals: +${p.additions} -${p.deletions} across ${p.filesCount} file(s)`,
  ].join('\n');
  const title = wrapUntrusted('pr-title', p.title);
  const body = wrapUntrusted('pr-body', p.body ?? '(no description)');
  return `## Pull request\n${meta}\ntitle: ${title}\nbody:\n${body}`;
}

function renderIntent(facts: BriefFactSet): string {
  const i = facts.intent;
  if (!i.available) return '## Intent\n(not available — no cached intent for this PR)';
  const lines = [
    i.summary ? `summary: ${i.summary}` : null,
    i.inScope && i.inScope.length > 0 ? `in scope: ${i.inScope.join('; ')}` : null,
    i.outOfScope && i.outOfScope.length > 0 ? `out of scope: ${i.outOfScope.join('; ')}` : null,
    i.contextGaps && i.contextGaps.length > 0 ? `context gaps: ${i.contextGaps.join('; ')}` : null,
  ].filter((l): l is string => l != null);
  const body = lines.length > 0 ? lines.join('\n') : '(no detail)';
  return `## Intent (cached — never recomputed here)\n${wrapUntrusted('intent', body)}`;
}

function renderDiff(facts: BriefFactSet, flags: PayloadFlags): string {
  // "largest-churn first kept" (drop step 4) — sort once, slice either way,
  // so the render is identical whether or not this step ends up firing.
  const sorted = [...facts.files].sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions));
  const shown = sorted.slice(0, flags.filesLimit);
  const lines = shown.map((f) => {
    const ranges = f.hunks.map((h) => `${h.start}-${h.end}`).join(',');
    return `${f.path} +${f.additions} -${f.deletions}${ranges ? ` hunks: ${ranges}` : ' (no hunk data)'}`;
  });
  const omitted = facts.files.length - shown.length;
  const omittedNote = omitted > 0 ? `\n(+${omitted} more changed file(s) omitted for budget)` : '';
  return `## Changed files (${facts.files.length} total)\n${wrapUntrusted('diff', lines.join('\n'))}${omittedNote}`;
}

function renderIssue(facts: BriefFactSet, flags: PayloadFlags): string {
  const iss = facts.issue;
  const title = wrapUntrusted('issue-title', iss.title ?? '');
  if (!flags.includeIssueBody) {
    return `## Linked issue #${iss.number}\ntitle: ${title}\n(body omitted for budget)`;
  }
  const body = wrapUntrusted('issue-body', iss.body ?? '(no body)');
  return `## Linked issue #${iss.number}\ntitle: ${title}\nbody:\n${body}`;
}

function renderSpec(facts: BriefFactSet): string {
  const s = facts.spec;
  return `## Referenced spec (${s.path})\n${wrapUntrusted('spec', s.content ?? '')}`;
}

function renderBlast(facts: BriefFactSet, flags: PayloadFlags): string {
  const b = facts.blast;
  const sections: string[] = [
    `index status: ${b.indexStatus}${b.indexReason ? ` (${b.indexReason})` : ''}${b.degraded ? ' [degraded]' : ''}`,
  ];

  if (b.changedSymbols.length > 0) {
    const lines = b.changedSymbols.map((s) => `${s.file}: ${s.name} (${s.kind})`).join('\n');
    sections.push(`### Changed symbols\n${wrapUntrusted('changed-symbols', lines)}`);
  }

  const callers = b.callers.slice(0, flags.callersLimit);
  if (callers.length > 0) {
    const lines = callers
      .map((c) => `${c.file}:${c.line} ${c.symbol} (calls ${c.viaSymbol}, rank=${c.rank})`)
      .join('\n');
    const omitted = b.callers.length - callers.length;
    const header = omitted > 0 ? `### Cross-file callers (top ${callers.length} of ${b.callers.length})` : '### Cross-file callers';
    sections.push(`${header}\n${wrapUntrusted('callers', lines)}`);
  }

  const endpoints = b.impactedEndpoints.slice(0, flags.endpointsLimit);
  if (endpoints.length > 0) {
    const omitted = b.impactedEndpoints.length - endpoints.length;
    const header =
      omitted > 0 ? `### Impacted endpoints (top ${endpoints.length} of ${b.impactedEndpoints.length})` : '### Impacted endpoints';
    sections.push(`${header}\n${wrapUntrusted('endpoints', endpoints.join('\n'))}`);
  }

  if (flags.includeCrons && b.crons.length > 0) {
    sections.push(`### Impacted crons\n${wrapUntrusted('crons', b.crons.join('\n'))}`);
  }

  return `## Blast radius\n${sections.join('\n\n')}`;
}
