import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { GraphService } from './service.js';
import { GraphFilesQuery, GraphQuery, GraphSymbolsQuery, GraphUnresolvedQuery } from './schemas.js';

/**
 * graph module — specs/18-dependency-graph.md (project graph, P4-A).
 *   GET /repos/:id/graph             level-of-detail graph + cycles + hot files
 *   GET /repos/:id/graph/files       non-visual file table
 *   GET /repos/:id/graph/unresolved  unresolved import specifiers (paged)
 *   GET /repos/:id/graph/symbols     symbols of one file (paged)
 * All reads are side-effect free; unknown dir/file => 404.
 */
export default async function graphRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new GraphService(container.projectGraph);

  app.get(
    '/repos/:id/graph',
    { schema: { params: IdParams, querystring: GraphQuery } },
    async (req) => {
      await getContext(container, req);
      return service.getGraph(req.params.id, req.query);
    },
  );

  app.get(
    '/repos/:id/graph/files',
    { schema: { params: IdParams, querystring: GraphFilesQuery } },
    async (req) => {
      await getContext(container, req);
      return service.listFiles(req.params.id, req.query);
    },
  );

  app.get(
    '/repos/:id/graph/unresolved',
    { schema: { params: IdParams, querystring: GraphUnresolvedQuery } },
    async (req) => {
      await getContext(container, req);
      return service.listUnresolved(req.params.id, req.query);
    },
  );

  app.get(
    '/repos/:id/graph/symbols',
    { schema: { params: IdParams, querystring: GraphSymbolsQuery } },
    async (req) => {
      await getContext(container, req);
      return service.listSymbols(req.params.id, req.query);
    },
  );
}
