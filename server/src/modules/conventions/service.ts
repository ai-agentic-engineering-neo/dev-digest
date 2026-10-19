import type {
  ConventionCandidate,
  ConventionScan,
  ConventionUpdateBody,
  ConventionsList,
  RepoRef,
} from '@devdigest/shared';
import type {
  ConventionStore,
  Logger,
  RepoBasics,
  RepoFiles,
  ResolveModel,
  SampleSource,
  ScanRecord,
} from './ports.js';
import { ConventionDomainError, isStaleRunning, safeRepoPath, verifyEvidence } from './domain.js';
import { ConventionExtraction, buildExtractionMessages, type SampledFile } from './prompt.js';
import { toConventionDto, toScanDto } from './helpers.js';
import { CONFIG_FILES, EXTRACTION_SCHEMA_NAME, EXTRACT_STALE_MS, SAMPLE_FILES } from './constants.js';

export interface ConventionsDeps {
  store: ConventionStore;
  samples: SampleSource;
  files: RepoFiles;
  resolveModel: ResolveModel;
  logger?: Logger;
  now?: () => Date;
}

const STALE_ERROR = 'Extraction did not finish (the server stopped mid-run)';

/**
 * L02 — conventions extractor. Sampling is code-only (root tooling configs +
 * the top-ranked files from repo-intel), then ONE model call proposes
 * candidates, and the evidence gate keeps only those whose quoted line really
 * exists in the repo. Extraction runs fire-and-forget (like reviews) and its
 * state lives in `convention_scans`, which the UI polls.
 */
export class ConventionsService {
  constructor(private readonly deps: ConventionsDeps) {}

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  /** undefined = repo not found in the workspace. */
  async list(workspaceId: string, repoId: string): Promise<ConventionsList | undefined> {
    const repo = await this.deps.store.getRepo(workspaceId, repoId);
    if (!repo) return undefined;
    const [scan, items] = await Promise.all([
      this.deps.store.latestScan(workspaceId, repoId),
      this.deps.store.list(workspaceId, repoId),
    ]);
    return { scan: scan ? this.scanDto(scan) : null, items: items.map(toConventionDto) };
  }

  /**
   * Validates + samples synchronously (so "not indexed" / "no API key" / "already
   * running" fail the request), then runs the model call in the background.
   * undefined = repo not found.
   */
  async extract(workspaceId: string, repoId: string): Promise<ConventionScan | undefined> {
    const repo = await this.deps.store.getRepo(workspaceId, repoId);
    if (!repo) return undefined;

    const latest = await this.deps.store.latestScan(workspaceId, repoId);
    if (latest && latest.status === 'running' && !isStaleRunning(latest, this.now(), EXTRACT_STALE_MS)) {
      throw new ConventionDomainError('extract_in_progress', 'An extraction is already running for this repo');
    }
    if (!repo.clonePath) {
      throw new ConventionDomainError('repo_not_indexed', 'The repo is not cloned yet — sync it first');
    }

    const model = await this.deps.resolveModel(workspaceId);
    const sampled = await this.sample(repo);
    if (!sampled.some((f) => !isConfig(f.path))) {
      throw new ConventionDomainError(
        'repo_not_indexed',
        'No source files to sample — index the repo (Repo intel) first',
      );
    }

    const scan = await this.deps.store.createScan(workspaceId, repoId);
    void this.execute(workspaceId, repo, scan.id, sampled, model).catch((err) => {
      this.deps.logger?.error({ repoId, err: (err as Error).message }, 'conventions: background extraction crashed');
    });
    return toScanDto(scan);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: ConventionUpdateBody,
  ): Promise<ConventionCandidate | undefined> {
    const r = await this.deps.store.update(workspaceId, id, {
      ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.evidence_snippet !== undefined ? { evidenceSnippet: patch.evidence_snippet } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    });
    return r && toConventionDto(r);
  }

  /** Accept all / Reject all — applies to pending candidates only. undefined = repo not found. */
  async resolvePending(
    workspaceId: string,
    repoId: string,
    status: 'accepted' | 'rejected',
  ): Promise<number | undefined> {
    const repo = await this.deps.store.getRepo(workspaceId, repoId);
    if (!repo) return undefined;
    return this.deps.store.resolvePending(workspaceId, repoId, status);
  }

  // ------------------------------------------------------------------ internals

  /** Root tooling configs (by exact name) + the top-ranked source files. */
  private async sample(repo: RepoBasics): Promise<SampledFile[]> {
    const ref = repoRef(repo);
    const codePaths = await this.deps.samples.getConventionSamples(repo.id, SAMPLE_FILES);
    const paths = [...CONFIG_FILES, ...codePaths.filter((p) => !isConfig(p))];
    const read = await Promise.all(paths.map((p) => this.tryRead(ref, p)));
    return read.filter((f): f is SampledFile => f !== null);
  }

  private async execute(
    workspaceId: string,
    repo: RepoBasics,
    scanId: string,
    sampled: SampledFile[],
    { llm, model }: Awaited<ReturnType<ResolveModel>>,
  ): Promise<void> {
    try {
      const res = await llm.completeStructured({
        model,
        schema: ConventionExtraction,
        schemaName: EXTRACTION_SCHEMA_NAME,
        messages: buildExtractionMessages(sampled),
        maxRetries: 1,
      });

      // Evidence may cite any file of the repo, not only the samples — read the
      // extra ones (safe paths only) so the gate checks the real content.
      const files = new Map(sampled.map((f) => [f.path, f.content]));
      const ref = repoRef(repo);
      const extra = [
        ...new Set(
          res.data.conventions
            .map((c) => safeRepoPath(c.evidence_path))
            .filter((p): p is string => p !== null && !files.has(p)),
        ),
      ];
      for (const f of await Promise.all(extra.map((p) => this.tryRead(ref, p)))) {
        if (f) files.set(f.path, f.content);
      }

      const verified = verifyEvidence(res.data.conventions, files);
      await this.deps.store.completeScan(workspaceId, repo.id, scanId, sampled.length, verified);
    } catch (err) {
      await this.deps.store.failScan(scanId, (err as Error).message || 'Extraction failed');
    }
  }

  /** A file of the clone, or null when missing / unreadable / empty. */
  private async tryRead(ref: RepoRef, path: string): Promise<SampledFile | null> {
    try {
      const content = await this.deps.files.readFile(ref, path);
      return content.trim() ? { path, content } : null;
    } catch {
      return null;
    }
  }

  private scanDto(scan: ScanRecord): ConventionScan {
    if (isStaleRunning(scan, this.now(), EXTRACT_STALE_MS)) {
      return toScanDto({ ...scan, status: 'failed', error: STALE_ERROR });
    }
    return toScanDto(scan);
  }
}

function repoRef(repo: RepoBasics): RepoRef {
  return { owner: repo.owner, name: repo.name };
}

const CONFIG_SET: ReadonlySet<string> = new Set(CONFIG_FILES);
function isConfig(path: string): boolean {
  return CONFIG_SET.has(path);
}
