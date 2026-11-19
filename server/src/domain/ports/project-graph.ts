/**
 * Port — read side of the project dependency graph (specs/18, plan 19 P4-A).
 *
 * Implemented by `modules/repo-intel/graph-read.service.ts`; the `graph` HTTP
 * module codes against this interface only (modules never import each other).
 * Reads are side-effect free: they never enqueue or write anything.
 *
 * Unknown directory / file ⇒ the implementation throws `NotFoundError` (404,
 * AC-54). A repo with no usable index returns an explicit `empty` /
 * `reindexing` state instead of data.
 */
import type {
  ProjectGraph,
  ProjectGraphFileSort,
  ProjectGraphFiles,
  ProjectGraphSymbols,
  ProjectGraphUnresolved,
} from '../../vendor/shared/index.js';

export interface ProjectGraphQuery {
  /** Repo-relative, already normalised/validated directory ('' = root). */
  dir?: string;
  /** Repo-relative, already normalised/validated file path. */
  file?: string;
  /** Overview depth override (>= 1). */
  depth?: number;
  /** Symbol page (file focus only), 1-based. */
  page?: number;
}

export interface ProjectGraphFilesQuery {
  dir?: string;
  page: number;
  pageSize: number;
  sort: ProjectGraphFileSort;
}

export interface ProjectGraphUnresolvedQuery {
  page: number;
  pageSize: number;
}

export interface ProjectGraphSymbolsQuery {
  file: string;
  page: number;
}

export interface ProjectGraphReader {
  getGraph(repoId: string, query: ProjectGraphQuery): Promise<ProjectGraph>;
  listFiles(repoId: string, query: ProjectGraphFilesQuery): Promise<ProjectGraphFiles>;
  listUnresolved(repoId: string, query: ProjectGraphUnresolvedQuery): Promise<ProjectGraphUnresolved>;
  listSymbols(repoId: string, query: ProjectGraphSymbolsQuery): Promise<ProjectGraphSymbols>;
}
