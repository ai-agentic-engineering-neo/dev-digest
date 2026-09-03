import type { Container } from '../../platform/container.js';
import { Intent } from '@devdigest/shared';
import { wrapUntrusted, INJECTION_GUARD } from '@devdigest/reviewer-core';
import { NotFoundError } from '../../platform/errors.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { renderPrompt } from '../../platform/prompts.js';
import { approxTokens } from '../../adapters/tokenizer/index.js';
import type { ReviewRepository, IntentRecord } from './repository.js';
import { loadDiff } from './diff-loader.js';
import type { Logger } from './run-executor.js';

const SCHEMA_NAME = 'Intent';

/**
 * Derives a PR's `{summary, in_scope, out_of_scope}` via a cheap LLM call,
 * fed only title + body + linked-issue + changed-file HUNK HEADERS — never
 * full diff line content. See `ConventionsService.extract` for the sibling
 * pattern this mirrors (resolveFeatureModel -> llm -> renderPrompt ->
 * wrapUntrusted -> completeStructured).
 */
export class IntentClassifier {
  constructor(
    private container: Container,
    private repo: ReviewRepository,
  ) {}

  async compute(workspaceId: string, prId: string, logger?: Logger): Promise<IntentRecord> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repoRow = await this.repo.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');

    const diff = await loadDiff(this.container, this.repo, workspaceId, pull, repoRow);
    const hunkDigest = this.buildHunkDigest(diff);

    let linkedIssueBody: string | undefined;
    try {
      const github = await this.container.github();
      const issue = await github.resolveLinkedIssue(
        { owner: repoRow.owner, name: repoRow.name },
        pull.body ?? '',
      );
      if (issue) {
        linkedIssueBody = `${issue.title}\n\n${issue.body ?? ''}`;
      }
    } catch {
      // No GitHub token configured (or the lookup failed) — degrade
      // gracefully, classify from title/body/hunks alone.
    }

    const { provider, model } = await resolveFeatureModel(
      this.container,
      workspaceId,
      'review_intent',
    );
    const llm = await this.container.llm(provider);

    // Built manually (not via assemblePrompt), so the shared injection guard
    // must be appended explicitly here — same as assemblePrompt does for the
    // main review path — instead of a second, drift-prone copy in the prompt file.
    const system = `${await renderPrompt('intent.system.md', {})}\n\n${INJECTION_GUARD}`;
    const userSections = [
      `## PR title\n${wrapUntrusted('pr_title', pull.title)}`,
      `## PR body\n${wrapUntrusted('pr_body', pull.body ?? '')}`,
      ...(linkedIssueBody ? [`## Linked issue\n${wrapUntrusted('linked_issue', linkedIssueBody)}`] : []),
      `## Changed files (hunk headers only, no diff content)\n${wrapUntrusted('changed_files', hunkDigest)}`,
    ];

    const { data, tokensIn, tokensOut, costUsd } = await llm.completeStructured<Intent>({
      model,
      schema: Intent,
      schemaName: SCHEMA_NAME,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userSections.join('\n\n') },
      ],
    });

    const fullDiffTokens = approxTokens(diff.raw);
    logger?.info(
      { prId, fullDiffTokens, classifierTokensIn: tokensIn, savedTokens: fullDiffTokens - tokensIn },
      'intent classifier: token savings vs full diff',
    );

    const computedAt = new Date();
    await this.repo.upsertIntent(
      prId,
      { summary: data.summary, in_scope: data.in_scope, out_of_scope: data.out_of_scope },
      { provider, model, tokensIn, tokensOut, costUsd: costUsd ?? 0, computedAt },
    );

    return {
      summary: data.summary,
      in_scope: data.in_scope,
      out_of_scope: data.out_of_scope,
      computed_at: computedAt,
      provider,
      model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: costUsd ?? 0,
    };
  }

  /**
   * Per-file digest of hunk header ranges only (`@@ -old +new @@`) — never
   * hunk line content, so the classifier stays cheap and never sees the diff
   * body.
   */
  private buildHunkDigest(diff: Awaited<ReturnType<typeof loadDiff>>): string {
    return diff.files
      .map((f) => {
        const headers = f.hunks
          .map((h) => `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`)
          .join('\n  ');
        return `${f.path} (+${f.additions}/-${f.deletions})\n  ${headers}`;
      })
      .join('\n\n');
  }
}
