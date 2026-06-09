import type { CiInstallation, CiRun, CiTarget } from '@devdigest/shared/contracts/eval-ci';
import * as t from '../../db/schema.js';

/** Map a `ci_installations` row to its DTO. */
export function installationToDto(row: typeof t.ciInstallations.$inferSelect): CiInstallation {
  return {
    id: row.id,
    agent_id: row.agentId,
    repo: row.repo,
    target_type: row.targetType as CiTarget,
    installed_at: row.installedAt.toISOString(),
  };
}

/** Map a `ci_runs` row to its DTO. */
export function runToDto(row: typeof t.ciRuns.$inferSelect): CiRun {
  return {
    id: row.id,
    ci_installation_id: row.ciInstallationId,
    pr_number: row.prNumber,
    ran_at: row.ranAt?.toISOString() ?? null,
    status: row.status,
    findings_count: row.findingsCount,
    cost_usd: row.costUsd,
    github_url: row.githubUrl,
    source: row.source,
    duration_s: null,
  };
}
