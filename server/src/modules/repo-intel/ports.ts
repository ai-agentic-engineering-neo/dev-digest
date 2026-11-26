/**
 * repo-intel — application ports (onion-architecture §5): the interfaces the
 * indexer pipeline consumes, owned here by the consumer. Adapters in
 * src/adapters/{depgraph,tokenizer,astgrep} implement them and import ONLY
 * this file from the module — never its constants, services or repositories.
 *
 * The two scope constants live here (not in constants.ts) because adapters
 * need them; constants.ts re-exports them so module code is unchanged.
 */

/** [T1] Files we parse (diff-scoped in T1; whole walk in T2). */
export const SUPPORTED_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;

/** [T1] Max characters kept from a symbol's signature line. */
export const MAX_SIGNATURE_CHARS = 120;

/** A local import edge between two repo-relative files (importer → imported). */
export interface FileEdge {
  from: string;
  to: string;
}

/** File-level import graph builder (dependency-cruiser in production). */
export interface DepGraph {
  /**
   * Resolve the local import edges among `files` (repo-relative) under `root`.
   * Never throws — returns `[]` on any cruise failure.
   */
  buildEdges(root: string, files: string[]): Promise<FileEdge[]>;
}

/** Token counter for the repo-map budget search. Must never throw. */
export interface Tokenizer {
  count(text: string): number;
}
