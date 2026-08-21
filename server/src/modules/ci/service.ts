import { zipSync, strToU8 } from 'fflate';
import type {
  AgentPerf,
  AgentPerfRow,
  CiExport,
  CiExportInput,
  CiFile,
  CiInstallation,
  CiRun,
  CiRunSummary,
  CiSecretStatus,
  CiTarget,
  GitHubClient,
  RepoRef,
  RunTrace,
  WorkflowRun,
} from '@devdigest/shared';
import { NotFoundError, ValidationError, ExternalServiceError } from '../../platform/errors.js';
import { buildRunTrace } from '../../platform/trace-builder.js';
import { CiRepository, type CiInstallationRow, type CiRunFilters, type CiRunRow } from './repository.js';
import type { AgentLookup, MemoryReader, RepoLookup, SkillLookup } from './ports.js';
import { buildBundle } from './bundle.js';
import { listRegisteredTargets } from './targets.js';
import { CI_BRANCH, OPENROUTER_SECRET_NAME, WORKFLOW_PATH } from './constants.js';
import { checkIngestArtifact } from './ingest.js';
import { RefreshDebounce } from './refresh.js';

const PERF_RANGE_PRESETS = [7, 30, 90] as const;
const RESULT_ARTIFACT_NAME = 'devdigest-result';

/**
 * specs/14-export-to-ci.md (P3) — orchestration only. All persistence goes
 * through `CiRepository`; all agent/skill/memory/repo lookups go through the
 * narrow ports in `ports.ts`; all pure file generation goes through
 * `bundle.ts` (P2). This file never imports `Container`
 * (`no-container-in-services`) and never imports `src/db/**`.
 */

export interface CiExportOptions {
  repo: string;
  target: CiTarget;
  action: 'open_pr' | 'files';
  post_as: 'github_review' | 'pr_comment' | 'none';
  triggers: string[];
  base: string;
}

function splitRepo(fullName: string): RepoRef {
  const [owner, name] = fullName.split('/', 2);
  if (!owner || !name) {
    throw new ValidationError(`Repository must be in "owner/name" form, got "${fullName}"`);
  }
  return { owner, name };
}

/** `CiFile.contents` is `.nullable()` on the shared contract because a
 *  PREVIEW response may null it out for the runner bundle's own files
 *  (P-4) — `generateFiles`/`buildBundle` never do that themselves (see
 *  `bundle.ts`'s own comment to the same effect), so every file reaching
 *  `exportArchive`/`commitFiles` always carries real contents. This asserts
 *  that invariant rather than silently coercing `null` to `''`. */
function requireContents(file: CiFile): string {
  if (file.contents == null) {
    throw new Error(`Internal error: generated file ${file.path} has no contents`);
  }
  return file.contents;
}

/** AC-36 — the CI tab's per-installation "last run" glance, embedded on the
 *  contract's `last_run` field rather than surfaced as flat sibling fields. */
function toRunSummary(row: CiRunRow | undefined): CiRunSummary | null {
  if (!row) return null;
  return {
    status: (row.status ?? 'failed') as CiRunSummary['status'],
    ran_at: row.ranAt ? row.ranAt.toISOString() : row.ingestedAt?.toISOString() ?? '',
    findings_count: row.findingsCount,
  };
}

function toContractInstallation(
  row: CiInstallationRow,
  lastRun: CiRunSummary | null = null,
): CiInstallation {
  return {
    id: row.id,
    agent_id: row.agentId,
    repo: row.repo,
    target_type: row.targetType,
    branch: row.branch,
    base: row.base,
    post_as: row.postAs,
    triggers: row.triggers,
    workflow_path: row.workflowPath,
    pr_url: row.prUrl,
    // AC-8's insert is always immediately followed by
    // `updateInstallationAfterExport` in `export()` before the row is ever
    // read back, so `lastExportAt` is populated in practice; the DB column
    // stays nullable only because it's set in a second statement, not a
    // second source of truth. Fall back to `installedAt` rather than an
    // empty string if that invariant is ever violated.
    last_export_at: (row.lastExportAt ?? row.installedAt).toISOString(),
    last_refreshed_at: row.lastRefreshedAt ? row.lastRefreshedAt.toISOString() : null,
    last_run: lastRun,
    installed_at: row.installedAt.toISOString(),
  };
}

/** AC-27 — `repo` is joined in from the installation (not stored on the run
 *  row itself); every other field maps straight across. `duration_s` mirrors
 *  `duration_ms` for the pre-existing column's back-compat shape. */
function toContractRun(row: CiRunRow, installation: CiInstallationRow | undefined): CiRun {
  return {
    id: row.id,
    ci_installation_id: row.ciInstallationId,
    provider_run_id: row.providerRunId,
    repo: installation?.repo ?? null,
    commit_sha: row.commitSha,
    pr_number: row.prNumber,
    pr_title: row.prTitle,
    pr_url: row.prUrl,
    ran_at: row.ranAt ? row.ranAt.toISOString() : null,
    status: (row.status as CiRun['status']) ?? null,
    findings_count: row.findingsCount,
    critical: row.critical,
    warning: row.warning,
    suggestion: row.suggestion,
    cost_usd: row.costUsd,
    github_url: row.githubUrl,
    source: row.source,
    agent: row.agentName,
    agent_name: row.agentName,
    duration_s: row.durationMs != null ? row.durationMs / 1000 : null,
    duration_ms: row.durationMs,
    duration_source: row.durationSource,
    failure_reason: row.failureReason,
  };
}

export class CiService {
  private refreshGate = new RefreshDebounce();

  constructor(
    private repo: CiRepository,
    private agentLookup: AgentLookup,
    private skillLookup: SkillLookup,
    private memoryReader: MemoryReader,
    private repoLookup: RepoLookup,
    private githubClient: () => Promise<GitHubClient>,
    // P-2 — the pulled-in agent-runner's committed bundle DIRECTORY
    // (`AppConfig.ciRunnerBundleDir`), copied wholesale into every export.
    private runnerBundleDir: string,
  ) {}

  listTargets(): CiTarget[] {
    // D13/AC-2a — exactly what's registered in `targets.ts`; adding a
    // second target is one entry there, no change here.
    return listRegisteredTargets();
  }

  /** AC-3/AC-9/AC-25 — regenerated on every call, no cache, no LLM call. */
  async preview(workspaceId: string, agentId: string, opts: CiExportOptions): Promise<CiFile[]> {
    return this.generateFiles(workspaceId, agentId, opts);
  }

  private async generateFiles(
    workspaceId: string,
    agentId: string,
    opts: CiExportOptions,
  ): Promise<CiFile[]> {
    const agent = await this.agentLookup.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const skillRows = await this.skillLookup.enabledSkills(agentId);
    const repoRow = await this.repoLookup.findByFullName(workspaceId, opts.repo);
    // AC-58a — a repository not (yet) imported into the studio has no repo
    // id to match memory against; the bundle still gets a valid empty
    // memory file (buildBundle/buildMemoryJsonl handle the empty case).
    const memoryRows = repoRow ? await this.memoryReader.listRepoScoped(workspaceId, repoRow.id) : [];

    return buildBundle({
      target: opts.target,
      agent: {
        name: agent.name,
        provider: agent.provider,
        model: agent.model,
        systemPrompt: agent.systemPrompt,
        strategy: agent.strategy,
        ciFailOn: agent.ciFailOn,
      },
      skills: skillRows,
      memory: memoryRows,
      triggers: opts.triggers,
      postAs: opts.post_as,
      runnerBundleDir: this.runnerBundleDir,
    });
  }

  /** AC-64/AC-6/P-7 — three states, not two. `github.listRepoSecretNames`
   *  returns `null` when the credential lacked permission to LIST secrets at
   *  all (a 403 on the secrets-list endpoint — the common case for a
   *  fine-grained local-mode PAT without `Secrets: read`), which must render
   *  as `'unknown'`, never `'missing'` (that would wrongly tell the user to
   *  add a secret they may already have) and never block the wizard.
   *  `GITHUB_TOKEN` is CI-provided with NO lookup at all. Never reads,
   *  requests, stores or displays a secret VALUE. */
  async secretStatus(workspaceId: string, repo: string): Promise<CiSecretStatus[]> {
    const ref = splitRepo(repo);
    const github = await this.githubClient();
    let names: string[] | null;
    try {
      names = await github.listRepoSecretNames(ref);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ExternalServiceError(`Could not read repository secrets for ${repo}: ${message}`);
    }
    const openrouterState: CiSecretStatus['state'] =
      names === null ? 'unknown' : names.includes(OPENROUTER_SECRET_NAME) ? 'configured' : 'missing';
    return [
      {
        name: OPENROUTER_SECRET_NAME,
        required: true,
        state: openrouterState,
        provided_by_ci: false,
      },
      { name: 'GITHUB_TOKEN', required: true, state: 'configured', provided_by_ci: true },
    ];
  }

  /** AC-10 — always available, never gated on write access; no installation
   *  row, no GitHub call beyond generation itself. */
  async exportArchive(workspaceId: string, agentId: string, opts: CiExportOptions): Promise<Uint8Array> {
    const files = await this.generateFiles(workspaceId, agentId, { ...opts, action: 'files' });
    const zipInput: Record<string, Uint8Array> = {};
    for (const f of files) zipInput[f.path] = strToU8(requireContents(f));
    return zipSync(zipInput, { level: 6 });
  }

  /** AC-5…AC-10a/AC-59 — the full export flow. */
  async export(workspaceId: string, agentId: string, input: CiExportInput): Promise<CiExport> {
    const agent = await this.agentLookup.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const opts: CiExportOptions = {
      repo: input.repo,
      target: input.target,
      action: input.action,
      post_as: input.post_as,
      triggers: input.triggers,
      base: input.base,
    };

    // AC-59 — a DIFFERENT agent already installed in this repo: refuse,
    // change nothing.
    const existingForRepo = await this.repo.getInstallationByRepo(workspaceId, input.repo);
    if (existingForRepo && existingForRepo.agentId !== agentId) {
      return {
        installation: null,
        files: [],
        pr_url: null,
        reused_pr: false,
        warnings: [],
        refused_reason:
          'This repository already has a DevDigest CI installation for a different agent. ' +
          'The runner supports exactly one agent manifest per repository, so a second export ' +
          'would break the existing deployment rather than add to it.',
      };
    }

    const files = await this.generateFiles(workspaceId, agentId, opts);

    if (input.action === 'files') {
      // AC-10a's other half: this branch never touches GitHub and never
      // writes an installation row.
      return { installation: null, files, pr_url: null, reused_pr: false, warnings: [], refused_reason: null };
    }

    // AC-7 — reuse the existing (agent, repo, target) installation's branch.
    const existingTuple =
      existingForRepo && existingForRepo.agentId === agentId ? existingForRepo : undefined;

    let github: GitHubClient;
    try {
      github = await this.githubClient();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        installation: null,
        files,
        pr_url: null,
        reused_pr: false,
        warnings: [],
        refused_reason: `No GitHub credential is configured: ${message}`,
      };
    }

    const ref = splitRepo(input.repo);
    let prUrl: string;
    // AC-7/AC-37 — true when an already-open PR for this installation's
    // branch was found and reused rather than opened fresh; the HTTP status
    // (200 vs 201, decided by the route) carries "first install vs
    // republish" separately.
    let reusedPr = false;
    try {
      await github.commitFiles(ref, {
        branch: CI_BRANCH,
        base: input.base,
        message: existingTuple
          ? 'Update DevDigest CI configuration'
          : 'Add DevDigest CI review workflow',
        files: files.map((f) => ({ path: f.path, contents: requireContents(f) })),
      });
      // AC-7's edge case — the previous PR may have been closed/merged;
      // reuse an OPEN one if it exists, otherwise open a new one rather
      // than resurrecting a closed PR.
      const openPr = await github.findOpenPr(ref, CI_BRANCH);
      if (openPr) {
        prUrl = openPr.url;
        reusedPr = true;
      } else {
        const opened = await github.openPullRequest(ref, {
          title: 'Add DevDigest CI review',
          head: CI_BRANCH,
          base: input.base,
          body:
            `This PR adds DevDigest's automated review (agent: ${agent.name}) as a GitHub ` +
            `Actions workflow. Add the \`${OPENROUTER_SECRET_NAME}\` repository secret before ` +
            `merging so the workflow can run.`,
        });
        prUrl = opened.url;
      }
    } catch (err) {
      // AC-10a — the credential exists but cannot write to this repository
      // (or the repository doesn't exist). Stated reason, zero installation
      // rows, the archive/preview path is unaffected.
      const message = err instanceof Error ? err.message : String(err);
      return {
        installation: null,
        files,
        pr_url: null,
        reused_pr: false,
        warnings: [],
        refused_reason: `The configured credential could not write to ${input.repo}: ${message}`,
      };
    }

    let installationId: string;
    if (existingTuple) {
      // AC-7/AC-37 — reuse: update the same row, never a second one.
      await this.repo.updateInstallationAfterExport(existingTuple.id, {
        prUrl,
        lastExportAt: new Date(),
        postAs: input.post_as,
        triggers: input.triggers,
      });
      installationId = existingTuple.id;
    } else {
      // AC-8 — record agent, repo, target type, installed-at.
      const inserted = await this.repo.insertInstallation({
        workspaceId,
        agentId,
        repo: input.repo,
        targetType: input.target,
        branch: CI_BRANCH,
        base: input.base,
        workflowPath: WORKFLOW_PATH,
        postAs: input.post_as,
        triggers: input.triggers,
      });
      await this.repo.updateInstallationAfterExport(inserted.id, { prUrl, lastExportAt: new Date() });
      installationId = inserted.id;
    }

    const finalRow = (await this.repo.getInstallationById(workspaceId, installationId))!;

    return {
      installation: toContractInstallation(finalRow),
      files,
      pr_url: prUrl,
      reused_pr: reusedPr,
      warnings: [],
      refused_reason: null,
    };
  }

  /** AC-37 — regenerate from the agent's CURRENT config and republish under
   *  the AC-7 reuse rules. */
  async republish(workspaceId: string, installationId: string): Promise<CiExport> {
    const installation = await this.repo.getInstallationById(workspaceId, installationId);
    if (!installation) throw new NotFoundError('CI installation not found');
    return this.export(workspaceId, installation.agentId, {
      repo: installation.repo,
      target: installation.targetType,
      action: 'open_pr',
      post_as: installation.postAs,
      triggers: installation.triggers,
      base: installation.base,
    });
  }

  /** AC-33…AC-39 — the agent editor's CI tab list. */
  async listInstallationsForAgent(workspaceId: string, agentId: string): Promise<CiInstallation[]> {
    const rows = await this.repo.listInstallationsForAgent(workspaceId, agentId);
    const lastRunByInstallation = await this.repo.lastRunPerInstallation(
      workspaceId,
      rows.map((r) => r.id),
    );
    return rows.map((row) => toContractInstallation(row, toRunSummary(lastRunByInstallation.get(row.id))));
  }

  // ===========================================================================
  // P4 — Ingestion (AC-17…AC-25) + read surfaces (AC-26…AC-46)
  // ===========================================================================

  /** AC-25 — stored rows only, zero GitHub calls, zero LLM calls. */
  async listRuns(workspaceId: string, filters: CiRunFilters): Promise<CiRun[]> {
    const [runs, installations] = await Promise.all([
      this.repo.listRuns(workspaceId, filters),
      this.repo.listInstallationsForWorkspace(workspaceId),
    ]);
    const byId = new Map(installations.map((i) => [i.id, i] as const));
    return runs.map((r) => toContractRun(r, r.ciInstallationId ? byId.get(r.ciInstallationId) : undefined));
  }

  /**
   * AC-17/AC-29 — query the CI provider for completed runs of each
   * installation's workflow, at most once per installation per 30s interval
   * unless `force`. A provider error for one installation degrades that
   * installation's cycle rather than failing the whole refresh or emptying
   * the list (spec's Edge cases, AC-29).
   */
  async refresh(workspaceId: string, force: boolean): Promise<{ ingested: number; degraded: boolean }> {
    const installations = await this.repo.listInstallationsForWorkspace(workspaceId);
    let ingested = 0;
    let degraded = false;
    let github: GitHubClient | null = null;
    for (const installation of installations) {
      if (!this.refreshGate.shouldQuery(installation.id, force)) continue;
      this.refreshGate.markQueried(installation.id);
      try {
        github ??= await this.githubClient();
        ingested += await this.ingestInstallation(workspaceId, installation, github);
      } catch {
        degraded = true;
      }
    }
    return { ingested, degraded };
  }

  private async ingestInstallation(
    workspaceId: string,
    installation: CiInstallationRow,
    github: GitHubClient,
  ): Promise<number> {
    const ref = splitRepo(installation.repo);
    const runs: WorkflowRun[] = await github.listWorkflowRuns(ref, {
      workflowPath: installation.workflowPath,
      perPage: 20,
    });
    let count = 0;
    for (const run of runs) {
      // Not yet completed: leave it alone rather than record it as failed
      // (spec's Edge cases — "CI run in progress at refresh time").
      if (run.status !== 'completed') continue;
      await this.ingestOneRun(workspaceId, installation, ref, run, github);
      count += 1;
    }
    return count;
  }

  private async ingestOneRun(
    workspaceId: string,
    installation: CiInstallationRow,
    ref: RepoRef,
    run: WorkflowRun,
    github: GitHubClient,
  ): Promise<void> {
    const providerRunId = String(run.id);
    const prNumber = run.pull_requests[0] ?? null;
    const ranAt = run.run_started_at ? new Date(run.run_started_at) : new Date(run.created_at);
    const providerDurationMs =
      run.run_started_at ? new Date(run.updated_at).getTime() - new Date(run.run_started_at).getTime() : null;

    const artifacts = await github.listRunArtifacts(ref, run.id);
    const resultArtifact = artifacts.find((a) => a.name === RESULT_ARTIFACT_NAME && !a.expired);

    if (!resultArtifact) {
      // AC-21 — completed, no artifact published: a failed row with PR
      // number, time and a usable link, null counts and null cost, never
      // skipped.
      await this.persistRun(workspaceId, installation, {
        providerRunId,
        prNumber,
        prTitle: null,
        prUrl: null,
        commitSha: run.head_sha,
        agentName: null,
        ranAt,
        status: 'failed',
        findingsCount: null,
        critical: null,
        warning: null,
        suggestion: null,
        costUsd: null,
        durationMs: providerDurationMs,
        durationSource: providerDurationMs != null ? 'provider' : null,
        githubUrl: run.html_url,
        failureReason: 'no_artifact_published',
      });
      return;
    }

    let zipBytes: Uint8Array;
    try {
      zipBytes = await github.downloadArtifact(ref, resultArtifact.id);
    } catch (err) {
      await this.persistRun(workspaceId, installation, {
        providerRunId,
        prNumber,
        prTitle: null,
        prUrl: null,
        commitSha: run.head_sha,
        agentName: null,
        ranAt,
        status: 'failed',
        findingsCount: null,
        critical: null,
        warning: null,
        suggestion: null,
        costUsd: null,
        durationMs: providerDurationMs,
        durationSource: providerDurationMs != null ? 'provider' : null,
        githubUrl: run.html_url,
        failureReason: `artifact_download_failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

    // AC-18 — all four checks (auth is proven by the caller having already
    // resolved a workspace via getContext before `refresh` was invoked).
    const check = checkIngestArtifact({
      zipBytes,
      providerHeadSha: run.head_sha,
      installationRepo: installation.repo,
    });

    if (!check.ok) {
      await this.persistRun(workspaceId, installation, {
        providerRunId,
        prNumber,
        prTitle: null,
        prUrl: null,
        commitSha: run.head_sha,
        agentName: null,
        ranAt,
        status: 'failed',
        findingsCount: null,
        critical: null,
        warning: null,
        suggestion: null,
        costUsd: null,
        durationMs: providerDurationMs,
        durationSource: providerDurationMs != null ? 'provider' : null,
        githubUrl: run.html_url,
        failureReason: check.failedCheck,
      });
      return;
    }

    const artifact = check.artifact;
    // AC-25's "no_findings" / "succeeded" distinction — never derived from
    // the CI job's own exit code (which can be non-zero purely because the
    // gate triggered, a SUCCESSFUL review, not a failure).
    const status = artifact.findings_count === 0 ? 'no_findings' : 'succeeded';

    await this.persistRun(workspaceId, installation, {
      providerRunId,
      prNumber: artifact.pr_number ?? prNumber,
      prTitle: null,
      prUrl: null,
      commitSha: check.meta.commit_sha,
      agentName: artifact.agent,
      ranAt,
      status,
      findingsCount: artifact.findings_count,
      critical: artifact.critical ?? null,
      warning: artifact.warning ?? null,
      suggestion: artifact.suggestion ?? null,
      costUsd: artifact.cost_usd,
      durationMs: artifact.duration_ms ?? providerDurationMs,
      durationSource: artifact.duration_ms != null ? 'artifact' : providerDurationMs != null ? 'provider' : null,
      githubUrl: run.html_url,
      failureReason: null,
    });
  }

  private async persistRun(
    workspaceId: string,
    installation: CiInstallationRow,
    values: {
      providerRunId: string;
      prNumber: number | null;
      prTitle: string | null;
      prUrl: string | null;
      commitSha: string | null;
      agentName: string | null;
      ranAt: Date;
      status: 'succeeded' | 'failed' | 'no_findings';
      findingsCount: number | null;
      critical: number | null;
      warning: number | null;
      suggestion: number | null;
      costUsd: number | null;
      durationMs: number | null;
      durationSource: 'artifact' | 'provider' | null;
      githubUrl: string;
      failureReason: string | null;
    },
  ): Promise<void> {
    // D7/AC-20 — the agent_runs row every existing cost/latency aggregation
    // already reads, `source: 'ci'`. Written for BOTH success and failure —
    // a failed CI run still consumed CI minutes and belongs in the run
    // count, exactly like a failed local run's agent_runs row does.
    //
    // AC-19 — idempotent: a re-ingest of the SAME provider run (three
    // refreshes over one completed run) reuses the existing agent_runs row
    // rather than inserting a second one every cycle. `ci_runs.upsertRun`'s
    // unique index already dedupes the CI-run row itself; this pre-check is
    // what makes the PAIRED agent_runs write idempotent too.
    const existingRun = await this.repo.getRunByProviderRunId(workspaceId, values.providerRunId);
    const agentRunValues = {
      workspaceId,
      agentId: installation.agentId,
      // Not resolved to an imported PR row in this slice — AC-32's studio
      // link is resolved client-side from `repo` + `pr_number` instead of
      // requiring this write to know the PR's internal id.
      prId: null,
      provider: null,
      model: null,
      ranAt: values.ranAt,
      status: (values.status === 'failed' ? 'failed' : 'done') as 'failed' | 'done',
      durationMs: values.durationMs,
      costUsd: values.costUsd,
      findingsCount: values.findingsCount,
      error: values.failureReason,
    };
    const agentRun =
      existingRun?.agentRunId != null
        ? await this.repo.updateCiAgentRun(existingRun.agentRunId, agentRunValues)
        : await this.repo.insertCiAgentRun(agentRunValues);

    await this.repo.upsertRun({
      workspaceId,
      ciInstallationId: installation.id,
      providerRunId: values.providerRunId,
      prNumber: values.prNumber,
      prTitle: values.prTitle,
      prUrl: values.prUrl,
      commitSha: values.commitSha,
      agentName: values.agentName,
      ranAt: values.ranAt,
      status: values.status,
      findingsCount: values.findingsCount,
      critical: values.critical,
      warning: values.warning,
      suggestion: values.suggestion,
      costUsd: values.costUsd,
      durationMs: values.durationMs,
      durationSource: values.durationSource,
      githubUrl: values.githubUrl,
      source: installation.targetType,
      failureReason: values.failureReason,
      agentRunId: agentRun.id,
      ingestedAt: new Date(),
    });

    // AC-30 — the same run-trace surface local runs use, via the shared
    // builder; unavailable sections (prompt assembly, tool calls, raw
    // output, log) are stated as such by the CLIENT (D-P7's
    // `unavailableSections` prop), not encoded here.
    const trace: RunTrace = buildRunTrace({
      config: {
        agent: values.agentName ?? installation.repo,
        model: '',
        pr: values.prNumber,
        source: 'ci',
      },
      stats: {
        duration_ms: values.durationMs ?? 0,
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: values.costUsd,
        findings: values.findingsCount ?? 0,
        grounding: '',
      },
      promptAssembly: { system: '', user: '' },
      toolCalls: [],
      rawOutput: '',
      memoryPulled: [],
      specsRead: [],
      log: [],
    });
    await this.repo.insertRunTrace(agentRun.id, trace);
  }

  // ---- Agent Performance (AC-40…AC-46) -------------------------------------

  async agentPerformance(workspaceId: string, rangeDays: number): Promise<AgentPerf> {
    const days = (PERF_RANGE_PRESETS as readonly number[]).includes(rangeDays) ? rangeDays : 30;
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [perfRows, costByModel, agents] = await Promise.all([
      this.repo.performanceRows(workspaceId, from),
      this.repo.costByModel(workspaceId, from),
      this.agentLookup.list ? this.agentLookup.list(workspaceId) : Promise.resolve([]),
    ]);

    const agentById = new Map(agents.map((a) => [a.id, a] as const));

    const rows: AgentPerfRow[] = perfRows.map((r) => {
      const agent = agentById.get(r.agentId);
      const denom = r.accepted + r.dismissed;
      const runs = r.runsLocal + r.runsCi;
      return {
        agent_id: r.agentId,
        agent_name: agent?.name ?? 'Unknown agent',
        provider: agent?.provider ?? null,
        model: agent?.model ?? null,
        runs,
        runs_local: r.runsLocal,
        runs_ci: r.runsCi,
        findings_total: r.totalFindings,
        accepted: r.accepted,
        dismissed: r.dismissed,
        // AC-46 — null (never 0) when this agent's runs in range are
        // entirely CI-sourced (no local runs => no reviews/findings => a
        // zero denominator here).
        accept_rate: denom > 0 ? r.accepted / denom : null,
        dismiss_rate: denom > 0 ? r.dismissed / denom : null,
        avg_findings_per_run: runs > 0 ? r.totalFindings / runs : null,
        total_cost_usd: r.totalCostUsd,
        avg_cost_usd: r.totalCostUsd != null && runs > 0 ? r.totalCostUsd / runs : null,
        avg_latency_ms: r.totalDurationMs != null && runs > 0 ? r.totalDurationMs / runs : null,
        last_run_at: r.lastRunAt ? r.lastRunAt.toISOString() : null,
        // N4 — a CI run never contributes triaged findings by severity;
        // this feature does not attempt per-severity CI attribution.
        findings_by_severity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
        trend: [],
      };
    });

    const totalRuns = rows.reduce((sum, r) => sum + r.runs, 0);
    const totalCost = rows.reduce((sum, r) => (r.total_cost_usd != null ? sum + r.total_cost_usd : sum), 0);
    const acceptRates = rows.map((r) => r.accept_rate).filter((v): v is number => v != null);
    const mostActive = rows.slice().sort((a, b) => b.runs - a.runs)[0] ?? null;

    return {
      summary: {
        runs: totalRuns,
        total_cost_usd: rows.some((r) => r.total_cost_usd != null) ? totalCost : null,
        avg_accept_rate:
          acceptRates.length > 0 ? acceptRates.reduce((s, v) => s + v, 0) / acceptRates.length : null,
        most_active_agent: mostActive ? mostActive.agent_name : null,
        range_days: days,
      },
      agents: rows,
      cost_by_agent: rows
        .filter((r) => r.total_cost_usd != null)
        .map((r) => ({ label: r.agent_name, value: r.total_cost_usd as number })),
      cost_by_model: costByModel.map((m) => ({ label: m.model, value: m.cost })),
    };
  }
}
