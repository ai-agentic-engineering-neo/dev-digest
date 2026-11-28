import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  Agent,
  AgentSkillLink,
  AgentVersion,
  CiFailOn,
  ModelInfo,
  Provider,
  ReviewStrategy,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams, OkResponse } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { AgentsService } from './service.js';

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
 *   POST   /agents/:id/skills       → replace the links {skills} OR link one {skill_id}
 *   GET    /agents/:id/models       → dynamic model list for the agent's provider
 *   GET    /providers/:id/models    → dynamic model list for a provider (editor)
 */

const CreateAgentBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  provider: Provider,
  model: z.string().min(1),
  system_prompt: z.string().min(1),
  output_schema: z.unknown().optional(),
  strategy: ReviewStrategy.optional(),
  ci_fail_on: CiFailOn.optional(),
  repo_intel: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

const UpdateAgentBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  provider: Provider.optional(),
  model: z.string().min(1).optional(),
  system_prompt: z.string().min(1).optional(),
  output_schema: z.unknown().optional(),
  strategy: ReviewStrategy.optional(),
  ci_fail_on: CiFailOn.optional(),
  repo_intel: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

/**
 * Either replace the whole ordered set (`skills`, order = index) or link one
 * skill (`skill_id`, upsert; `enabled` defaults to true).
 */
const SetSkillsBody = z.union([
  z.object({
    skills: z.array(z.object({ skill_id: z.string().uuid(), enabled: z.boolean() })),
  }),
  z.object({
    skill_id: z.string().uuid(),
    order: z.number().int().nonnegative().optional(),
    enabled: z.boolean().optional(),
  }),
]);

export default async function agentsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new AgentsService({
    agents: app.container.agentsRepo,
    models: (provider) => app.container.llm(provider),
    skills: app.container.skillsRepo,
  });

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

  app.post('/agents', { schema: { body: CreateAgentBody, response: { 201: Agent } } }, async (req, reply) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    const body = req.body;
    const agent = await service.create(
      workspaceId,
      {
        name: body.name,
        provider: body.provider,
        model: body.model,
        system_prompt: body.system_prompt,
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.output_schema !== undefined ? { output_schema: body.output_schema } : {}),
        ...(body.strategy !== undefined ? { strategy: body.strategy } : {}),
        ...(body.ci_fail_on !== undefined ? { ci_fail_on: body.ci_fail_on } : {}),
        ...(body.repo_intel !== undefined ? { repo_intel: body.repo_intel } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      },
      userId,
    );
    reply.status(201);
    return agent;
  });

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

  app.delete('/agents/:id', { schema: { params: IdParams, response: { 200: OkResponse } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Agent not found');
    return { ok: true };
  });

  app.get(
    '/agents/:id/versions',
    { schema: { params: IdParams, response: { 200: z.array(AgentVersion) } } },
    async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Agent not found');
    return versions;
  });

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
    const links = await service.skillLinks(workspaceId, req.params.id);
    if (!links) throw new NotFoundError('Agent not found');
    return links;
  });

  app.post(
    '/agents/:id/skills',
    { schema: { params: IdParams, body: SetSkillsBody, response: { 200: z.array(AgentSkillLink) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const links = await service.updateLinks(workspaceId, req.params.id, req.body);
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
  });

  app.get(
    '/providers/:id/models',
    { schema: { params: ProviderParams, response: { 200: z.array(ModelInfo) } } },
    async (req) => {
    await getContext(app.container, req);
    return service.listModels(req.params.id);
  });
}
