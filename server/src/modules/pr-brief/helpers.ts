/** pr-brief — pure helpers (ring 2). Unit-testable without any double. */
import { z } from 'zod';
import {
  RunTrace,
  type BlastRadiusResponse,
  type ChatMessage,
  type PrBrief,
  type PrBriefDraft,
  type PrBriefFocusItem,
  type PrBriefReview,
  type Risk,
  type RunLogLine,
  type SmartDiff,
} from '@devdigest/shared';
import { ConfigError } from '../../platform/errors.js';
import {
  MAX_CALLERS,
  MAX_ERROR_CHARS,
  MAX_FILE_CHARS,
  MAX_FINDINGS,
  MAX_FOCUS,
  MAX_RATIONALE_CHARS,
  MAX_RISKS,
  MAX_SUMMARY_CHARS,
  MAX_SYMBOLS,
  MAX_TOTAL_CHARS,
  TOOL_NAME,
  TRACE_AGENT_NAME,
} from './constants.js';
import type { PrFileInfo, PullInfo, ReviewFindingInput, RunUsage } from './ports.js';

const RISK_KINDS = ['auth', 'dependency', 'performance', 'data', 'api_change', 'config', 'other'] as const;
const RISK_SEVERITIES = ['high', 'medium', 'low'] as const;

/**
 * What the model is asked for: the strict draft with its enums and `line` relaxed,
 * so a cased or stringly-typed value does not fail the whole run. `normaliseDraft`
 * maps it back to the strict `PrBriefDraft` shape.
 */
export const PrBriefDraftLoose = z.object({
  summary: z.string(),
  risks: z.array(
    z.object({
      kind: z.string(),
      title: z.string(),
      explanation: z.string(),
      severity: z.string(),
      file_refs: z.array(z.unknown()),
    }),
  ),
  review_focus: z.array(
    z.object({
      path: z.string(),
      line: z.union([z.number(), z.string(), z.null()]),
      reason: z.string(),
    }),
  ),
});
export type PrBriefDraftLoose = z.infer<typeof PrBriefDraftLoose>;

const oneOf = <T extends string>(allowed: readonly T[], value: string, fallback: T): T => {
  const v = value.trim().toLowerCase();
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
};

function normaliseLine(line: number | string | null): number | null {
  if (typeof line === 'number') return Number.isInteger(line) ? line : null;
  if (typeof line === 'string' && /^\s*\d+\s*$/.test(line)) return parseInt(line, 10);
  return null;
}

/** Loose model output -> the strict `PrBriefDraft` shape (validated by the caller). */
export function normaliseDraft(loose: PrBriefDraftLoose): PrBriefDraft {
  return {
    summary: loose.summary,
    risks: loose.risks.map((r) => ({
      kind: oneOf(RISK_KINDS, r.kind, 'other'),
      title: r.title,
      explanation: r.explanation,
      severity: oneOf(RISK_SEVERITIES, r.severity, 'medium'),
      file_refs: r.file_refs.filter((x): x is string => typeof x === 'string'),
    })),
    review_focus: loose.review_focus.map((f) => ({ path: f.path, line: normaliseLine(f.line), reason: f.reason })),
  };
}

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** New-side line numbers present in a unified patch (same counting as the client diff viewer). */
export function newSideLines(patch: string | null | undefined): Set<number> {
  const lines = new Set<number>();
  if (!patch) return lines;
  let newNo = 0;
  for (const raw of patch.split('\n')) {
    if (raw.startsWith('@@')) {
      const m = raw.match(HUNK_HEADER_RE);
      if (m) newNo = parseInt(m[2]!, 10);
    } else if (raw.startsWith('+')) {
      lines.add(newNo);
      newNo++;
    } else if (raw.startsWith('-')) {
      // old side only
    } else {
      lines.add(newNo);
      newNo++;
    }
  }
  return lines;
}

export interface FileRef {
  path: string;
  start: number | null;
  end: number | null;
}

/** `path`, `path:line` or `path:start-end`. */
export function parseRef(ref: string): FileRef {
  const m = ref.trim().match(/^(.*?):(\d+)(?:-(\d+))?$/);
  if (!m) return { path: ref.trim(), start: null, end: null };
  const start = parseInt(m[2]!, 10);
  const end = m[3] ? parseInt(m[3], 10) : start;
  return { path: m[1]!, start: Math.min(start, end), end: Math.max(start, end) };
}

export function formatRef(ref: FileRef): string {
  if (ref.start === null || ref.end === null) return ref.path;
  return ref.start === ref.end ? `${ref.path}:${ref.start}` : `${ref.path}:${ref.start}-${ref.end}`;
}

export interface VerifyResult {
  draft: PrBriefDraft;
  /** Refs (focus items and risk refs) examined / kept; whole items dropped count their refs. */
  refsTotal: number;
  refsKept: number;
  droppedItems: number;
}

/**
 * Drop focus items and risks whose path is not a changed file; a line outside
 * the new-side hunks becomes "no line"; a partly-covered range is clipped.
 */
export function verifyDraft(draft: PrBriefDraft, files: readonly { path: string; patch: string | null }[]): VerifyResult {
  const byPath = new Map<string, Set<number>>();
  for (const f of files) byPath.set(f.path, newSideLines(f.patch));
  let refsTotal = 0;
  let refsKept = 0;
  let droppedItems = 0;

  const review_focus: PrBriefFocusItem[] = [];
  for (const item of draft.review_focus) {
    refsTotal++;
    const lines = byPath.get(item.path);
    if (!lines) {
      droppedItems++;
      continue;
    }
    refsKept++;
    review_focus.push({ path: item.path, line: item.line !== null && lines.has(item.line) ? item.line : null, reason: item.reason });
  }

  const risks: Risk[] = [];
  for (const risk of draft.risks) {
    const refs: string[] = [];
    for (const raw of risk.file_refs) {
      refsTotal++;
      const ref = parseRef(raw);
      const lines = byPath.get(ref.path);
      if (!lines) continue;
      refsKept++;
      if (ref.start === null || ref.end === null) {
        refs.push(ref.path);
        continue;
      }
      const inside = [...lines].filter((n) => n >= ref.start! && n <= ref.end!).sort((a, b) => a - b);
      if (inside.length === 0) refs.push(ref.path);
      else refs.push(formatRef({ path: ref.path, start: inside[0]!, end: inside[inside.length - 1]! }));
    }
    if (risk.file_refs.length > 0 && refs.length === 0) {
      droppedItems++;
      continue;
    }
    risks.push({ ...risk, file_refs: refs });
  }
  return { draft: { summary: draft.summary, risks, review_focus }, refsTotal, refsKept, droppedItems };
}

/** Summary at most 400 chars, at most 5 risks, at most 6 focus items. */
export function trimDraft(draft: PrBriefDraft): PrBriefDraft {
  const summary = draft.summary.trim();
  return {
    summary: summary.length > MAX_SUMMARY_CHARS ? `${summary.slice(0, MAX_SUMMARY_CHARS - 1).trimEnd()}…` : summary,
    risks: draft.risks.slice(0, MAX_RISKS),
    review_focus: draft.review_focus.slice(0, MAX_FOCUS),
  };
}

export interface InputFile {
  path: string;
  patch: string;
}

export interface SelectedFiles {
  included: InputFile[];
  /** Changed files listed by name only (no patch, or over the total cap). */
  named: string[];
  total: number;
}

function cutPatch(patch: string): string {
  if (patch.length <= MAX_FILE_CHARS) return patch;
  const cut = patch.slice(0, MAX_FILE_CHARS);
  const nl = cut.lastIndexOf('\n');
  return `${nl > MAX_FILE_CHARS / 2 ? cut.slice(0, nl) : cut}\n... [truncated]`;
}

/** Files in Smart Diff order, capped per file and in total; overflow files are only named. */
export function selectFiles(files: readonly PrFileInfo[], smartDiff: SmartDiff | null): SelectedFiles {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const ordered: PrFileInfo[] = [];
  const seen = new Set<string>();
  for (const g of smartDiff?.groups ?? []) {
    for (const sf of g.files) {
      const f = byPath.get(sf.path);
      if (f && !seen.has(f.path)) {
        seen.add(f.path);
        ordered.push(f);
      }
    }
  }
  for (const f of files) if (!seen.has(f.path)) ordered.push(f);

  const included: InputFile[] = [];
  const named: string[] = [];
  let total = 0;
  for (const f of ordered) {
    if (!f.patch || !f.patch.trim()) {
      named.push(f.path);
      continue;
    }
    const patch = cutPatch(f.patch);
    if (total + patch.length > MAX_TOTAL_CHARS) {
      named.push(f.path);
      continue;
    }
    total += patch.length;
    included.push({ path: f.path, patch });
  }
  return { included, named, total: files.length };
}

/** At most 30 findings, rationale cut to 200 chars. */
export function selectFindings(findings: readonly ReviewFindingInput[]): ReviewFindingInput[] {
  return findings.slice(0, MAX_FINDINGS).map((f) => ({
    ...f,
    rationale: f.rationale.length > MAX_RATIONALE_CHARS ? `${f.rationale.slice(0, MAX_RATIONALE_CHARS)}…` : f.rationale,
  }));
}

/** At most 10 changed symbols with at most 5 callers each. */
export function blastDigest(blast: BlastRadiusResponse): string {
  const callersBySymbol = new Map(blast.downstream.map((d) => [d.symbol, d.callers]));
  const lines: string[] = [];
  for (const s of blast.changed_symbols.slice(0, MAX_SYMBOLS)) {
    const callers = (callersBySymbol.get(s.name) ?? []).slice(0, MAX_CALLERS);
    lines.push(`${s.name} (${s.kind}, ${s.file})${callers.length ? ` <- ${callers.map((c) => `${c.name} ${c.file}:${c.line}`).join(', ')}` : ''}`);
  }
  return lines.join('\n');
}

/** Escape a value placed inside a double-quoted attribute. */
function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** A closing tag inside data must not end the untrusted block early. */
function neutralize(text: string): string {
  return text.replace(/<\/untrusted/gi, '<\\/untrusted');
}

const untrusted = (source: string, text: string) =>
  `<untrusted source="${escapeAttr(source)}">\n${neutralize(text)}\n</untrusted>`;

export interface BriefPromptInput {
  systemPrompt: string;
  pull: Pick<PullInfo, 'number' | 'title' | 'branch' | 'body'>;
  selected: SelectedFiles;
  findings: readonly ReviewFindingInput[];
  intent: { intent: string; inScope: string[]; outOfScope: string[] } | null;
  blast: string | null;
}

export interface BriefPrompt {
  messages: ChatMessage[];
  system: string;
  user: string;
  prDescription: string | null;
  intentText: string | null;
}

/** Every PR, diff, finding, intent and blast text is data, wrapped as untrusted. */
export function buildMessages(input: BriefPromptInput): BriefPrompt {
  const parts: string[] = [`Pull request #${input.pull.number}`];
  parts.push(untrusted('title', input.pull.title));
  parts.push(untrusted('branch', input.pull.branch));
  const prDescription = input.pull.body?.trim() ? input.pull.body.slice(0, MAX_FILE_CHARS) : null;
  if (prDescription) parts.push(untrusted('description', prDescription));

  let intentText: string | null = null;
  if (input.intent) {
    intentText = [
      input.intent.intent,
      input.intent.inScope.length ? `In scope: ${input.intent.inScope.join('; ')}` : '',
      input.intent.outOfScope.length ? `Out of scope: ${input.intent.outOfScope.join('; ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    parts.push('Stored intent of the change:');
    parts.push(untrusted('intent', intentText));
  }

  if (input.findings.length > 0) {
    parts.push('Findings of the latest review (not dismissed):');
    parts.push(
      untrusted(
        'review-findings',
        input.findings.map((f) => `[${f.severity}] ${f.file}:${f.startLine} ${f.title} - ${f.rationale}`).join('\n'),
      ),
    );
  }
  if (input.blast) {
    parts.push('Blast radius (changed symbols and their callers):');
    parts.push(untrusted('blast-radius', input.blast));
  }

  parts.push(`Changed files: ${input.selected.total} (${input.selected.included.length} with patches below).`);
  for (const f of input.selected.included) parts.push(untrusted(f.path, f.patch));
  if (input.selected.named.length > 0) {
    parts.push('Changed files named only (no patch given):');
    parts.push(untrusted('named-files', input.selected.named.join('\n')));
  }
  const user = parts.join('\n\n');
  return {
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: user },
    ],
    system: input.systemPrompt,
    user,
    prDescription,
    intentText,
  };
}

/** Stale = the head moved, or the newest review is not the one the brief started from. */
export function isStale(brief: Pick<PrBrief, 'head_sha' | 'source_review_id'>, headSha: string, newestReviewId: string | null): boolean {
  return brief.head_sha !== headSha || (brief.source_review_id ?? null) !== (newestReviewId ?? null);
}

/** The newest review's facts, or null. */
export const reviewFacts = (review: { facts: PrBriefReview } | undefined): PrBriefReview | null => review?.facts ?? null;

/** A structured-output schema failure (as opposed to a provider or network error). */
export function isSchemaFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === 'ZodError' || /schema/i.test(err.message);
}

/** Error text stored on a run: one capped string; a missing key names the provider. */
export function runErrorText(err: unknown, provider?: string): string {
  const raw = err instanceof ConfigError && provider ? `No API key configured for ${provider}` : err instanceof Error ? err.message : String(err);
  return raw.length > MAX_ERROR_CHARS ? `${raw.slice(0, MAX_ERROR_CHARS)}...` : raw;
}

export interface BriefMeta {
  generatedAt: Date;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  headSha: string;
  sourceReviewId: string | null;
  runId: string;
  filesTotal: number;
  filesIncluded: number;
}

export function toBrief(draft: PrBriefDraft, meta: BriefMeta): PrBrief {
  return {
    ...draft,
    generated_at: meta.generatedAt.toISOString(),
    provider: meta.provider,
    model: meta.model,
    tokens_in: meta.tokensIn,
    tokens_out: meta.tokensOut,
    cost_usd: meta.costUsd,
    head_sha: meta.headSha,
    source_review_id: meta.sourceReviewId,
    run_id: meta.runId,
    files_total: meta.filesTotal,
    files_included: meta.filesIncluded,
  };
}

export interface TraceInput {
  prNumber: number;
  provider: string;
  model: string;
  system: string;
  user: string;
  prDescription: string | null;
  intentText: string | null;
  raw: string;
  usage: RunUsage;
  callMs: number;
  attempts: number | null;
  refsKept: number;
  refsTotal: number;
  log: RunLogLine[];
}

/** One `generate_brief` tool call; validated against the RunTrace contract. */
export function buildTrace(i: TraceInput): RunTrace {
  return RunTrace.parse({
    config: { agent: TRACE_AGENT_NAME, provider: i.provider, model: i.model, pr: i.prNumber, source: 'local' },
    stats: {
      duration_ms: i.usage.durationMs ?? i.callMs,
      tokens_in: i.usage.tokensIn ?? 0,
      tokens_out: i.usage.tokensOut ?? 0,
      cost_usd: i.usage.costUsd ?? null,
      findings: 0,
      grounding: `${i.refsKept}/${i.refsTotal} refs kept`,
    },
    prompt_assembly: { system: i.system, user: i.user, pr_description: i.prDescription, intent: i.intentText },
    tool_calls: [
      { tool: TOOL_NAME, args: `${i.provider}/${i.model}`, meta: i.attempts !== null ? `attempts=${i.attempts}` : null, ms: Math.round(i.callMs) },
    ],
    raw_output: i.raw,
    memory_pulled: [],
    specs_read: [],
    log: i.log,
  });
}
