/**
 * onboarding — application service (ring 2). The onboarding tour:
 *
 *   view()          the stored tour + latest run + stale flag, from the DB only
 *   generate()      start a run (one per repo), enqueue the job
 *   runGeneration() read a few files in code → one structured LLM call →
 *                   verify every path and command → store the survivors
 *
 * Commands are only ever copied, never executed.
 */
import { OnboardingDraft, type Onboarding, type OnboardingRun, type OnboardingView } from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { GENERATE_JOB_KIND, INVALID_TOUR_ERROR, MAX_TOTAL_CHARS, STALE_RUN_MS, TOP_FILES } from './constants.js';
import {
  buildMessages,
  draftPaths,
  filterTree,
  isSchemaFailure,
  isStale,
  linesOf,
  runErrorText,
  scriptsFrom,
  selectInputPaths,
  toTour,
  truncate,
  verifyDraft,
  type InputFile,
} from './helpers.js';
import type { GenerateJobPayload, OnboardingDeps, RunUsage } from './ports.js';

const isUnique = (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
const isFkViolation = (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: string }).code === '23503';

/** Files whose lines may justify a command verbatim (AC-29). */
const COMMAND_SOURCE = /(^|\/)(readme(\.[a-z0-9]+)?|makefile|docker-compose\.ya?ml|compose\.ya?ml|\.env\.example)$/i;

export class OnboardingService {
  constructor(private readonly deps: OnboardingDeps) {
    deps.jobs.register(GENERATE_JOB_KIND, (payload) => this.runGeneration(payload as GenerateJobPayload));
  }

  /** DB only: no model call and no git read (NFR-1). */
  async view(workspaceId: string, repoId: string): Promise<OnboardingView> {
    const repo = await this.repoOr404(workspaceId, repoId);
    // Run first, then the tour: a run seen as `done` must come with its tour
    // (the two are written in one transaction, so reading them concurrently
    // could straddle the commit).
    const run = await this.deps.repo.getLatestRun(workspaceId, repoId);
    const [tour, state] = await Promise.all([
      this.deps.repo.getStored(workspaceId, repoId),
      this.deps.repoIntel.getIndexState(repoId),
    ]);
    const stale = tour ? isStale(new Date(tour.generated_at), state.updatedAt, repo.lastPolledAt) : false;
    return { tour, run: run ?? null, stale };
  }

  /** Start a run. A young running run is returned as is; an orphaned one is failed first. */
  async generate(workspaceId: string, repoId: string): Promise<OnboardingRun> {
    const repo = await this.repoOr404(workspaceId, repoId);
    if (!repo.clonePath) throw new ValidationError('Repository is not cloned yet; add it and wait for the clone to finish');
    const latest = await this.deps.repo.getLatestRun(workspaceId, repoId);
    if (latest?.status === 'running') {
      const age = (this.deps.now?.() ?? new Date()).getTime() - Date.parse(latest.started_at);
      if (age < STALE_RUN_MS) return latest;
      await this.deps.repo.failRun(
        workspaceId,
        latest.id,
        `Generation did not finish within ${Math.round(STALE_RUN_MS / 60_000)} minutes and was abandoned`,
      );
    }
    const model = await this.deps.featureModel(workspaceId);
    let run: OnboardingRun;
    try {
      run = await this.deps.repo.createRun(workspaceId, repoId, model);
    } catch (err) {
      // Partial unique index `onboarding_runs_one_running_uidx`: a concurrent request won.
      if (isUnique(err)) {
        const running = await this.deps.repo.getLatestRun(workspaceId, repoId);
        if (running?.status === 'running') return running;
      }
      throw err;
    }
    const payload: GenerateJobPayload = { workspaceId, repoId, runId: run.id };
    await this.deps.jobs.enqueue(workspaceId, GENERATE_JOB_KIND, payload);
    return run;
  }

  /** The background half. Never throws: the run row records success or the error. */
  async runGeneration({ workspaceId, repoId, runId }: GenerateJobPayload): Promise<void> {
    let usage: RunUsage = {};
    try {
      const repo = await this.repoOr404(workspaceId, repoId);
      const state = await this.deps.repoIntel.getIndexState(repoId);
      const limited = !this.deps.repoIntelEnabled || state.status !== 'full';
      const ref = { owner: repo.owner, name: repo.name };

      const listed = await this.deps.git.listFiles(ref, repo.defaultBranch, ['**']);
      const tree = filterTree(listed.files.map((f) => f.path));
      const ranked = limited ? [] : await this.deps.repoIntel.getTopFilesByRank(repoId, TOP_FILES);
      const chains = limited ? [] : await this.deps.repoIntel.getCriticalPaths(repoId);
      const filesIndexed = limited ? tree.length : state.filesIndexed;
      usage = { filesIndexed };

      const files: InputFile[] = [];
      let total = 0;
      for (const path of selectInputPaths(tree, ranked, chains)) {
        let content: string;
        try {
          content = await this.deps.git.showFile(ref, listed.sha, path);
        } catch {
          continue;
        }
        if (!content.trim()) continue;
        const text = truncate(content);
        if (total + text.length > MAX_TOTAL_CHARS) continue;
        total += text.length;
        files.push({ path, content: text });
      }

      const { provider, model } = await this.deps.featureModel(workspaceId);
      usage = { ...usage, provider, model };
      const llm = await this.deps.llm(provider);
      this.deps.log?.(`onboarding: generating from ${files.length} file(s) with ${provider}/${model}`, { repoId, runId });
      let result;
      try {
        result = await llm.completeStructured({
          model,
          schema: OnboardingDraft,
          schemaName: 'OnboardingDraft',
          messages: buildMessages({
            repoFullName: repo.fullName,
            systemPrompt: await this.deps.systemPrompt(),
            files,
            tree,
            chains,
            limited,
          }),
          temperature: 0,
          sessionId: `onboarding:${repo.fullName}:${runId}`,
        });
      } catch (err) {
        if (isSchemaFailure(err)) throw new Error(INVALID_TOUR_ERROR, { cause: err });
        throw err;
      }
      usage = { ...usage, tokensIn: result.tokensIn, tokensOut: result.tokensOut, costUsd: result.costUsd };
      const draft = OnboardingDraft.safeParse(result.data);
      if (!draft.success) throw new Error(INVALID_TOUR_ERROR);

      // AC-28: a path is kept when we read it, or it is in the index (usable index)
      // or in the default-branch tree (limited).
      const allowedPaths = new Set<string>(files.map((f) => f.path));
      const cited = draftPaths(draft.data);
      if (limited) {
        for (const p of tree) allowedPaths.add(p);
      } else if (cited.length > 0) {
        for (const r of await this.deps.repoIntel.getFileRank(repoId, cited)) allowedPaths.add(r.path);
      }
      const scripts = new Set<string>();
      const lines = new Set<string>();
      let hasPackageJson = false;
      for (const f of files) {
        if (/(^|\/)package\.json$/i.test(f.path)) {
          hasPackageJson = true;
          for (const s of scriptsFrom(f.content)) scripts.add(s);
        } else if (COMMAND_SOURCE.test(f.path)) {
          for (const l of linesOf(f.content)) lines.add(l);
        }
      }
      const sections = verifyDraft(draft.data, { allowedPaths, scripts, lines, hasPackageJson });
      const tour: Onboarding = toTour(sections, {
        generatedAt: this.deps.now?.() ?? new Date(),
        provider,
        model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        filesIndexed,
        limited,
      });
      await this.deps.repo.completeRun(workspaceId, repoId, runId, tour);
      this.deps.log?.(`onboarding: tour stored (${files.length} file(s) read)`, { repoId, runId });
    } catch (err) {
      // The repo was removed mid-run: the cascade took the run row too.
      if (isFkViolation(err) || err instanceof NotFoundError) return;
      this.deps.log?.('onboarding: generation failed', { repoId, runId });
      await this.deps.repo.failRun(workspaceId, runId, runErrorText(err), usage);
    }
  }

  private async repoOr404(workspaceId: string, repoId: string) {
    const repo = await this.deps.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }
}
