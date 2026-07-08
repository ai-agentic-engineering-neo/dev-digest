import { and, eq } from 'drizzle-orm';
import type { CiInstallationStatus, CiTarget } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * `ci` module data-access. Owns `ci_installations` queries ONLY. Never
 * touches `agent_runs` — that table has a single existing writer
 * (`reviewRepo`); CI-run persistence/ingest is T6's concern
 * (`modules/ci/ingest.ts`, not this file).
 */

export type CiInstallationRow = typeof t.ciInstallations.$inferSelect;

export interface UpsertCiInstallationValues {
  agentId: string;
  repo: string;
  targetType: CiTarget;
  status: CiInstallationStatus;
  workflowVersion: string;
}

export class CiRepository {
  constructor(private readonly db: Db) {}

  /** Find the installation row for this (agent, repo, target) triple, if any. */
  async findByAgentRepoTarget(
    agentId: string,
    repo: string,
    targetType: CiTarget,
  ): Promise<CiInstallationRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.ciInstallations)
      .where(
        and(
          eq(t.ciInstallations.agentId, agentId),
          eq(t.ciInstallations.repo, repo),
          eq(t.ciInstallations.targetType, targetType),
        ),
      );
    return row;
  }

  async create(values: UpsertCiInstallationValues): Promise<CiInstallationRow> {
    const [row] = await this.db
      .insert(t.ciInstallations)
      .values({
        agentId: values.agentId,
        repo: values.repo,
        targetType: values.targetType,
        status: values.status,
        workflowVersion: values.workflowVersion,
      })
      .returning();
    return row!;
  }

  async updateStatus(
    id: string,
    patch: { status: CiInstallationStatus; workflowVersion: string },
  ): Promise<CiInstallationRow | undefined> {
    const [row] = await this.db
      .update(t.ciInstallations)
      .set({ status: patch.status, workflowVersion: patch.workflowVersion })
      .where(eq(t.ciInstallations.id, id))
      .returning();
    return row;
  }

  /**
   * Idempotent upsert keyed by (agentId, repo, targetType) — a re-export of
   * the same agent/repo/target updates the existing row's status +
   * workflow_version instead of creating a duplicate (AC-12).
   */
  async upsert(values: UpsertCiInstallationValues): Promise<CiInstallationRow> {
    const existing = await this.findByAgentRepoTarget(values.agentId, values.repo, values.targetType);
    if (existing) {
      const updated = await this.updateStatus(existing.id, {
        status: values.status,
        workflowVersion: values.workflowVersion,
      });
      return updated ?? existing;
    }
    return this.create(values);
  }

  /**
   * Installations for one agent. Workspace scoping is enforced by the caller
   * (the service verifies the agent belongs to the caller's workspace via
   * `agentsRepo.getById(workspaceId, agentId)` before calling this) — mirrors
   * the pattern used for agent-scoped skill/skill-link lookups.
   */
  async listForAgent(agentId: string): Promise<CiInstallationRow[]> {
    return this.db.select().from(t.ciInstallations).where(eq(t.ciInstallations.agentId, agentId));
  }
}
