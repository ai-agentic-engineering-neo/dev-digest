/**
 * Dependencies of the repo-intel module, injected through constructors /
 * function parameters instead of the DI `Container` (SPEC-16, AC-7/AC-8).
 *
 * Leaf file on purpose: it imports ONLY `domain/ports/*`, so `service.ts` and
 * `pipeline/*` can both depend on it without creating an import cycle.
 */
import type { CodeIndex } from '../../domain/ports/code-index.js';
import type { DepGraph } from '../../domain/ports/depgraph.js';
import type { GitClient } from '../../domain/ports/git.js';
import type { Tokenizer } from '../../domain/ports/tokenizer.js';

/**
 * Structural job registry — the real `JobRunner` satisfies it, but the module
 * does not import `platform/`.
 */
export interface JobRegistry {
  register(kind: string, handler: (payload: unknown) => Promise<void>): void;
}

export interface RepoIntelDeps {
  git: GitClient;
  codeIndex: CodeIndex;
  jobs: JobRegistry;
  depgraph: DepGraph;
  tokenizer: Tokenizer;
  repoIntelEnabled: boolean;
}

/** What the index pipelines (full / incremental) need. */
export type PipelineDeps = Pick<RepoIntelDeps, 'git' | 'depgraph' | 'tokenizer'>;
