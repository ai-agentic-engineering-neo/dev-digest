import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  Agent,
  AgentSkillLink,
  AgentVersion,
  CreateAgentInput,
  ModelInfo,
  Provider,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

/** `/providers/:id` addresses a provider by name, not a uuid. */
const ProviderParams = z.object({ id: Provider });

/** `/agents/:id/versions/:version` — id is a uuid, version a positive integer. */
const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

/**
 * A2 — agents module (owner A2).
 *   GET    /agents                  → list (workspace-scoped)
 *   GET    /agents/:id              → one agent
 *   POST   /agents                  → create
 *   PUT    /agents/:id              → update / toggle enabled (versions config)
 *   GET    /agents/:id/versions     → config history (newest first)
 *   GET    /agents/:id/versions/:version → one config snapshot
 *   GET    /agents/:id/skills       → linked skills (ordered)
 *   POST   /agents/:id/skills       → set/reorder linked skills OR link one
 *   GET    /agents/:id/models       → dynamic model list for the agent's provider
 *   GET    /providers/:id/models    → dynamic model list for a provider (editor)
 */

/** PUT body: every create field optional (same rules as POST). */
const UpdateAgentBody = CreateAgentInput.partial();

/** Either set the whole ordered set (`skill_ids`) or link one (`skill_id`). */
const SetSkillsBody = z
  .object({
    skill_ids: z.array(z.string().uuid()).optional(),
    skill_id: z.string().uuid().optional(),
    order: z.number().int().optional(),
  })
  .refine((b) => b.skill_ids !== undefined || b.skill_id !== undefined, {
    message: 'Provide skill_ids (set/reorder) or skill_id (link one)',
  });

export default async function agentsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.modules.agents.service;

  app.get('/agents', { schema: { response: { 200: z.array(Agent) } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/agents/:id', { schema: { params: IdParams, response: { 200: Agent } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const agent = await service.get(workspaceId, req.params.id);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  });

  app.post(
    '/agents',
    { schema: { body: CreateAgentInput, response: { 201: Agent } } },
    async (req, reply) => {
      const { workspaceId, userId } = await getContext(app.container, req);
      const agent = await service.create(workspaceId, req.body, userId);
      reply.status(201);
      return agent;
    },
  );

  app.put(
    '/agents/:id',
    { schema: { params: IdParams, body: UpdateAgentBody, response: { 200: Agent } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const agent = await service.update(workspaceId, req.params.id, req.body);
      if (!agent) throw new NotFoundError('Agent not found');
      return agent;
    },
  );

  app.delete(
    '/agents/:id',
    { schema: { params: IdParams, response: { 200: z.object({ ok: z.literal(true) }) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const ok = await service.delete(workspaceId, req.params.id);
      if (!ok) throw new NotFoundError('Agent not found');
      return { ok: true as const };
    },
  );

  app.get(
    '/agents/:id/versions',
    { schema: { params: IdParams, response: { 200: z.array(AgentVersion) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const versions = await service.listVersions(workspaceId, req.params.id);
      if (!versions) throw new NotFoundError('Agent not found');
      return versions;
    },
  );

  app.get(
    '/agents/:id/versions/:version',
    { schema: { params: VersionParams, response: { 200: AgentVersion } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const version = await service.getVersion(workspaceId, req.params.id, req.params.version);
      if (!version) throw new NotFoundError('Agent version not found');
      return version;
    },
  );

  app.get(
    '/agents/:id/skills',
    { schema: { params: IdParams, response: { 200: z.array(AgentSkillLink) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const agent = await service.get(workspaceId, req.params.id);
      if (!agent) throw new NotFoundError('Agent not found');
      return service.skillLinks(req.params.id);
    },
  );

  app.post(
    '/agents/:id/skills',
    { schema: { params: IdParams, body: SetSkillsBody, response: { 200: z.array(AgentSkillLink) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const body = req.body;
      const links =
        body.skill_ids !== undefined
          ? await service.setSkills(workspaceId, req.params.id, body.skill_ids)
          : await service.linkSkill(workspaceId, req.params.id, body.skill_id!, body.order);
      if (!links) throw new NotFoundError('Agent not found');
      return links;
    },
  );

  app.get(
    '/agents/:id/models',
    { schema: { params: IdParams, response: { 200: z.array(ModelInfo) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const agent = await service.get(workspaceId, req.params.id);
      if (!agent) throw new NotFoundError('Agent not found');
      return service.listModels(agent.provider);
    },
  );

  app.get(
    '/providers/:id/models',
    { schema: { params: ProviderParams, response: { 200: z.array(ModelInfo) } } },
    async (req) => {
      await getContext(app.container, req);
      return service.listModels(req.params.id);
    },
  );
}
