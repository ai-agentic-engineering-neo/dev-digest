import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import {
  AgentContextDocsQuery,
  AgentContextDocsSchema,
  ContextDocContentSchema,
  ContextDocListSchema,
  ContextDocQuery,
  RepoIdParams,
  SetAgentContextDocsBody,
} from './schemas.js';

/**
 * Context module — Project Context Folder (SPEC-01).
 *   GET /repos/:id/context-docs                  → the repo's markdown docs at the last synced commit
 *   GET /repos/:id/context-docs/content?path=    → one discovered doc with its content
 *   GET /agents/:id/context-docs?repo_id=        → docs the agent reads for that repo, in order
 *   PUT /agents/:id/context-docs {repo_id,paths} → replace that ordered list
 * Every route resolves the workspace first; the service 404s for an agent or repo outside it.
 * Doc-shape rules for `paths` (doc paths, no duplicates) live in the service, not in route Zod.
 */
export default async function contextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = () => app.container.projectContext;

  app.get(
    '/repos/:id/context-docs',
    { schema: { params: RepoIdParams, response: { 200: ContextDocListSchema } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service().listDocs(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/context-docs/content',
    { schema: { params: RepoIdParams, querystring: ContextDocQuery, response: { 200: ContextDocContentSchema } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service().getDoc(workspaceId, req.params.id, req.query.path);
    },
  );

  app.get(
    '/agents/:id/context-docs',
    { schema: { params: RepoIdParams, querystring: AgentContextDocsQuery, response: { 200: AgentContextDocsSchema } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service().getAgentDocs(workspaceId, req.params.id, req.query.repo_id);
    },
  );

  app.put(
    '/agents/:id/context-docs',
    { schema: { params: RepoIdParams, body: SetAgentContextDocsBody, response: { 200: AgentContextDocsSchema } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service().setAgentDocs(workspaceId, req.params.id, req.body.repo_id, req.body.paths);
    },
  );
}
