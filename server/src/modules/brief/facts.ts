import { parseIssueNumber, parseSpecRef } from '../_shared/linked-issue.js';
import type { BriefPrFileRow, BriefPullRow, BriefRepoRow } from './repository.js';
import { hunkRangesFor, type HunkRange } from './hunks.js';
import type { CloneReader, GithubResolver, RepoIntelBlastResult, RepoIntelPort } from './ports.js';
import { FACT_POOL_SAFETY_MAX, FACT_SYMBOLS_MAX, MAX_ISSUE_BODY_CHARS } from './constants.js';

/**
 * AC-1..AC-9: assemble the WHOLE deterministic fact set for one PR brief
 * generation — zero LLM calls on this path, by construction (nothing here
 * touches `LlmResolver`). Every read is over already-persisted or
 * already-computed data (Q1/Q2): `RepoIntelPort.getBlastRadius` (a
 * deterministic index read, including 2-hop-only impacts per D15), the
 * persisted `pr_files` rows + a local hunk-header scan (never a diff
 * re-fetch or re-parse), the PR's cached `intent_*` columns (never
 * `intentService.resolve`), and a best-effort linked-issue/spec read.
 */

export interface BriefFileFact {
  path: string;
  additions: number;
  deletions: number;
  hunks: HunkRange[];
}

export interface BriefCallerFact {
  file: string;
  symbol: string;
  viaSymbol: string;
  line: number;
  rank: number;
}

export interface BriefChangedSymbolFact {
  file: string;
  name: string;
  kind: string;
}

export interface BriefIntentFact {
  available: boolean;
  summary?: string;
  inScope?: string[];
  outOfScope?: string[];
  contextGaps?: string[];
  signals?: string[];
  resolvedAt: Date | null;
}

export interface BriefIssueFact {
  available: boolean;
  number?: number;
  title?: string;
  body?: string | null;
}

export interface BriefSpecFact {
  available: boolean;
  path?: string;
  content?: string;
}

export interface BriefBlastFact {
  changedSymbols: BriefChangedSymbolFact[];
  /** Rank-ordered descending — the order the drop loop's "top 20" trims. */
  callers: BriefCallerFact[];
  /** Flat union, including 2-hop-only impacts (Q1/D15). */
  impactedEndpoints: string[];
  /** The ONLY place crons live — union of every `factsByFile[*].crons`. */
  crons: string[];
  degraded: boolean;
  reason?: string;
  indexStatus: string;
  indexReason?: string;
  indexSha: string;
  indexerVersion: number;
}

export interface BriefFactSet {
  pr: {
    number: number;
    title: string;
    body: string | null;
    headSha: string;
    base: string;
    additions: number;
    deletions: number;
    filesCount: number;
  };
  intent: BriefIntentFact;
  issue: BriefIssueFact;
  spec: BriefSpecFact;
  /** Every changed file, in `pr_files` order — the payload's drop loop trims
   *  what's RENDERED, never this underlying set (grounding needs the full
   *  changed-file set, AC-19). */
  files: BriefFileFact[];
  blast: BriefBlastFact;
  // --- Grounding reference sets (§5), derived from the fact set above ------
  changedFiles: Set<string>;
  blastFiles: Set<string>;
  knownEndpoints: Set<string>;
  knownCrons: Set<string>;
  knownSymbols: Set<string>;
}

export interface AssembleFactsInput {
  pull: BriefPullRow;
  repo: BriefRepoRow;
  files: BriefPrFileRow[];
  repoIntel: RepoIntelPort;
  github: GithubResolver;
  readSpec: CloneReader;
}

export async function assembleFacts(input: AssembleFactsInput): Promise<BriefFactSet> {
  const { pull, repo, files, repoIntel, github, readSpec } = input;

  const refText = `${pull.title}\n${pull.body ?? ''}`;
  const issueNumber = parseIssueNumber(refText);
  const specPath = parseSpecRef(refText);
  const paths = files.map((f) => f.path);

  const [blastResult, indexState, issue, specContent] = await Promise.all([
    repoIntel.getBlastRadius(repo.id, paths),
    repoIntel.getIndexState(repo.id),
    tryResolveIssue(github, issueNumber, repo),
    trySpec(readSpec, specPath, repo.clonePath),
  ]);

  const fileFacts: BriefFileFact[] = files.map((f) => ({
    path: f.path,
    additions: f.additions,
    deletions: f.deletions,
    hunks: hunkRangesFor(f.patch),
  }));

  const blast = deriveBlastFact(blastResult, indexState);

  const changedFiles = new Set(paths);
  const blastFiles = new Set<string>();
  for (const c of blast.callers) blastFiles.add(c.file);
  for (const s of blast.changedSymbols) blastFiles.add(s.file);
  if (blastResult.factsByFile) for (const k of Object.keys(blastResult.factsByFile)) blastFiles.add(k);

  const knownSymbols = new Set<string>();
  for (const s of blast.changedSymbols) knownSymbols.add(s.name);
  for (const c of blast.callers) {
    knownSymbols.add(c.symbol);
    knownSymbols.add(c.viaSymbol);
  }

  return {
    pr: {
      number: pull.number,
      title: pull.title,
      body: pull.body,
      headSha: pull.headSha,
      base: pull.base,
      additions: pull.additions,
      deletions: pull.deletions,
      filesCount: pull.filesCount,
    },
    intent: deriveIntentFact(pull),
    issue: issue
      ? { available: true, number: issue.number, title: issue.title, body: clampIssueBody(issue.body) }
      : { available: false },
    spec:
      specContent != null && specPath != null
        ? { available: true, path: specPath, content: specContent }
        : { available: false, ...(specPath != null ? { path: specPath } : {}) },
    files: fileFacts,
    blast,
    changedFiles,
    blastFiles,
    knownEndpoints: new Set(blast.impactedEndpoints),
    knownCrons: new Set(blast.crons),
    knownSymbols,
  };
}

function deriveIntentFact(pull: BriefPullRow): BriefIntentFact {
  // AC-3: read-only pass-through of the cached columns — never
  // `intentService.resolve`, which would both cross a module boundary and
  // change `intent_resolved_at` as a side effect of a GET/generate call.
  if (pull.intentSummary == null && pull.intentResolvedAt == null) {
    return { available: false, resolvedAt: null };
  }
  return {
    available: true,
    ...(pull.intentSummary != null ? { summary: pull.intentSummary } : {}),
    ...(pull.intentInScope != null ? { inScope: pull.intentInScope } : {}),
    ...(pull.intentOutOfScope != null ? { outOfScope: pull.intentOutOfScope } : {}),
    ...(pull.intentContextGaps != null ? { contextGaps: pull.intentContextGaps } : {}),
    ...(pull.intentSignals != null ? { signals: pull.intentSignals } : {}),
    resolvedAt: pull.intentResolvedAt,
  };
}

function deriveBlastFact(blast: RepoIntelBlastResult, state: { status: string; reason?: string; lastIndexedSha: string; indexerVersion: number }): BriefBlastFact {
  const crons = new Set<string>();
  for (const f of Object.values(blast.factsByFile ?? {})) {
    for (const c of f.crons) crons.add(c);
  }
  // Rank-ordered descending — the order `prompts.ts`'s drop loop trims
  // FROM when over budget; `FACT_POOL_SAFETY_MAX` is a defensive ceiling
  // only (well above the drop loop's real target of 20), never the loop's
  // own clamp.
  const callers = [...blast.callers].sort((a, b) => b.rank - a.rank).slice(0, FACT_POOL_SAFETY_MAX);
  return {
    changedSymbols: blast.changedSymbols.slice(0, FACT_SYMBOLS_MAX),
    callers,
    impactedEndpoints: blast.impactedEndpoints.slice(0, FACT_POOL_SAFETY_MAX),
    crons: [...crons],
    degraded: blast.degraded ?? false,
    ...(blast.reason ? { reason: blast.reason } : {}),
    indexStatus: state.status,
    ...(state.reason ? { indexReason: state.reason } : {}),
    indexSha: state.lastIndexedSha,
    indexerVersion: state.indexerVersion,
  };
}

function clampIssueBody(body: string | null | undefined): string | null {
  if (body == null) return null;
  return body.length > MAX_ISSUE_BODY_CHARS ? `${body.slice(0, MAX_ISSUE_BODY_CHARS)}…` : body;
}

async function tryResolveIssue(
  github: GithubResolver,
  n: number | null,
  repo: BriefRepoRow,
): Promise<{ number: number; title: string; body?: string | null } | null> {
  if (n == null) return null;
  try {
    const gh = await github();
    return await gh.getIssue({ owner: repo.owner, name: repo.name }, n);
  } catch {
    return null;
  }
}

async function trySpec(readSpec: CloneReader, path: string | null, clonePath: string | null): Promise<string | null> {
  if (path == null || clonePath == null) return null;
  return readSpec(clonePath, path).catch(() => null);
}
