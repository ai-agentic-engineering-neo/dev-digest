import { stringify as toYaml } from 'yaml';
import { AgentManifest, type AgentManifestInput } from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { agentManifestPath } from './constants.js';

/**
 * specs/14-export-to-ci.md (P2, security-critical) — agent row → validated
 * `AgentManifest` → YAML file. Pure: no DB, no HTTP, no LLM (AC-9/AC-25).
 */

/** The subset of an agent's stored config the manifest needs. Declared
 *  fully locally (not `db/rows.ts`'s `AgentRow`) so this file — which lives
 *  outside `repository.ts` — never imports `src/db/**` (`db-only-in-repositories`). */
export interface ManifestSourceAgent {
  name: string;
  provider: AgentManifestInput['provider'];
  model: string;
  systemPrompt: string;
  skillSlugs: string[];
  strategy: AgentManifestInput['strategy'];
  ciFailOn: AgentManifestInput['ci_fail_on'];
}

/**
 * Build + VALIDATE the manifest object against the SAME `AgentManifest`
 * contract the runner re-validates on the other end (AC-12), so a manifest
 * that fails validation can never be born and written for the runner to trip
 * on later.
 */
export function buildAgentManifest(agent: ManifestSourceAgent): AgentManifest {
  const candidate: AgentManifestInput = {
    name: agent.name,
    provider: agent.provider,
    model: agent.model,
    system_prompt: agent.systemPrompt,
    skills: agent.skillSlugs,
    strategy: agent.strategy,
    ci_fail_on: agent.ciFailOn,
  };
  const result = AgentManifest.safeParse(candidate);
  if (!result.success) {
    throw new ValidationError(
      `Generated agent manifest failed validation: ${result.error.message}`,
    );
  }
  return result.data;
}

/**
 * Serialise via the `yaml` package's `stringify` — NEVER hand-rolled string
 * quoting. AC-16's exact failure mode is a hostile agent name (shell
 * metacharacters, a newline, a `"; rm -rf / #` payload) breaking out of a
 * hand-quoted YAML scalar; a real YAML serializer quotes/escapes whatever
 * the value actually is, so the string this produces always re-parses back
 * to the identical object (AC-12's round-trip).
 */
export function renderAgentManifestYaml(manifest: AgentManifest): string {
  return toYaml(manifest);
}

/** Build the one `.devdigest/agents/<slug>.yaml` bundle file. */
export function agentManifestFile(agent: ManifestSourceAgent): { path: string; contents: string } {
  const manifest = buildAgentManifest(agent);
  return { path: agentManifestPath(), contents: renderAgentManifestYaml(manifest) };
}
