// Ring 2. Resolves repo/PR, then returns the server's blast-radius payload
// unchanged (same data as the browser). No LLM, no local analysis.
import type { BlastRadiusResponse } from '@devdigest/shared';
import type { DevDigestApi } from '../domain/ports.js';
import type { Resolver } from './resolver.js';

export type BlastRadiusResult = { repo: string; pr: number } & BlastRadiusResponse;

export class BlastRadiusService {
  constructor(
    private readonly api: DevDigestApi,
    private readonly resolver: Resolver,
  ) {}

  async getBlastRadius(args: { repo: string; pr: number }): Promise<BlastRadiusResult> {
    const { repo, pull } = await this.resolver.resolvePull(args.repo, args.pr);
    const blast = await this.api.getBlast(pull.id);
    return { repo: repo.full_name, pr: args.pr, ...blast };
  }
}
