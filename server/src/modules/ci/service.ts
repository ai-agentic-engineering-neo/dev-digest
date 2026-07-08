import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CiExport, CiFile, CiInstallation, CiRun, CiTarget } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { AgentRow, SkillRow } from '../../db/rows.js';
import { NotFoundError } from '../../platform/errors.js';
import { buildAgentManifestYaml } from './manifest.js';
import { slugFromName } from './slug.js';
import { buildCiConfigFiles, buildGhaWorkflowFile } from './workflow.js';
import {
  agentManifestPath,
  GHA_WORKFLOW_PATH,
  MEMORY_FILE_PATH,
  RUNNER_DIR,
  skillFilePath,
} from './constants.js';
import { CiRepository } from './repository.js';
import {
  buildVirtualInstallation,
  CI_BRANCH,
  computeWorkflowVersion,
  parseRepoSlug,
  toCiInstallationDto,
} from './helpers.js';
import { refreshCiRuns, type RefreshResult } from './ingest.js';

/** Absolute path to the ncc-bundled runner's output directory (see
 *  `agent-runner/CLAUDE.md`). Resolved from this file's own location rather
 *  than `process.cwd()` so it is correct regardless of where the server
 *  process is started from. */
const RUNNER_BUNDLE_DIR = fileURLToPath(new URL('../../../../agent-runner/dist/', import.meta.url));

/** Recursively list every file (never directories) under `dir`, as `/`-joined
 *  paths relative to `dir` — stable across platforms regardless of `path.sep`. */
function listFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir, { recursive: true }) as string[];
  return entries
    .filter((entry) => statSync(join(dir, entry)).isFile())
    .map((entry) => entry.split(sep).join('/'));
}

/**
 * Read every file the ncc bundle emitted (`agent-runner/dist/`) as `CiFile`s
 * under `.devdigest/runner/`. ncc's output is not always a single
 * self-contained `index.js` — dynamic `import()`s get split into extra chunk
 * files (e.g. `310.index.js`) that `index.js` loads at runtime relative to
 * itself, so shipping only `index.js` silently breaks the runner in
 * production (AC-19). Fails loudly (never a silently-incomplete export) if
 * the bundle directory or its `index.js` entry point is missing.
 */
function readRunnerBundleFiles(): CiFile[] {
  let relativePaths: string[];
  try {
    relativePaths = listFilesRecursive(RUNNER_BUNDLE_DIR);
  } catch (err) {
    throw new Error(
      `Cannot export CI files: runner bundle directory not found at ${RUNNER_BUNDLE_DIR}. ` +
        `Run "pnpm --filter agent-runner build" (or "cd agent-runner && pnpm build") first.`,
      { cause: err },
    );
  }
  if (!relativePaths.includes('index.js')) {
    throw new Error(
      `Cannot export CI files: runner bundle entry point (index.js) not found under ${RUNNER_BUNDLE_DIR}. ` +
        `Run "pnpm --filter agent-runner build" (or "cd agent-runner && pnpm build") first.`,
    );
  }
  return relativePaths.map((relativePath) => ({
    path: `${RUNNER_DIR}/${relativePath}`,
    contents: readFileSync(join(RUNNER_BUNDLE_DIR, relativePath), 'utf8'),
    editable: false,
  }));
}

export interface ExportCiInput {
  repo: string;
  target: CiTarget;
  action: 'open_pr' | 'files';
  triggers: string[];
  base: string;
  /** Forwarded to the generated workflow's `DEVDIGEST_POST_AS` env var (AC-24). */
  post_as: 'github_review' | 'pr_comment' | 'none';
  /**
   * User-edited workflow YAML from the wizard's Preview step (AC-3). When
   * present and non-empty, replaces the freshly-generated workflow file's
   * contents for GHA exports — on BOTH the `open_pr` and `files` paths —
   * rather than being silently discarded in favor of server-regenerated YAML.
   */
  workflow_override?: string | null;
}

/**
 * `ci` module — export-to-CI orchestration (the "Export to CI" wizard's
 * backend). Assembles the `.devdigest/` file set for an agent (manifest +
 * skills + empty memory log + CI config) and, for the GitHub Actions
 * open-PR flow, commits it to a `devdigest/ci` branch and opens/reuses a PR.
 *
 * Ingest of CI *run results* back into `agent_runs` (via the single existing
 * writer, `container.reviewRepo`) is T6's concern — see `modules/ci/ingest.ts`.
 * This service only ever writes to `ci_installations` (via `CiRepository`).
 */
export class CiService {
  private repo: CiRepository;

  constructor(private container: Container) {
    this.repo = container.ciRepo;
  }

  /**
   * Export an agent's config as CI files and, when requested, open/refresh a
   * PR that installs them. T6 will extend this method to also embed the
   * bundled runner (`.devdigest/runner/index.js`) into the assembled file set
   * — that seam is the `buildExportFiles` call below.
   */
  async exportCi(workspaceId: string, agentId: string, input: ExportCiInput): Promise<CiExport> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const linkedSkills = await this.container.agentsRepo.linkedSkills(agentId);
    const files = this.buildExportFiles(agent, linkedSkills, input);

    if (input.action === 'open_pr' && input.target === 'gha') {
      return this.exportViaOpenPr(agentId, input, files);
    }
    return this.exportAsFiles(agentId, input, files);
  }

  /**
   * Assemble the full `.devdigest/` file set: the manifest, one `.md` per
   * linked skill, an empty memory log, the entire bundled runner directory,
   * and the CI workflow/config file(s).
   *
   * The bundled runner (every file under `.devdigest/runner/`) is read from
   * `agent-runner/dist/` — the ncc-compiled output `agent-runner`'s
   * `pnpm build` produces (T7/T8). ncc can split dynamic imports into extra
   * chunk files alongside `index.js`, so the ENTIRE directory is shipped, not
   * just the entry point (AC-19). If that bundle is missing at export time
   * (never built, or a stale checkout), this throws loudly rather than
   * shipping a workflow whose review step (`node .devdigest/runner/index.js`)
   * would fail on every PR.
   */
  private buildExportFiles(
    agent: AgentRow,
    linkedSkills: { skill: SkillRow; order: number }[],
    input: Pick<ExportCiInput, 'target' | 'triggers' | 'post_as' | 'workflow_override'>,
  ): CiFile[] {
    const { target, triggers, post_as: postAs, workflow_override: workflowOverride } = input;
    // Slugs are derived, never persisted (T4 decision) — this service owns
    // collecting the "already used" set across the agent + its skills so
    // same-named entities in one export get disambiguated (`-2`, `-3`, ...).
    const usedSlugs = new Set<string>();
    const agentSlug = slugFromName(agent.name, usedSlugs);
    usedSlugs.add(agentSlug);

    const skillSlugs: string[] = [];
    const skillFiles: CiFile[] = linkedSkills.map(({ skill }) => {
      const slug = slugFromName(skill.name, usedSlugs);
      usedSlugs.add(slug);
      skillSlugs.push(slug);
      return { path: skillFilePath(slug), contents: skill.body, editable: true };
    });

    const manifestYaml = buildAgentManifestYaml(
      {
        name: agent.name,
        provider: agent.provider,
        model: agent.model,
        system_prompt: agent.systemPrompt,
        strategy: agent.strategy,
        ci_fail_on: agent.ciFailOn,
      },
      skillSlugs,
    );
    const manifestFile: CiFile = {
      path: agentManifestPath(agentSlug),
      contents: manifestYaml,
      editable: true,
    };

    const memoryFile: CiFile = { path: MEMORY_FILE_PATH, contents: '', editable: false };
    const runnerFiles: CiFile[] = readRunnerBundleFiles();

    const configFiles: CiFile[] =
      target === 'gha'
        ? [buildGhaWorkflowFile({ triggers, postAs })]
        : buildCiConfigFiles(target, { triggers, postAs });

    if (target === 'gha' && workflowOverride) {
      const workflowFile = configFiles.find((f) => f.path === GHA_WORKFLOW_PATH);
      if (workflowFile) workflowFile.contents = workflowOverride;
    }

    return [manifestFile, ...skillFiles, memoryFile, ...runnerFiles, ...configFiles];
  }

  /**
   * GitHub Actions + `open_pr`: commit the whole file set atomically to
   * `devdigest/ci` (creating/fast-forwarding it) and open a PR — or reuse the
   * already-open one so re-export is idempotent (AC-10, AC-11). The
   * installation row is only written AFTER every GitHub call succeeds, so a
   * failure here leaves no partial row and a retry is safe (AC-14). Never
   * calls the GitHub Secrets API (AC-9) — only `commitFiles`/`findOpenPr`/
   * `openPullRequest` from the existing `GitHubClient` port.
   */
  private async exportViaOpenPr(
    agentId: string,
    input: Pick<ExportCiInput, 'repo' | 'target' | 'base'>,
    files: CiFile[],
  ): Promise<CiExport> {
    const repoRef = parseRepoSlug(input.repo);
    const github = await this.container.github();

    const existingPr = await github.findOpenPr(repoRef, CI_BRANCH);

    await github.commitFiles(repoRef, {
      branch: CI_BRANCH,
      base: input.base,
      message: 'Add/update DevDigest CI review workflow',
      files: files.map((f) => ({ path: f.path, contents: f.contents })),
    });

    const prUrl = existingPr
      ? existingPr.url
      : (
          await github.openPullRequest(repoRef, {
            title: 'Add DevDigest CI review',
            head: CI_BRANCH,
            base: input.base,
            body: 'Installs the DevDigest agent + CI workflow generated by the Export to CI wizard.',
          })
        ).url;

    const workflowFile = files.find((f) => f.path === GHA_WORKFLOW_PATH);
    const workflowVersion = computeWorkflowVersion(workflowFile?.contents ?? '');

    const row = await this.repo.upsert({
      agentId,
      repo: input.repo,
      targetType: input.target,
      status: 'pr_open',
      workflowVersion,
    });

    return { installation: toCiInstallationDto(row), files, pr_url: prUrl };
  }

  /**
   * `action=files` or any non-GHA target: no PR, no persisted installation
   * row (AC-13) — the client builds a zip from `files`. The response still
   * carries a `CiInstallation` (required by the shared contract); it is
   * built purely in-memory and never written to `ci_installations`.
   */
  private exportAsFiles(
    agentId: string,
    input: Pick<ExportCiInput, 'repo' | 'target'>,
    files: CiFile[],
  ): CiExport {
    const workflowVersion = computeWorkflowVersion(files[files.length - 1]?.contents ?? '');
    const installation = buildVirtualInstallation({
      agentId,
      repo: input.repo,
      targetType: input.target,
      workflowVersion,
    });
    return { installation, files, pr_url: null };
  }

  /** Installations for an agent — workspace ownership verified via the agent lookup. */
  async listInstallations(workspaceId: string, agentId: string): Promise<CiInstallation[]> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const rows = await this.repo.listForAgent(agentId);
    return rows.map(toCiInstallationDto);
  }

  /**
   * Pull-based ingest (`POST /ci/refresh`, AC-27): polls every tracked GHA
   * installation in the workspace for new workflow runs and persists any
   * valid results. See `modules/ci/ingest.ts` for the per-installation/per-run
   * skip vs. degraded distinction (AC-31/AC-32). This is the ONLY entry point
   * into ingest — routes never import `ingest.ts` directly.
   */
  async refresh(workspaceId: string): Promise<RefreshResult> {
    return refreshCiRuns(this.container, workspaceId);
  }

  /** All CI-ingested runs for the workspace (`GET /ci/runs`), newest first. */
  async listRuns(workspaceId: string): Promise<CiRun[]> {
    const rows = await this.container.reviewRepo.listCiRunsForWorkspace(workspaceId);
    return rows.map(({ run, agentName }) => {
      const findingsCount = run.findingsCount ?? 0;
      const blockers = run.blockers ?? 0;
      // Same derivation `toReviewPayload` (reviewer-core) uses: no findings →
      // APPROVE; the deterministic gate tripped → REQUEST_CHANGES; otherwise
      // COMMENT. `blockers` was itself produced by `countBlockers` at ingest
      // time (AC-29), so this is not a parallel/CI-specific rule.
      const verdict =
        run.findingsCount == null
          ? null
          : findingsCount === 0
            ? ('approve' as const)
            : blockers > 0
              ? ('request_changes' as const)
              : ('comment' as const);

      return {
        id: run.id,
        ci_installation_id: run.ciInstallationId,
        pr_id: run.prId,
        repo: run.repo ?? '',
        pr_number: run.externalPrNumber,
        ran_at: run.ranAt ? run.ranAt.toISOString() : null,
        agent: agentName,
        status: run.status,
        verdict,
        findings_count: run.findingsCount,
        blockers: run.blockers,
        score: run.score,
        cost_usd: run.costUsd,
        duration_s: run.durationMs != null ? run.durationMs / 1000 : null,
        actions_job_url: run.actionsJobUrl,
        source: run.source,
      };
    });
  }
}
