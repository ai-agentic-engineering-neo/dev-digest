import type { FastifyBaseLogger } from 'fastify';
import type { Container } from '../../platform/container.js';
import { CONVENTIONS_FEATURE } from './constants.js';
import { ConventionsRepository } from './repository.js';
import { ConventionsService } from './service.js';
import type { ConventionAgentsPort, ConventionSkillsPort } from './types.js';

/**
 * Composition for the conventions module: turns the Container into the narrow
 * ports `ConventionsService` declares (see types.ts). The service itself never
 * sees the Container; this file is the only place that knows how each port is
 * satisfied.
 */
export function buildConventionsService(
  container: Container,
  log: FastifyBaseLogger,
): ConventionsService {
  const skills: ConventionSkillsPort = {
    // Skill names are unique per workspace in practice; the store has no by-name
    // lookup, so scan the (small) workspace list.
    findByName: async (workspaceId, name) =>
      (await container.skillsRepo.list(workspaceId)).find((s) => s.name === name),
    create: (workspaceId, input) => container.skillsService.create(workspaceId, input),
    update: (workspaceId, id, patch) => container.skillsService.update(workspaceId, id, patch),
  };

  const agents: ConventionAgentsPort = {
    // Additive: never `setSkills`, which replaces the agent's whole skill set.
    linkSkill: async (workspaceId, agentId, skillId) => {
      const agent = await container.agentsRepo.getById(workspaceId, agentId);
      if (!agent) return false;
      const links = await container.agentsRepo.linkedSkills(agentId);
      if (!links.some((l) => l.skill.id === skillId)) {
        await container.agentsRepo.linkSkill(agentId, skillId, links.length);
      }
      return true;
    },
  };

  return new ConventionsService({
    store: new ConventionsRepository(container.db),
    git: container.git,
    repoIntel: container.repoIntel,
    llm: (provider) => container.llm(provider),
    resolveModel: (workspaceId) => container.resolveFeatureModel(workspaceId, CONVENTIONS_FEATURE),
    skills,
    agents,
    log,
  });
}
