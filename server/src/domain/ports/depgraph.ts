/** Port — source of truth is server/src/domain/ports (SPEC-16). */
export interface FileEdge {
  from: string;
  to: string;
}

export interface DepGraph {
  /**
   * Resolve the local import edges among `files` (repo-relative) under `root`.
   * Never throws — returns `[]` on any cruise failure.
   */
  buildEdges(root: string, files: string[]): Promise<FileEdge[]>;
}
