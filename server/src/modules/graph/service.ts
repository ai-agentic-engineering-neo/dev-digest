import type {
  ProjectGraph,
  ProjectGraphFiles,
  ProjectGraphSymbols,
  ProjectGraphUnresolved,
} from '@devdigest/shared';
import type { ProjectGraphReader } from '../../domain/ports/project-graph.js';
import type {
  GraphFilesQuery,
  GraphQuery,
  GraphSymbolsQuery,
  GraphUnresolvedQuery,
} from './schemas.js';

/**
 * Thin application service for the project-graph HTTP module: maps the
 * validated wire query (snake_case) onto the `ProjectGraphReader` port. The
 * module never imports repo-intel — the reader is injected (composition root).
 */
export class GraphService {
  constructor(private readonly reader: ProjectGraphReader) {}

  getGraph(repoId: string, q: GraphQuery): Promise<ProjectGraph> {
    return this.reader.getGraph(repoId, { dir: q.dir, file: q.file, depth: q.depth, page: q.page });
  }

  listFiles(repoId: string, q: GraphFilesQuery): Promise<ProjectGraphFiles> {
    return this.reader.listFiles(repoId, {
      dir: q.dir,
      page: q.page,
      pageSize: q.page_size,
      sort: q.sort,
    });
  }

  listUnresolved(repoId: string, q: GraphUnresolvedQuery): Promise<ProjectGraphUnresolved> {
    return this.reader.listUnresolved(repoId, { page: q.page, pageSize: q.page_size });
  }

  listSymbols(repoId: string, q: GraphSymbolsQuery): Promise<ProjectGraphSymbols> {
    return this.reader.listSymbols(repoId, { file: q.file, page: q.page });
  }
}
