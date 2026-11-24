import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { RequestContext } from '../../_shared/context.js';
import { IdParams } from '../../_shared/schemas.js';
import type { AgentsService } from '../application/agents.service.js';
import {
  presentAgent,
  presentAgentVersion,
  presentSkillLinks,
  toAgentPatch,
  toNewAgent,
} from './presenter.js';
import {
  CreateAgentBody,
  ProviderParams,
  SetSkillsBody,
  UpdateAgentBody,
  VersionParams,
} from './schemas.js';

export interface AgentsRouteDeps {
  service: AgentsService;
  context: (req: FastifyRequest) => Promise<RequestContext>;
}

/**
 * A2 — agents routes. Each handler: parsed input → context → one use case →
 * presenter. Missing agents surface as AgentNotFound (→ 404 in app.ts).
 *   GET    /agents                  → list (workspace-scoped)
 *   GET    /agents/:id              → one agent
 *   POST   /agents                  → create (201)
 *   PUT    /agents/:id              → update / toggle enabled (versions config)
 *   DELETE /agents/:id              → delete
 *   GET    /agents/:id/versions     → config history (newest first)
 *   GET    /agents/:id/versions/:version → one config snapshot
 *   GET    /agents/:id/skills       → linked skills (ordered)
 *   POST   /agents/:id/skills       → set/reorder linked skills OR link one
 *   GET    /agents/:id/models       → dynamic model list for the agent's provider
 *   GET    /providers/:id/models    → dynamic model list for a provider (editor)
 */
export async function registerAgentsRoutes(
  appBase: FastifyInstance,
  { service, context }: AgentsRouteDeps,
): Promise<void> {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.get('/agents', async (req) => {
    const { workspaceId } = await context(req);
    return (await service.list(workspaceId)).map(presentAgent);
  });

  app.get('/agents/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await context(req);
    return presentAgent(await service.get(workspaceId, req.params.id));
  });

  app.post('/agents', { schema: { body: CreateAgentBody } }, async (req, reply) => {
    const ctx = await context(req);
    const agent = await service.create(toNewAgent(req.body, ctx));
    reply.status(201);
    return presentAgent(agent);
  });

  app.put('/agents/:id', { schema: { params: IdParams, body: UpdateAgentBody } }, async (req) => {
    const { workspaceId } = await context(req);
    return presentAgent(await service.update(workspaceId, req.params.id, toAgentPatch(req.body)));
  });

  app.delete('/agents/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await context(req);
    await service.delete(workspaceId, req.params.id);
    return { ok: true };
  });

  app.get('/agents/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await context(req);
    return (await service.listVersions(workspaceId, req.params.id)).map(presentAgentVersion);
  });

  app.get('/agents/:id/versions/:version', { schema: { params: VersionParams } }, async (req) => {
    const { workspaceId } = await context(req);
    return presentAgentVersion(
      await service.getVersion(workspaceId, req.params.id, req.params.version),
    );
  });

  app.get('/agents/:id/skills', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await context(req);
    return presentSkillLinks(req.params.id, await service.skillLinks(workspaceId, req.params.id));
  });

  app.post(
    '/agents/:id/skills',
    { schema: { params: IdParams, body: SetSkillsBody } },
    async (req) => {
      const { workspaceId } = await context(req);
      const { skill_ids, skill_id, order } = req.body;
      const links =
        skill_ids !== undefined
          ? await service.setSkills(workspaceId, req.params.id, skill_ids)
          : await service.linkSkill(workspaceId, req.params.id, skill_id!, order);
      return presentSkillLinks(req.params.id, links);
    },
  );

  app.get('/agents/:id/models', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await context(req);
    return service.listModelsForAgent(workspaceId, req.params.id);
  });

  app.get('/providers/:id/models', { schema: { params: ProviderParams } }, async (req) => {
    await context(req);
    return service.listModels(req.params.id);
  });
}
