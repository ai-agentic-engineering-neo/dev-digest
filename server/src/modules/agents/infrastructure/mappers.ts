import { AgentVersionConfig } from '@devdigest/shared';
import type { AgentRow, AgentVersionRow } from '../../../db/rows.js';
import type { Agent, AgentConfigSnapshot, AgentVersion } from '../domain/types.js';

/** Row → domain. The row's enum columns are already narrowed by the schema. */
export function toAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    description: row.description,
    provider: row.provider,
    model: row.model,
    systemPrompt: row.systemPrompt,
    outputSchema: row.outputSchema,
    strategy: row.strategy,
    ciFailOn: row.ciFailOn,
    repoIntel: row.repoIntel,
    enabled: row.enabled,
    version: row.version,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

/**
 * Snapshot jsonb is untyped (an older config shape could drift), so it is
 * parsed here, where it enters the app — a malformed snapshot throws instead of
 * leaking an unvalidated blob.
 */
export function toAgentVersion(row: AgentVersionRow): AgentVersion {
  const c = AgentVersionConfig.parse(row.configJson);
  const config: AgentConfigSnapshot = {
    provider: c.provider,
    model: c.model,
    systemPrompt: c.system_prompt,
    strategy: c.strategy,
    ciFailOn: c.ci_fail_on,
    repoIntel: c.repo_intel,
    skills: c.skills,
  };
  if ('output_schema' in c) config.outputSchema = c.output_schema;
  return { agentId: row.agentId, version: row.version, config, createdAt: row.createdAt };
}

/** Domain snapshot → the persisted snake_case jsonb shape (AgentVersionConfig). */
export function toConfigJson(config: AgentConfigSnapshot): AgentVersionConfig {
  return {
    provider: config.provider,
    model: config.model,
    system_prompt: config.systemPrompt,
    output_schema: config.outputSchema,
    strategy: config.strategy,
    ci_fail_on: config.ciFailOn,
    repo_intel: config.repoIntel,
    skills: config.skills,
  };
}
