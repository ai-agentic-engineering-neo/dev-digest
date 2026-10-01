// Ring 2. Stateless repo / PR resolution shared by every tool that takes
// `repo` + `pr`. Depends on the port only.
import type { Repo } from '@devdigest/shared';
import { prNotFoundMessage, repoNotFoundMessage, ToolError } from '../domain/errors.js';
import { matchPrByNumber, matchRepoByFullName, type PersistedPr } from '../domain/matching.js';
import type { DevDigestApi } from '../domain/ports.js';

export class Resolver {
  constructor(private readonly api: DevDigestApi) {}

  async resolveRepo(fullName: string): Promise<Repo> {
    const repo = matchRepoByFullName(await this.api.listRepos(), fullName);
    if (!repo) throw new ToolError(repoNotFoundMessage(fullName));
    return repo;
  }

  async resolvePull(fullName: string, number: number): Promise<{ repo: Repo; pull: PersistedPr }> {
    const repo = await this.resolveRepo(fullName);
    const pull = matchPrByNumber(await this.api.listPulls(repo.id), number);
    if (!pull) throw new ToolError(prNotFoundMessage(fullName, number));
    return { repo, pull };
  }
}
