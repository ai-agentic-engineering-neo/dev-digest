import type {
  Finding,
  LLMProvider,
  PromptAssembly,
  Review,
  RunEventKind,
  UnifiedDiff,
} from '@devdigest/shared';
import { Review as ReviewSchema } from '@devdigest/shared';
import { assemblePrompt } from '../prompt.js';
import { groundFindings, groundingSummary } from '../grounding.js';
import { scoreFromFindings } from './reduce.js';

/**
 * reviewPullRequest — the review engine entry point.
 *
 * given (diff + resolved agent inputs + injected LLM) → grounded Review.
 *
 * This is the pure core lifted out of the server's `ReviewService.runOneAgent`:
 * assemble prompt → one structured-output call over the WHOLE diff → SHARED
 * citation-grounding gate. It performs NO I/O beyond the injected LLM provider
 * (no DB, GitHub, fs, memory retrieval, intent, or persistence) — those stay in
 * the caller (server persists + streams SSE; runner posts + writes an artifact).
 *
 * Skill bodies / memory / specs are RESOLVED strings here: the caller turns
 * AgentManifest skill slugs into bodies (DB in the studio, fs in the runner).
 *
 * Always single-pass: the whole diff goes to the model in one call. Map-reduce
 * chunking (one call per file) was removed — it reviewed each file in
 * isolation, so a change and its compensating change in a sibling file (e.g. a
 * type signature broadened in one file, its call sites updated in another)
 * each looked incomplete on their own, producing a steady stream of false
 * "unimplemented" / "unverified" findings that no amount of prompt tuning
 * fixed, because the chunk genuinely never saw the other file. Large diffs are
 * accepted as a known risk (context-window overflow, or structured-output
 * truncating before the JSON closes) rather than chunked around.
 */

/** Default structured-output reprompt retries (matches REVIEW_MAX_RETRIES). */
export const DEFAULT_REVIEW_MAX_RETRIES = 2;

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
   * Stated PR intent/scope (untrusted; pre-formatted plain text, rendered
   * after `## PR description` with a trusted scope-respecting instruction).
   * Empty/undefined → section omitted.
   */
  intent?: string;
  /** Task framing line, e.g. "Review PR #482 …". */
  task?: string;
  /** Override the structured-output retry budget. */
  maxRetries?: number;
  /**
   * OpenRouter session id — forwarded on the LLM call so it shows up grouped
   * in the OpenRouter dashboard.
   */
  sessionId?: string;
  /** Progress sink. */
  onEvent?: (e: ReviewEvent) => void;
  /**
   * Cancellation checkpoint, called before the (expensive) LLM call. Supply a
   * function that THROWS to abort mid-run (the caller owns the error type,
   * e.g. the server's RunCancelledError); the engine stays agnostic.
   */
  checkCancelled?: () => void;
}

export interface ReviewOutcome {
  /** The grounded review (findings that survived the citation gate). */
  review: Review;
  /** Human-readable grounding summary, e.g. "3/4 passed". */
  grounding: string;
  /** Findings dropped by grounding, with reasons (for logs / "never go silent"). */
  dropped: { finding: Finding; reason: string }[];
  /** Prompt assembly (for the run trace). */
  assembly: PromptAssembly;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  /** Raw model output (for the run trace). */
  raw: string;
}

export async function reviewPullRequest(input: ReviewInput): Promise<ReviewOutcome> {
  const maxRetries = input.maxRetries ?? DEFAULT_REVIEW_MAX_RETRIES;
  const emit = (kind: RunEventKind, msg: string, data?: unknown) =>
    input.onEvent?.({ kind, msg, data });

  const { assembly, messages } = assemblePrompt({
    system: input.systemPrompt,
    skills: input.skills,
    memory: input.memory,
    specs: input.specs,
    callers: input.callers,
    repoMap: input.repoMap,
    prDescription: input.prDescription,
    intent: input.intent,
    task: input.task,
    diff: input.diff.raw,
  });

  emit('info', `Reviewing ${input.diff.files.length} changed file(s) in one pass`);

  // Cancellation checkpoint — stop before the (expensive) LLM call.
  input.checkCancelled?.();
  emit('tool', 'Reviewing all files in one pass', { file: 'all files' });

  const res = await input.llm.completeStructured<Review>({
    model: input.model,
    schema: ReviewSchema,
    schemaName: 'Review',
    messages,
    maxRetries,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  });
  emit('result', `all files: ${res.data.findings.length} candidate finding(s)`);

  // SHARED citation-grounding gate (the only post-step).
  const ground = groundFindings(res.data.findings, input.diff);
  const grounding = groundingSummary(ground);
  for (const d of ground.dropped) {
    emit('info', `grounding dropped "${d.finding.title}": ${d.reason}`);
  }
  emit('result', `Citation grounding: ${grounding}`);

  // Score is derived from the findings that SURVIVED grounding (not the model's
  // self-reported number, and not the pre-grounding set) so the score, the
  // findings list, and the deterministic event always agree.
  return {
    review: { ...res.data, findings: ground.kept, score: scoreFromFindings(ground.kept) },
    grounding,
    dropped: ground.dropped,
    assembly,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    costUsd: res.costUsd,
    raw: res.raw,
  };
}
