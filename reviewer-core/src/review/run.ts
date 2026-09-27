import type {
  Finding,
  LLMProvider,
  PromptAssembly,
  Review,
  RunEventKind,
  UnifiedDiff,
} from '@devdigest/shared';
import { Review as ReviewSchema } from '@devdigest/shared';
import {
  assemblePrompt,
  type AssembledPrompt,
  type PromptIntent,
  type PromptSection,
} from '../prompt.js';
import { groundFindings, groundingSummary } from '../grounding.js';
import { parseDiff } from '../diff/parse.js';
import { numberDiff, renderNumberedLines } from './numbered-diff.js';
import { hasNewSideLines, reduceReviews, scoreFromFindings, sliceDiff } from './reduce.js';

/**
 * reviewPullRequest — the review engine entry point.
 *
 * given (diff + resolved agent inputs + injected LLM) → grounded Review.
 *
 * This is the pure core lifted out of the server's `ReviewService.runOneAgent`:
 * assemble prompt → single-pass OR map-reduce per file → reduce → SHARED
 * citation-grounding gate. It performs NO I/O beyond the injected LLM provider
 * (no DB, GitHub, fs, memory retrieval, intent, or persistence) — those stay in
 * the caller (server persists + streams SSE; runner posts + writes an artifact).
 *
 * Skill bodies / memory / specs are RESOLVED strings here: the caller turns
 * AgentManifest skill slugs into bodies (DB in the studio, fs in the runner).
 */

/** Default map-reduce threshold (matches the server's FILE_MAP_THRESHOLD_LINES). */
export const DEFAULT_MAP_THRESHOLD_LINES = 400;
/** Default structured-output reprompt retries (matches REVIEW_MAX_RETRIES). */
export const DEFAULT_REVIEW_MAX_RETRIES = 2;

export type ReviewStrategy = 'auto' | 'single-pass' | 'map-reduce';
export type ReviewMode = 'single-pass' | 'map-reduce';

/**
 * Prompt-assembly metadata for one call (L03 — prompt logging). Text-free by
 * construction: it carries `sections` (from `assemblePrompt`), sizes and
 * scope, never the prompt itself.
 */
export interface PromptAssembledInfo {
  scope: 'run' | 'chunk';
  mode: ReviewMode;
  model: string;
  chunk_count: number;
  /** chunk scope only. */
  chunk_index?: number;
  /** chunk scope only. */
  chunk_label?: string;
  system_chars: number;
  user_chars: number;
  total_chars: number;
  tokens_est: number;
  sections: PromptSection[];
  /** verbose, run scope only. */
  diff_files?: { path: string; chars: number }[];
}

/**
 * Opt-in telemetry sink for `reviewPullRequest`. `onPrompt` receives
 * metadata ONLY (never section text) and is invoked once per assembled
 * prompt: once per review (`scope:'run'`), plus once per map-reduce chunk
 * when `detail === 'verbose'`. Every invocation is wrapped in try/catch
 * inside the engine — telemetry must never fail a review.
 */
export interface PromptTelemetryOptions {
  detail: 'summary' | 'verbose';
  onPrompt: (info: PromptAssembledInfo) => void;
  /** Only used when `detail === 'verbose'` — reviewer-core never hashes on its own. */
  fingerprint?: (text: string) => string;
}

/** Progress event emitted during a review (server → SSE bus, runner → log). */
export interface ReviewEvent {
  kind: RunEventKind;
  msg: string;
  data?: unknown;
}

export interface ReviewInput {
  /** Agent system prompt (trusted). */
  systemPrompt: string;
  /** Model id understood by the injected provider (e.g. 'deepseek/deepseek-v4-flash'). */
  model: string;
  /** The PR's unified diff (already parsed; hunks carry new-side line numbers). */
  diff: UnifiedDiff;
  /** Injected LLM provider (OpenRouter in CI, OpenAI/Anthropic in the studio). */
  llm: LLMProvider;
  /** 'auto' (default) picks single-pass unless the diff is large + multi-file. */
  strategy?: ReviewStrategy;
  /** Resolved skill bodies (NOT slugs). */
  skills?: string[];
  /** Curated memory items. */
  memory?: string[];
  /** Project-context spec chunks (untrusted; delimiter-wrapped downstream). */
  specs?: string[];
  /**
   * Optional callers-of-changed-symbols digest (T1.3). Untrusted; rendered
   * before the diff section. Empty/undefined → section omitted.
   */
  callers?: string;
  /**
   * Optional repo skeleton / map (T3). Untrusted; rendered before the project
   * context section. Empty/undefined → section omitted.
   */
  repoMap?: string;
  /** PR author's description/body (untrusted; truncated + delimiter-wrapped in
      the prompt). Empty/undefined → section omitted. */
  prDescription?: string;
  /**
   * Derived PR intent (L03) — attacker-influenced like `prDescription`, so
   * it is rendered as an untrusted block too. Undefined → section omitted.
   */
  intent?: PromptIntent;
  /** Task framing line, e.g. "Review PR #482 …". */
  task?: string;
  /** Override the structured-output retry budget. */
  maxRetries?: number;
  /** Override the map-reduce line threshold. */
  mapThresholdLines?: number;
  /**
   * OpenRouter session id — forwarded on every LLM call so all chunks of this
   * review group into one session in the OpenRouter dashboard.
   */
  sessionId?: string;
  /** Progress sink. */
  onEvent?: (e: ReviewEvent) => void;
  /**
   * Cancellation checkpoint, called before each (expensive) chunk LLM call.
   * Supply a function that THROWS to abort mid-run (the caller owns the error
   * type, e.g. the server's RunCancelledError); the engine stays agnostic.
   */
  checkCancelled?: () => void;
  /**
   * Optional prompt-assembly telemetry (L03). METADATA ONLY, NEVER TEXT: the
   * engine reports section names/sizes/provenance through `onPrompt`, never
   * the assembled prompt itself. The caller (server) builds and logs a
   * record from it; reviewer-core stays free of I/O and a logger.
   */
  promptTelemetry?: PromptTelemetryOptions;
}

export interface ReviewOutcome {
  /** The reduced, GROUNDED review (findings that survived the citation gate). */
  review: Review;
  /** Human-readable grounding summary, e.g. "3/4 passed". */
  grounding: string;
  /** Findings dropped by grounding, with reasons (for logs / "never go silent"). */
  dropped: { finding: Finding; reason: string }[];
  /** Which path ran. */
  mode: ReviewMode;
  /** Prompt assembly (for the run trace). Single-pass: the one call; map-reduce: the whole-diff assembly. */
  assembly: PromptAssembly;
  /** Per-chunk labels (for the run trace's tool_calls). */
  chunks: { label: string }[];
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  /** Joined raw model outputs (for the run trace). */
  raw: string;
}

function selectMode(strategy: ReviewStrategy, diff: UnifiedDiff, threshold: number): ReviewMode {
  if (strategy === 'single-pass') return 'single-pass';
  if (strategy === 'map-reduce') return diff.files.length > 1 ? 'map-reduce' : 'single-pass';
  // auto: map-reduce only when the diff is both large AND multi-file (else 1 call).
  // A file with no new-side lines (deleted, or deletions-only) gets no chunk
  // below and can't be cited, so it doesn't count towards the size threshold
  // either (AM-1) — only towards the multi-file check, since the raw diff
  // still carries its content in the single-pass whole-diff text.
  const totalLines = diff.files
    .filter(hasNewSideLines)
    .reduce((n, f) => n + f.additions + f.deletions, 0);
  return totalLines > threshold && diff.files.length > 1 ? 'map-reduce' : 'single-pass';
}

/** Build one PromptAssembledInfo from an AssembledPrompt (never touches text
 *  beyond measuring its length) — shared by the run-scope and chunk-scope emits. */
function buildPromptInfo(
  scope: 'run' | 'chunk',
  assembled: AssembledPrompt,
  ctx: {
    mode: ReviewMode;
    model: string;
    chunkCount: number;
    chunkIndex?: number;
    chunkLabel?: string;
    diffFiles?: { path: string; chars: number }[];
  },
): PromptAssembledInfo {
  const systemChars = assembled.messages[0]!.content.length;
  const userChars = assembled.messages[1]!.content.length;
  return {
    scope,
    mode: ctx.mode,
    model: ctx.model,
    chunk_count: ctx.chunkCount,
    ...(ctx.chunkIndex !== undefined ? { chunk_index: ctx.chunkIndex } : {}),
    ...(ctx.chunkLabel !== undefined ? { chunk_label: ctx.chunkLabel } : {}),
    system_chars: systemChars,
    user_chars: userChars,
    total_chars: systemChars + userChars,
    // Same heuristic as estimateTokens (ceil(chars/4)), applied to the
    // already-computed char totals — no need to re-measure the text.
    tokens_est: Math.ceil((systemChars + userChars) / 4),
    sections: assembled.sections,
    ...(ctx.diffFiles ? { diff_files: ctx.diffFiles } : {}),
  };
}

export async function reviewPullRequest(input: ReviewInput): Promise<ReviewOutcome> {
  const threshold = input.mapThresholdLines ?? DEFAULT_MAP_THRESHOLD_LINES;
  const maxRetries = input.maxRetries ?? DEFAULT_REVIEW_MAX_RETRIES;
  const mode = selectMode(input.strategy ?? 'auto', input.diff, threshold);
  const emit = (kind: RunEventKind, msg: string, data?: unknown) =>
    input.onEvent?.({ kind, msg, data });

  const promptParts = {
    system: input.systemPrompt,
    skills: input.skills,
    memory: input.memory,
    specs: input.specs,
    callers: input.callers,
    repoMap: input.repoMap,
    prDescription: input.prDescription,
    intent: input.intent,
    task: input.task,
  };

  // Fingerprints are computed only in verbose mode — reviewer-core never
  // hashes on its own, and summary mode never touches this.
  const fingerprintOpts =
    input.promptTelemetry?.detail === 'verbose' && input.promptTelemetry.fingerprint
      ? { fingerprint: input.promptTelemetry.fingerprint }
      : undefined;

  // Every diff that reaches the LLM is numbered (L03 — grounding citations
  // must match a real line, never a hunk-header-counted guess). Parsed ONCE;
  // the whole-diff text and every map-reduce chunk's text are rendered from
  // this one parse rather than re-parsed per chunk. For any path this is
  // byte-identical to `numberDiff(sliceDiff(input.diff, path))` (see
  // numbered-diff.ts's `renderNumberedLines`) — `numberDiffForPath` below
  // falls back to that slower, always-correct form if a path from
  // `input.diff.files` somehow isn't one of THIS parse's files (e.g. a diff
  // hand-built for a test rather than produced from `raw`).
  const parsedDiff = parseDiff(input.diff.raw);
  const numberedWhole = renderNumberedLines(parsedDiff.lines);
  const numberDiffForPath = (path: string): string => {
    const pf = parsedDiff.files.find((f) => f.path === path);
    return pf
      ? renderNumberedLines(parsedDiff.lines.slice(pf.start, pf.end))
      : numberDiff(sliceDiff(input.diff, path));
  };

  // Whole-diff assembly is the trace default; overwritten below for single-pass.
  const wholeDiffAssembled = assemblePrompt({ ...promptParts, diff: numberedWhole }, fingerprintOpts);
  let assembly: PromptAssembly = wholeDiffAssembled.assembly;

  // A file with no new-side lines (deleted, or deletions-only) can't be
  // cited, so it gets no map-reduce chunk / LLM call (AM-1) — it's still in
  // the single-pass whole-diff text above, and still available to `sliceDiff`.
  const chunks =
    mode === 'map-reduce'
      ? input.diff.files
          .filter(hasNewSideLines)
          .map((f) => ({ label: f.path, diffText: numberDiffForPath(f.path) }))
      : [{ label: 'all files', diffText: numberedWhole }];

  emit(
    'info',
    mode === 'map-reduce'
      ? `Large diff → map-reduce over ${input.diff.files.length} files`
      : `Reviewing ${input.diff.files.length} changed file(s) in one pass`,
  );

  // One scope:'run' telemetry record per review, describing the whole-diff
  // assembly — emitted BEFORE any LLM call so it's there even if every call
  // fails. Never let a telemetry error break the review (try/catch, swallowed).
  if (input.promptTelemetry) {
    try {
      input.promptTelemetry.onPrompt(
        buildPromptInfo('run', wholeDiffAssembled, {
          mode,
          model: input.model,
          chunkCount: chunks.length,
          ...(input.promptTelemetry.detail === 'verbose'
            ? {
                diffFiles: input.diff.files.map((f) => ({
                  path: f.path,
                  chars: numberDiffForPath(f.path).length,
                })),
              }
            : {}),
        }),
      );
    } catch {
      // Telemetry must never fail a review.
    }
  }

  const partials: Review[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let costUsd: number | null = 0;
  const raws: string[] = [];

  for (const [chunkIndex, chunk] of chunks.entries()) {
    // Cancellation checkpoint — stop before the next (expensive) LLM call.
    input.checkCancelled?.();
    // 'map:' prefix only for the map-reduce path (one call per file). In
    // single-pass there is exactly one chunk (the whole diff) — don't mislabel it.
    emit(
      'tool',
      mode === 'map-reduce' ? `map: reviewing ${chunk.label}` : `Reviewing ${chunk.label} in one pass`,
      { file: chunk.label },
    );
    const a = assemblePrompt({ ...promptParts, diff: chunk.diffText }, fingerprintOpts);
    if (mode === 'single-pass') assembly = a.assembly;
    // One scope:'chunk' telemetry record per LLM call, verbose + map-reduce
    // only (single-pass's one chunk duplicates the run record above).
    if (input.promptTelemetry?.detail === 'verbose' && mode === 'map-reduce') {
      try {
        input.promptTelemetry.onPrompt(
          buildPromptInfo('chunk', a, {
            mode,
            model: input.model,
            chunkCount: chunks.length,
            chunkIndex,
            chunkLabel: chunk.label,
          }),
        );
      } catch {
        // Telemetry must never fail a review.
      }
    }
    const res = await input.llm.completeStructured<Review>({
      model: input.model,
      schema: ReviewSchema,
      schemaName: 'Review',
      messages: a.messages,
      maxRetries,
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    });
    tokensIn += res.tokensIn;
    tokensOut += res.tokensOut;
    costUsd = costUsd == null || res.costUsd == null ? null : costUsd + res.costUsd;
    raws.push(res.raw);
    partials.push(res.data);
    emit('result', `${chunk.label}: ${res.data.findings.length} candidate finding(s)`);
  }

  const merged = reduceReviews(partials);
  emit(
    'result',
    `Reduced to ${merged.findings.length} finding(s); verdict=${merged.verdict}, score=${merged.score}`,
  );

  // SHARED citation-grounding gate (the only post-step; not duplicated per strategy).
  const ground = groundFindings(merged.findings, input.diff);
  const grounding = groundingSummary(ground);
  for (const d of ground.dropped) {
    emit('info', `grounding dropped "${d.finding.title}": ${d.reason}`);
  }
  emit('result', `Citation grounding: ${grounding}`);

  // Score is derived from the findings that SURVIVED grounding (not the model's
  // self-reported number, and not the pre-grounding set) so the score, the
  // findings list, and the deterministic event always agree.
  return {
    review: { ...merged, findings: ground.kept, score: scoreFromFindings(ground.kept) },
    grounding,
    dropped: ground.dropped,
    mode,
    assembly,
    chunks: chunks.map((c) => ({ label: c.label })),
    tokensIn,
    tokensOut,
    costUsd,
    raw: raws.join('\n---\n'),
  };
}
