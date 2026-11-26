import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AgentSuggestion, CreateSkillInput, UpdateSkillInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SkillsService } from './service.js';
import { DrizzleAgentSuggestionSignals, SkillsRepository } from './repository.js';

/** `/skills/:id/versions/:version`: id is a uuid, version a positive integer. */
const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

/**
 * M2 skills module (SPEC §4.3), all workspace-scoped:
 *   GET    /skills                                → Skill[] (name asc, with agent_count)
 *   GET    /skills/:id                            → Skill
 *   POST   /skills                                → 201 Skill (v1, "Initial version")
 *   PUT    /skills/:id                            → Skill (body change → new version)
 *   DELETE /skills/:id                            → { ok: true }
 *   GET    /skills/:id/agents                     → SkillUsage[]
 *   GET    /skills/:id/stats                      → SkillStats
 *   GET    /skills/:id/agent-suggestions          → AgentSuggestion[] (code-only match, writes nothing)
 *   GET    /skills/:id/versions                   → SkillVersion[] (newest first)
 *   GET    /skills/:id/versions/:version          → SkillVersion
 *   POST   /skills/:id/versions/:version/restore  → Skill (new version; 409 if current)
 */
export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // Module composition root: the service gets its ports explicitly.
  const service = new SkillsService({
    repo: new SkillsRepository(app.container.db),
    signals: new DrizzleAgentSuggestionSignals(app.container.db),
  });

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.get(workspaceId, req.params.id);
  });

  app.post('/skills', { schema: { body: CreateSkillInput } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.update(workspaceId, req.params.id, req.body);
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.delete(workspaceId, req.params.id);
    return { ok: true };
  });

  app.get('/skills/:id/agents', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.agentsUsing(workspaceId, req.params.id);
  });

  app.get('/skills/:id/stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.stats(workspaceId, req.params.id);
  });

  app.get(
    '/skills/:id/agent-suggestions',
    // The contract has no defaults/transforms, so the response schema is exact.
    { schema: { params: IdParams, response: { 200: z.array(AgentSuggestion) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.agentSuggestions(workspaceId, req.params.id);
    },
  );

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listVersions(workspaceId, req.params.id);
  });

  app.get(
    '/skills/:id/versions/:version',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getVersion(workspaceId, req.params.id, req.params.version);
    },
  );

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.restore(workspaceId, req.params.id, req.params.version);
    },
  );
}
