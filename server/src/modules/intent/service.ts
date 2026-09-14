import type { FeatureModelChoice, GitHubClient, LLMProvider, Provider as ProviderId } from '@devdigest/shared';
import { parseIssueNumber, parseSpecRef } from '../_shared/linked-issue.js';
import { detectContextGaps, renderIntentText } from './helpers.js';
import { buildIntentPrompt } from './prompts.js';
import type { IntentRepository } from './repository.js';
import { IntentExtractionOutput } from './schemas.js';

/**
 * Intent Layer application service (specs/05-intent-layer.md).
 *
 * ALL signal-gathering (GitHub issue fetch, clone file read, DB read/write)
 * lives here in the SERVER — `reviewer-core` only ever accepts an
 * already-resolved `intent: string` (reviewer-core/CLAUDE.md: "no DB, GitHub,
 * fs... or persistence").
 *
 * Constructor takes narrow function ports (not `Container`) so this stays a
 * correctly-injected application service per onion-architecture's
 * no-container-in-services rule — same shape as
 * `conventions/service.ts`'s `FeatureModelResolver`/`LlmResolver`.
 */

export type FeatureModelResolver = (
  workspaceId: string,
  id: 'review_intent',
) => Promise<FeatureModelChoice>;
export type LlmResolver = (id: ProviderId) => Promise<LLMProvider>;
export type GithubResolver = () => Promise<GitHubClient>;
export type CloneReader = (clonePath: string, path: string) => Promise<string | null>;

export interface IntentResolution {
  summary?: string;
  /** Changes the PR's own diff actually makes, grounded in its file list. */
  inScope?: string[];
  /** Things the description/issue mentions or implies but the diff does not
   *  touch, or things the author explicitly excludes. */
  outOfScope?: string[];
  /** Deterministic (never model-judged) gaps in the signals available — see
   *  helpers.ts's `detectContextGaps`. */
  contextGaps?: string[];
  /** Human-readable signal names used ("PR description", "linked issue #123",
   *  a spec path, "commit messages") — also what the UI's "Derived from: …"
   *  line and the DB cache show. */
  signals: string[];
  /** The single rendered string threaded into the review prompt's free-text
   *  `intent` slot; `undefined` when resolution failed/produced nothing usable. */
  rendered?: string;
  /** Provider/model actually used for the classifier call — surfaced only so
   *  the caller (run-executor.ts) can log it on the batch-level pino line;
   *  `undefined` when resolution failed before a model was resolved. */
  provider?: ProviderId;
  model?: string;
  /** Exact user-message text sent to `completeStructured` — surfaced only so
   *  the caller can compute a token estimate via `container.tokenizer.count`
   *  (this service has no tokenizer port; see specs/05-intent-layer.md's
   *  Logging section). Never rendered raw anywhere client-visible. */
  userMessageText?: string;
}

export interface ResolveIntentInput {
  workspaceId: string;
  pull: { id: string; title: string; body: string | null };
  repo: { owner: string; name: string; clonePath: string | null };
  /** New in revision 2 — the PR's already-loaded diff file list + hunk
   *  headers, threaded straight through with zero extra I/O (diff is already
   *  resolved by run-executor.ts's diff-load step before this is called). */
  diffFiles: {
    path: string;
    hunks: { oldStart: number; oldLines: number; newStart: number; newLines: number }[];
  }[];
  /** Live Log sink — counts/identifiers only, NEVER raw issue/spec body text
   *  (specs/05-intent-layer.md's Logging section). */
  onSignal?: (msg: string) => void;
}

export class IntentService {
  constructor(
    private repo: IntentRepository,
    private resolveModel: FeatureModelResolver,
    private llm: LlmResolver,
    private github: GithubResolver,
    private readClone: CloneReader,
  ) {}

  /**
   * Gather signals → one structured LLM call → deterministic context-gap
   * detection → persist onto the PR row. Never throws: any failure anywhere
   * in this sequence is caught and degrades to `{ signals: [] }`, so a total
   * intent-resolution failure degrades the review prompt to the pre-L03
   * baseline (reviewPullRequest already omits the slot when undefined) —
   * it never fails the run batch the way a diff-load failure does.
   */
  async resolve(input: ResolveIntentInput): Promise<IntentResolution> {
    const emit = (msg: string) => input.onSignal?.(`intent: ${msg}`);
    try {
      const title = input.pull.title;
      const body = input.pull.body ?? '';
      const refText = `${title}\n${body}`;

      const issueNumber = parseIssueNumber(refText);
      const specPath = parseSpecRef(refText);

      const [issue, specContent, commitMessages] = await Promise.all([
        this.tryResolveIssue(issueNumber, input.repo),
        this.tryReadSpec(specPath, input.repo.clonePath),
        this.repo.getCommitMessages(input.pull.id).catch(() => [] as string[]),
      ]);

      if (issue) emit(`linked issue #${issue.number} found`);
      else if (issueNumber != null) emit(`referenced issue #${issueNumber} not found`);
      if (specContent && specPath) emit(`spec ${specPath} read`);
      else if (specPath) emit(`referenced spec ${specPath} not found`);

      const signals: string[] = [];
      if (body.trim().length > 0) signals.push('PR description');
      if (issue) signals.push(`linked issue #${issue.number}`);
      if (specContent && specPath) signals.push(specPath);
      if (commitMessages.length > 0) signals.push('commit messages');
      if (signals.length === 0) emit('no description — indirect signals only');

      // Deterministic (never model-judged) context-gap detection — computed
      // from the same signals already gathered above, not from anything the
      // model claims (specs/05-intent-layer.md's Call sequence step 5).
      const contextGaps = detectContextGaps({
        body: input.pull.body,
        issueNumberParsed: issueNumber,
        hasResolvedIssue: issue != null,
        specPathParsed: specPath,
        hasResolvedSpec: specContent != null,
      });
      for (const gap of contextGaps) emit(gap);

      const { provider, model } = await this.resolveModel(input.workspaceId, 'review_intent');
      const llm = await this.llm(provider);
      const messages = buildIntentPrompt({
        title,
        body: body || null,
        issue,
        specPath,
        specContent,
        commitMessages,
        diffFiles: input.diffFiles,
      });
      const { data } = await llm.completeStructured({
        model,
        schema: IntentExtractionOutput,
        schemaName: 'IntentExtraction',
        messages,
      });

      const rendered = renderIntentText(data.summary, signals);

      // Best-effort: a cache-write failure must not discard the already-
      // computed result for THIS run's prompt — only the next run's cache.
      await this.repo
        .saveIntent(input.pull.id, {
          summary: data.summary,
          inScope: data.in_scope,
          outOfScope: data.out_of_scope,
          contextGaps,
          signals,
        })
        .catch(() => undefined);

      return {
        summary: data.summary,
        inScope: data.in_scope,
        outOfScope: data.out_of_scope,
        contextGaps,
        signals,
        rendered,
        provider,
        model,
        userMessageText: messages[1]?.content ?? '',
      };
    } catch (err) {
      emit(`resolution failed — ${(err as Error).message}`);
      return { signals: [] };
    }
  }

  private async tryResolveIssue(
    n: number | null,
    repo: { owner: string; name: string },
  ): Promise<{ number: number; title: string; body?: string | null } | null> {
    if (n == null) return null;
    try {
      const gh = await this.github();
      return await gh.getIssue({ owner: repo.owner, name: repo.name }, n);
    } catch {
      return null;
    }
  }

  private async tryReadSpec(path: string | null, clonePath: string | null): Promise<string | null> {
    if (path == null || clonePath == null) return null;
    return this.readClone(clonePath, path).catch(() => null);
  }
}
