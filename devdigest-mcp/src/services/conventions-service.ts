// Ring 2. Read-only: never triggers LLM extraction.
import type { DevDigestApi } from '../domain/ports.js';
import { toConventionSummary, type ConventionSummary } from '../domain/trim.js';
import type { Resolver } from './resolver.js';

export interface ConventionsResult {
  repo: string;
  total: number;
  returned: number;
  truncated: boolean;
  conventions: ConventionSummary[];
  hint?: string;
}

export class ConventionsService {
  constructor(
    private readonly api: DevDigestApi,
    private readonly resolver: Resolver,
  ) {}

  async getConventions(args: { repo: string; includePending: boolean; limit: number }): Promise<ConventionsResult> {
    const repo = await this.resolver.resolveRepo(args.repo);
    const all = await this.api.listConventions(repo.id);
    const wanted = all
      .filter((c) => args.includePending || c.accepted)
      .sort((a, b) => b.confidence - a.confidence);
    const page = wanted.slice(0, args.limit).map(toConventionSummary);
    const result: ConventionsResult = {
      repo: repo.full_name,
      total: wanted.length,
      returned: page.length,
      truncated: page.length < wanted.length,
      conventions: page,
    };
    if (wanted.length === 0) {
      result.hint = args.includePending
        ? 'No conventions exist for this repo yet. Extract them in the DevDigest UI (Conventions screen); this tool never triggers extraction.'
        : 'No accepted conventions for this repo. Extract and accept conventions in the DevDigest UI, or call again with includePending=true to see candidates; this tool never triggers extraction.';
    }
    return result;
  }
}
