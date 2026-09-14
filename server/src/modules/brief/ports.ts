import type { FeatureModelChoice, GitHubClient, LLMProvider, Provider as ProviderId } from '@devdigest/shared';
import type { Tokenizer } from '../../adapters/tokenizer/index.js';

/**
 * Narrow local ports (`server/LEARNINGS.md`'s local-port rule) — this module
 * codes against these, never against another module's real class. No import
 * from `modules/repo-intel/**`, `modules/reviews/**`, `modules/pulls/**` or
 * `modules/intent/**` anywhere in this file (`no-cross-module`, including
 * `import type`); `RepoIntelService` satisfies `RepoIntelPort` structurally
 * when wired at `routes.ts` (plans/11-why-risk-brief.md Q1).
 */

/** Shapes copied from `repo-intel/types.ts`'s `BlastCallerRow`/`BlastResult`,
 *  NOT imported from it — see `server/LEARNINGS.md:236-250`. */
export interface RepoIntelBlastChangedSymbol {
  file: string;
  name: string;
  kind: string;
}

export interface RepoIntelBlastCallerRow {
  file: string;
  symbol: string;
  /** Which changed symbol this caller reaches. */
  viaSymbol: string;
  line: number;
  /** file_rank.rank of the caller file (0 in the degraded/ripgrep path). */
  rank: number;
}

export interface RepoIntelBlastResult {
  changedSymbols: RepoIntelBlastChangedSymbol[];
  callers: RepoIntelBlastCallerRow[];
  /** "METHOD /path" — flat union, including 2-hop-only impacts (Q1/D15). */
  impactedEndpoints: string[];
  /** Per-caller-file facts, keyed by file — the ONLY place crons live. */
  factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
  degraded?: boolean;
  reason?: string;
}

export interface RepoIntelIndexState {
  status: string;
  reason?: string;
  lastIndexedSha: string;
  indexerVersion: number;
  updatedAt: Date;
  degraded?: boolean;
}

export interface RepoIntelPort {
  getBlastRadius(repoId: string, changedFiles: string[]): Promise<RepoIntelBlastResult>;
  getIndexState(repoId: string): Promise<RepoIntelIndexState>;
}

/** The workspace's chosen provider+model for the `risk_brief` feature. */
export type FeatureModelResolver = (
  workspaceId: string,
  id: 'risk_brief',
) => Promise<FeatureModelChoice>;

/** Resolve an LLM provider by id — the container supplies its own cached,
 *  secret-backed resolver at the composition root. */
export type LlmResolver = (id: ProviderId) => Promise<LLMProvider>;

/** Best-effort GitHub client resolver — mirrors `intent/service.ts`'s
 *  `GithubResolver`. */
export type GithubResolver = () => Promise<GitHubClient>;

/** Read one file out of a repo's checkout, containment-checked (finding 5:
 *  via `resolveContainedPath`, unlike `intent/clone.ts`'s bare `readClone`).
 *  `null` on any failure — missing file, containment refusal, unreadable. */
export type CloneReader = (clonePath: string, path: string) => Promise<string | null>;

export type { Tokenizer };
