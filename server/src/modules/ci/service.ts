import type { Container } from '../../platform/container.js';
import type {
  CiExport,
  CiExportInput,
  CiInstallation,
  CiRun,
} from '@devdigest/shared/contracts/eval-ci';
import { and, eq } from 'drizzle-orm';
import * as t from '../../db/schema.js';
import { NotFoundError } from '../../platform/errors.js';
import {
  OctokitCiActionsClient,
  type CiActionsClient,
  type WorkflowRunSummary,
} from './actions-client.js';
import { CI_RUN_SOURCE, EXPORT_BRANCH, EXPORT_PR_TITLE } from './constants.js';
import { generateFiles, prBody } from './generators.js';
import { mapConclusion, slugify, splitRepo } from './helpers.js';
import { installationToDto, runToDto } from './mappers.js';

/**
 * A4 — Export-to-CI + CI Runs (§7 L06).
 *
 * Export: generate the workflow + agent/skill artifacts, optionally open a PR in
 * the target repo via the Octokit GitHubClient (PAT), and persist a
 * `ci_installations` row.
 *
 * Ingestion (local-first): poll our `devdigest-review.yml` workflow runs through
 * the Actions API (`CiActionsClient`, PAT `Actions: Read`), read each run's
 * `devdigest-result.json` artifact, and upsert `ci_runs`. No webhooks.
 */
export class CiService {
  private agents: Container['agentsRepo'];

  constructor(
    private container: Container,
    /** Injectable for tests (mock Actions API); may be late-bound and return
     *  undefined, in which case the real Octokit client is used. */
    private actionsClientFactory?: () => Promise<CiActionsClient | undefined>,
  ) {
    this.agents = container.agentsRepo;
  }

  // ---- Export -------------------------------------------------------------

  async export(workspaceId: string, agentId: string, input: CiExportInput): Promise<CiExport> {
    const agent = await this.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    // Touch skill IDs (preserves the original read); manifests use linkedSkills.
    await this.agents.skillIdsForAgent(agentId);
    const skills = await this.agents.linkedSkills(agentId);

    const files = generateFiles(input, {
      name: agent.name,
      slug: slugify(agent.name),
      provider: agent.provider,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      strategy: agent.strategy,
      ciFailOn: agent.ciFailOn,
      skills: skills.map((l) => ({ name: l.skill.name, body: l.skill.body })),
    });

    let prUrl: string | null = null;
    if (input.action === 'open_pr') {
      const repo = splitRepo(input.repo);
      const github = await this.container.github();
      const branch = EXPORT_BRANCH;

      // Commit the generated files onto the branch as one atomic commit. On
      // re-publish this just adds a new commit to the same branch — idempotent.
      await github.commitFiles(repo, {
        branch,
        base: input.base,
        message: EXPORT_PR_TITLE,
        files: files.map((f) => ({ path: f.path, contents: f.contents })),
      });

      // Reuse the open PR for this branch if there is one (re-publish), else open it.
      const existing = await github.findOpenPr(repo, branch);
      prUrl =
        existing?.url ??
        (
          await github.openPullRequest(repo, {
            title: EXPORT_PR_TITLE,
            head: branch,
            base: input.base,
            body: prBody(agent.name, input.target, files),
          })
        ).url;
    }

    // Upsert the installation row so re-publishing the same agent→repo doesn't
    // accumulate duplicates.
    const [existingInstall] = await this.container.db
      .select()
      .from(t.ciInstallations)
      .where(
        and(eq(t.ciInstallations.agentId, agentId), eq(t.ciInstallations.repo, input.repo)),
      );
    const row =
      existingInstall ??
      (
        await this.container.db
          .insert(t.ciInstallations)
          .values({ agentId, repo: input.repo, targetType: input.target })
          .returning()
      )[0];

    return {
      installation: installationToDto(row!),
      files,
      pr_url: prUrl,
    };
  }

  async listInstallations(workspaceId: string): Promise<CiInstallation[]> {
    // installations join through agents for workspace scoping
    const rows = await this.container.db
      .select({ ci: t.ciInstallations })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.agents.id, t.ciInstallations.agentId))
      .where(eq(t.agents.workspaceId, workspaceId));
    return rows.map((r) => installationToDto(r.ci));
  }

  // ---- CI Runs (ingestion + read) ----------------------------------------

  /**
   * Ingest CI runs for every installation in the workspace (or a single repo).
   * Polls the Actions API, reads artifacts, and upserts `ci_runs`. Returns the
   * full, freshly-read list of runs for the workspace.
   */
  async listRuns(
    workspaceId: string,
    opts: { ingest?: boolean } = {},
  ): Promise<CiRun[]> {
    if (opts.ingest !== false) {
      await this.ingest(workspaceId).catch(() => undefined); // resilient: never block reads
    }
    const rows = await this.container.db
      .select({ run: t.ciRuns })
      .from(t.ciRuns)
      .leftJoin(t.ciInstallations, eq(t.ciInstallations.id, t.ciRuns.ciInstallationId))
      .leftJoin(t.agents, eq(t.agents.id, t.ciInstallations.agentId))
      .where(eq(t.agents.workspaceId, workspaceId));
    return rows
      .map((r) => runToDto(r.run))
      .sort((a, b) => (b.ran_at ?? '').localeCompare(a.ran_at ?? ''));
  }

  /** Poll Actions for each installation and upsert ci_runs (idempotent by github_url). */
  async ingest(workspaceId: string): Promise<number> {
    const installations = await this.container.db
      .select({ ci: t.ciInstallations })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.agents.id, t.ciInstallations.agentId))
      .where(eq(t.agents.workspaceId, workspaceId));

    if (installations.length === 0) return 0;
    const client = await this.resolveActionsClient();

    let upserted = 0;
    for (const { ci } of installations) {
      const { owner, name } = splitRepo(ci.repo);
      const runs = await client.listWorkflowRuns({ owner, name });
      for (const run of runs) {
        const artifact =
          run.conclusion === 'success' || run.conclusion === 'failure'
            ? await client.getResultArtifact({ owner, name }, run.id)
            : null;
        await this.upsertRun(ci.id, run, artifact);
        upserted += 1;
      }
    }
    return upserted;
  }

  private async upsertRun(
    installationId: string,
    run: WorkflowRunSummary,
    artifact: Awaited<ReturnType<CiActionsClient['getResultArtifact']>>,
  ): Promise<void> {
    const status = mapConclusion(run.conclusion, artifact?.findings_count ?? null);
    const values = {
      ciInstallationId: installationId,
      prNumber: artifact?.pr_number ?? run.pr_number ?? null,
      ranAt: run.created_at ? new Date(run.created_at) : null,
      status,
      findingsCount: artifact?.findings_count ?? null,
      costUsd: artifact?.cost_usd ?? null,
      githubUrl: run.html_url,
      source: CI_RUN_SOURCE,
    };

    // idempotent on github_url (one row per Actions run)
    if (run.html_url) {
      const [existing] = await this.container.db
        .select()
        .from(t.ciRuns)
        .where(eq(t.ciRuns.githubUrl, run.html_url));
      if (existing) {
        await this.container.db
          .update(t.ciRuns)
          .set(values)
          .where(eq(t.ciRuns.id, existing.id));
        return;
      }
    }
    await this.container.db.insert(t.ciRuns).values(values);
  }

  // ---- Clients ------------------------------------------------------------

  private async resolveActionsClient(): Promise<CiActionsClient> {
    if (this.actionsClientFactory) {
      // Factory may be late-bound (returns undefined when no override is set);
      // fall through to the real client in that case.
      const override = await this.actionsClientFactory();
      if (override) return override;
    }
    const token = await this.container.secrets.get('GITHUB_TOKEN');
    if (!token) throw new NotFoundError('GITHUB_TOKEN is not configured for Actions ingestion');
    return new OctokitCiActionsClient(token);
  }
}
