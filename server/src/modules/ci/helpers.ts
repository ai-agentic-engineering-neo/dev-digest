import { createHash, randomUUID } from 'node:crypto';
import type { CiInstallation, CiTarget } from '@devdigest/shared';
import type { RepoRef } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import type { CiInstallationRow } from './repository.js';

/**
 * Small pure helpers for `CiService`. No I/O, no adapters — keeps the service
 * body focused on orchestration.
 */

/** The branch every GHA export commits to / opens a PR from (Non-goal: never configurable in v1). */
export const CI_BRANCH = 'devdigest/ci';

/** Parse a "owner/name" repo string (the `CiExportInput.repo` shape) into a `RepoRef`. */
export function parseRepoSlug(repo: string): RepoRef {
  const parts = repo.split('/');
  const [owner, name] = parts;
  if (parts.length !== 2 || !owner || !name) {
    throw new ValidationError(`Invalid repo "${repo}" — expected "owner/name"`);
  }
  return { owner, name };
}

/**
 * Deterministic short content hash used as `workflow_version` — lets a future
 * caller detect drift between the installed workflow and what the current
 * generator would produce, without persisting the full file contents twice.
 */
export function computeWorkflowVersion(contents: string): string {
  return createHash('sha256').update(contents).digest('hex').slice(0, 12);
}

/** Map a persisted `ci_installations` row to the `CiInstallation` DTO. */
export function toCiInstallationDto(row: CiInstallationRow): CiInstallation {
  return {
    id: row.id,
    agent_id: row.agentId,
    repo: row.repo,
    target_type: row.targetType as CiTarget,
    installed_at: row.installedAt.toISOString(),
    status: row.status ?? 'active',
    workflow_version: row.workflowVersion ?? '',
  };
}

/**
 * A non-persisted installation DTO for the `action=files` / non-GHA paths
 * (AC-13): the client just downloads a zip, so there is nothing to install
 * yet and no row is ever written to `ci_installations`. The response still
 * needs a `CiInstallation` (the shared contract requires it), so this builds
 * one purely in-memory with a fresh id and `status: "active"`.
 */
export function buildVirtualInstallation(params: {
  agentId: string;
  repo: string;
  targetType: CiTarget;
  workflowVersion: string;
}): CiInstallation {
  return {
    id: randomUUID(),
    agent_id: params.agentId,
    repo: params.repo,
    target_type: params.targetType,
    installed_at: new Date().toISOString(),
    status: 'active',
    workflow_version: params.workflowVersion,
  };
}
