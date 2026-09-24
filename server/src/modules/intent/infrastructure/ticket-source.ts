/**
 * TicketSource: a same-repo GitHub issue (server/specs/05-intent-layer.md —
 * no Jira/Linear this slice; foreign-repo and Jira-shaped refs never reach
 * here, they're filtered out by domain/links.ts before any call is made).
 */
import type { GitHubClient } from '@devdigest/shared';
import type { IntentRepo, TicketReadResult, TicketSource } from '../application/ports.js';

export interface GitHubTicketSourceDeps {
  github: () => Promise<Pick<GitHubClient, 'getIssue'>>;
}

export class GitHubTicketSource implements TicketSource {
  constructor(private readonly deps: GitHubTicketSourceDeps) {}

  async read(repo: IntentRepo, number: number): Promise<TicketReadResult> {
    try {
      const github = await this.deps.github();
      const issue = await github.getIssue({ owner: repo.owner, name: repo.name }, number);
      return { ok: true, title: issue.title, body: issue.body ?? '' };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }
}
