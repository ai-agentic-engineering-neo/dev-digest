import type { Container } from '../../platform/container.js';
import type { JobHandlers } from '../../platform/jobs.js';
import { ConventionsService } from './application/conventions-service.js';
import type { ExtractJobPayload } from './application/ports.js';
import { EXTRACT_JOB_KIND } from './domain/constants.js';
import { cloneFiles } from './infrastructure/clone-files.js';
import { LlmConventionModel } from './infrastructure/llm-model.js';
import { ConventionsRepository } from './infrastructure/repository.js';

/**
 * Composition root of the conventions module (lazy: `Container.modules.conventions`).
 * Other modules are reached only here: repo-intel (ranking), settings (feature
 * model), skills (create) and agents (link). `jobs` run the background scan.
 */
export function buildConventionsModule(c: Container) {
  const repository = new ConventionsRepository(c.db);
  const service = new ConventionsService({
    store: repository,
    repos: repository,
    files: cloneFiles,
    ranker: { getConventionSamples: (repoId, n) => c.repoIntel.getConventionSamples(repoId, n) },
    model: new LlmConventionModel({
      resolveModel: (workspaceId) => c.modules.settings.service.resolveFeatureModel(workspaceId, 'conventions'),
      llm: (provider) => c.llm(provider),
    }),
    queue: {
      enqueue: async (payload) => {
        await c.jobs.enqueue(payload.workspaceId, EXTRACT_JOB_KIND, payload);
      },
    },
    skills: {
      createExtracted: (workspaceId, repoFullName, input) =>
        c.modules.skills.service.createExtracted(workspaceId, repoFullName, input),
    },
    agents: {
      get: (workspaceId, agentId) => c.modules.agents.service.get(workspaceId, agentId),
      linkSkill: (workspaceId, agentId, skillId) =>
        c.modules.agents.service.linkSkill(workspaceId, agentId, skillId),
    },
    clock: () => new Date(),
  });
  const jobs: JobHandlers = {
    [EXTRACT_JOB_KIND]: (payload, { signal }) => service.runScan(payload as ExtractJobPayload, signal),
  };
  return { service, jobs };
}
