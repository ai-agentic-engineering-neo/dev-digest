import { AgentManifest } from '@devdigest/shared';
import type { AgentManifestInput } from '@devdigest/shared';

/**
 * Pure manifest generator: builds an `AgentManifest` from an agent's config
 * fields + its linked skills (already resolved to slugs by the caller — T5
 * owns skill-slug resolution/collision handling), and serializes it to YAML.
 *
 * No `yaml` package is a declared dependency of `server/` (only present
 * transitively via `docker-compose`/testcontainers — a phantom dependency
 * that must not be relied on). YAML is therefore emitted by hand below,
 * using double-quoted, JSON-escaped scalars throughout: this keeps the
 * output deterministic, trivially and unambiguously parseable (JSON string
 * escaping is a strict subset of YAML double-quoted scalar escaping), and
 * still fully valid YAML for the runner (T8) to consume with a real parser.
 */

/** The subset of the `Agent` DTO needed to build a manifest. */
export interface AgentManifestSource {
  name: string;
  provider: AgentManifestInput['provider'];
  model: string;
  system_prompt: string;
  strategy: AgentManifestInput['strategy'];
  ci_fail_on: AgentManifestInput['ci_fail_on'];
}

/**
 * Build (and validate) an `AgentManifest` from the agent's config + its
 * linked skills, already resolved to slugs. Throws if `agent` is somehow
 * malformed — callers own validating the agent DTO before export.
 */
export function buildAgentManifest(agent: AgentManifestSource, skillSlugs: string[]): AgentManifest {
  const input: AgentManifestInput = {
    name: agent.name,
    provider: agent.provider,
    model: agent.model,
    system_prompt: agent.system_prompt,
    skills: skillSlugs,
    strategy: agent.strategy,
    ci_fail_on: agent.ci_fail_on,
  };
  return AgentManifest.parse(input);
}

/** Escape a string as a JSON string body (without surrounding quotes). */
function escapeScalarBody(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

/** Render a plain (non-array) field as `key: "value"`. */
function scalarLine(key: string, value: string): string {
  return `${key}: "${escapeScalarBody(value)}"`;
}

/**
 * Serialize a validated `AgentManifest` to deterministic YAML text.
 * Every scalar is double-quoted (JSON-escaped); `skills` is a flow array
 * (`[]`) when empty, otherwise a block sequence of quoted strings.
 */
export function serializeAgentManifestYaml(manifest: AgentManifest): string {
  const lines: string[] = [];
  lines.push(scalarLine('name', manifest.name));
  lines.push(scalarLine('provider', manifest.provider));
  lines.push(scalarLine('model', manifest.model));
  lines.push(scalarLine('system_prompt', manifest.system_prompt));

  if (manifest.skills.length === 0) {
    lines.push('skills: []');
  } else {
    lines.push('skills:');
    for (const skill of manifest.skills) {
      lines.push(`  - "${escapeScalarBody(skill)}"`);
    }
  }

  lines.push(scalarLine('strategy', manifest.strategy));
  lines.push(scalarLine('ci_fail_on', manifest.ci_fail_on));

  return `${lines.join('\n')}\n`;
}

/** Build the manifest and serialize it to YAML text in one call. */
export function buildAgentManifestYaml(agent: AgentManifestSource, skillSlugs: string[]): string {
  return serializeAgentManifestYaml(buildAgentManifest(agent, skillSlugs));
}
