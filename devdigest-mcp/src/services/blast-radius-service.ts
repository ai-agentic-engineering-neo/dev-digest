// Ring 2. Stub: validates repo/PR through the shared resolver so a real
// implementation starts from a working input path.
import type { Resolver } from './resolver.js';

export interface BlastRadiusResult {
  status: 'not_implemented';
  repo: string;
  pr: number;
  message: string;
  affected_files?: string[];
  affected_modules?: string[];
  risk_level?: 'low' | 'medium' | 'high';
}

export class BlastRadiusService {
  constructor(private readonly resolver: Resolver) {}

  async getBlastRadius(args: { repo: string; pr: number }): Promise<BlastRadiusResult> {
    await this.resolver.resolvePull(args.repo, args.pr);
    return {
      status: 'not_implemented',
      repo: args.repo,
      pr: args.pr,
      message:
        'Blast radius analysis is not implemented yet. The repo and PR were found; use get_findings or run_agent_on_pr for review results.',
    };
  }
}
