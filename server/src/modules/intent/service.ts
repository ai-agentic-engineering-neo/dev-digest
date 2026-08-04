import type {
  FeatureModelChoice,
  GitHubClient,
  IntentConfidence,
  LLMProvider,
  Provider as ProviderId,
} from '@devdigest/shared';
import { parseIssueNumber, parseSpecRef } from '../_shared/linked-issue.js';
import { applyConfidenceCeiling, renderIntentText } from './helpers.js';
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
  confidence?: IntentConfidence;
  /** Human-readable signal names used ("PR description", "linked issue #123",
   *  a spec path, "commit messages") — also what the UI's "Derived from: …"
   *  line and the DB cache show. */
  signals: string[];
  /** The single rendered string threaded into the review prompt's `intent`
   *  slot; `undefined` when resolution failed/produced nothing usable. */
  rendered?: string;
}

export interface ResolveIntentInput {
  workspaceId: string;
  pull: { id: string; title: string; body: string | null };
  repo: { owner: string; name: string; clonePath: string | null };
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
   * Gather signals → one structured LLM call → deterministic confidence
   * ceiling → persist onto the PR row. Never throws: any failure anywhere in
   * this sequence is caught and degrades to `{ signals: [] }`, so a total
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

      const { provider, model } = await this.resolveModel(input.workspaceId, 'review_intent');
      const llm = await this.llm(provider);
      const { data } = await llm.completeStructured({
        model,
        schema: IntentExtractionOutput,
        schemaName: 'IntentExtraction',
        messages: buildIntentPrompt({
          title,
          body: body || null,
          issue,
          specPath,
          specContent,
          commitMessages,
        }),
      });

      const confidence = applyConfidenceCeiling(
        data.confidence,
        input.pull.body,
        issue != null,
        specContent != null,
      );

      const rendered = renderIntentText(data.summary, confidence, signals);

      // Best-effort: a cache-write failure must not discard the already-
      // computed result for THIS run's prompt — only the next run's cache.
      await this.repo
        .saveIntent(input.pull.id, { summary: data.summary, confidence, signals })
        .catch(() => undefined);

      return { summary: data.summary, confidence, signals, rendered };
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
