import type {
  Agent as AgentDto,
  AgentSkillLink,
  AgentVersion as AgentVersionDto,
} from '@devdigest/shared';
import type { Agent, AgentPatch, AgentVersion, NewAgent, SkillLink } from '../domain/types.js';
import type { CreateAgentBody, UpdateAgentBody } from './schemas.js';

/** Domain → API contract (snake_case). Shapes match the pre-onion DTOs exactly. */
export function presentAgent(a: Agent): AgentDto {
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    provider: a.provider,
    model: a.model,
    system_prompt: a.systemPrompt,
    output_schema: a.outputSchema ?? null,
    enabled: a.enabled,
    version: a.version,
    strategy: a.strategy,
    ci_fail_on: a.ciFailOn,
    repo_intel: a.repoIntel,
  };
}

export function presentAgentVersion(v: AgentVersion): AgentVersionDto {
  const c = v.config;
  return {
    agent_id: v.agentId,
    version: v.version,
    config: {
      provider: c.provider,
      model: c.model,
      system_prompt: c.systemPrompt,
      ...('outputSchema' in c ? { output_schema: c.outputSchema } : {}),
      strategy: c.strategy,
      ci_fail_on: c.ciFailOn,
      repo_intel: c.repoIntel,
      skills: c.skills,
    },
    created_at: v.createdAt.toISOString(),
  };
}

export function presentSkillLinks(agentId: string, links: SkillLink[]): AgentSkillLink[] {
  return links.map((l) => ({ agent_id: agentId, skill_id: l.skillId, order: l.order }));
}

/** Request body → domain command. */
export function toNewAgent(
  body: CreateAgentBody,
  ctx: { workspaceId: string; userId: string },
): NewAgent {
  return {
    workspaceId: ctx.workspaceId,
    name: body.name,
    description: body.description,
    provider: body.provider,
    model: body.model,
    systemPrompt: body.system_prompt,
    outputSchema: body.output_schema,
    strategy: body.strategy,
    ciFailOn: body.ci_fail_on,
    repoIntel: body.repo_intel,
    enabled: body.enabled,
    createdBy: ctx.userId,
  };
}

export function toAgentPatch(body: UpdateAgentBody): AgentPatch {
  return {
    name: body.name,
    description: body.description,
    provider: body.provider,
    model: body.model,
    systemPrompt: body.system_prompt,
    outputSchema: body.output_schema,
    strategy: body.strategy,
    ciFailOn: body.ci_fail_on,
    repoIntel: body.repo_intel,
    enabled: body.enabled,
  };
}
