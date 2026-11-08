import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { DEVDIGEST_SAVE_BODY_LIMIT, DEVDIGEST_UPLOAD_BODY_LIMIT } from './constants.js';
import {
  AgentContextDocsQuery,
  AgentContextDocsSchema,
  ContextDocContentSchema,
  ContextDocListSchema,
  ContextDocQuery,
  CopyDevdigestDocBody,
  CreateDevdigestDocBody,
  DevdigestCopyResultSchema,
  DevdigestDeleteResultSchema,
  DevdigestDocListSchema,
  DevdigestDocSchema,
  IdParams,
  RepoIdParams,
  SaveDevdigestDocBody,
  SetAgentContextDocsBody,
  UploadDevdigestDocBody,
} from './schemas.js';

/**
 * Context module — Project Context Folder (SPEC-01) + DevDigest-owned docs (SPEC-03).
 *   GET/POST /repos/:id/devdigest-docs, POST .../uploads, POST .../copies  → list / create / upload / copy
 *   GET/PUT/DELETE /devdigest-docs/:id                                      → read / save / delete (+ detach)
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

  // ---------- DevDigest-owned docs (SPEC-03) ----------

  app.get(
    '/repos/:id/devdigest-docs',
    { schema: { params: RepoIdParams, response: { 200: DevdigestDocListSchema } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service().listDevdigestDocs(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/devdigest-docs',
    { schema: { params: RepoIdParams, body: CreateDevdigestDocBody, response: { 201: DevdigestDocSchema } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const doc = await service().createDevdigestDoc(workspaceId, req.params.id, req.body.folder, req.body.name);
      reply.status(201);
      return doc;
    },
  );

  app.post(
    '/repos/:id/devdigest-docs/uploads',
    {
      bodyLimit: DEVDIGEST_UPLOAD_BODY_LIMIT,
      schema: {
        params: RepoIdParams,
        body: UploadDevdigestDocBody,
        response: { 200: DevdigestDocSchema, 201: DevdigestDocSchema },
      },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const { created, doc } = await service().uploadDevdigestDoc(workspaceId, req.params.id, req.body);
      reply.status(created ? 201 : 200);
      return doc;
    },
  );

  app.post(
    '/repos/:id/devdigest-docs/copies',
    {
      schema: {
        params: RepoIdParams,
        body: CopyDevdigestDocBody,
        response: { 200: DevdigestCopyResultSchema, 201: DevdigestCopyResultSchema },
      },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service().copyRepoDoc(workspaceId, req.params.id, req.body.source_path);
      reply.status(result.created ? 201 : 200);
      return result;
    },
  );

  app.get(
    '/devdigest-docs/:id',
    { schema: { params: IdParams, response: { 200: DevdigestDocSchema } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service().getDevdigestDoc(workspaceId, req.params.id);
    },
  );

  app.put(
    '/devdigest-docs/:id',
    {
      bodyLimit: DEVDIGEST_SAVE_BODY_LIMIT,
      schema: { params: IdParams, body: SaveDevdigestDocBody, response: { 200: DevdigestDocSchema } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service().saveDevdigestDoc(workspaceId, req.params.id, req.body.content);
    },
  );

  app.delete(
    '/devdigest-docs/:id',
    { schema: { params: IdParams, response: { 200: DevdigestDeleteResultSchema } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service().deleteDevdigestDoc(workspaceId, req.params.id);
    },
  );
}
