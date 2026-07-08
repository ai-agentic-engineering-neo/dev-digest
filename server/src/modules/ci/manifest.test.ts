import { AgentManifest } from '@devdigest/shared';
import { describe, expect, it } from 'vitest';
import { buildAgentManifest, buildAgentManifestYaml, serializeAgentManifestYaml } from './manifest.js';
import type { AgentManifestSource } from './manifest.js';

const AGENT: AgentManifestSource = {
  name: 'Security Reviewer',
  provider: 'openrouter',
  model: 'openai/gpt-4o-mini',
  system_prompt: 'You are a strict security reviewer.\nFlag anything suspicious.',
  strategy: 'map-reduce',
  ci_fail_on: 'warning',
};

/**
 * Minimal, purpose-built YAML reader for the EXACT deterministic subset this
 * module emits (double-quoted JSON-escaped scalars; a flow `[]` or a block
 * sequence of quoted strings for `skills`). This is NOT a general YAML parser
 * — it exists solely to prove the round trip for AC-5, mirroring the fact that
 * the real consumer (the CI runner, T8) uses an actual YAML library.
 */
function parseGeneratedManifestYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim().length === 0) {
      i += 1;
      continue;
    }
    const scalarMatch = line.match(/^([a-z_]+): "(.*)"$/);
    if (scalarMatch) {
      const [, key, body] = scalarMatch;
      result[key as string] = JSON.parse(`"${body}"`);
      i += 1;
      continue;
    }
    if (line === 'skills: []') {
      result.skills = [];
      i += 1;
      continue;
    }
    if (line === 'skills:') {
      const skills: string[] = [];
      i += 1;
      while (i < lines.length && (lines[i] ?? '').startsWith('  - "')) {
        const itemMatch = (lines[i] ?? '').match(/^ {2}- "(.*)"$/);
        if (itemMatch) {
          skills.push(JSON.parse(`"${itemMatch[1]}"`));
        }
        i += 1;
      }
      result.skills = skills;
      continue;
    }
    i += 1;
  }
  return result;
}

describe('buildAgentManifest', () => {
  it('builds a manifest whose fields equal the agent DTO + resolved skill slugs (AC-5)', () => {
    const manifest = buildAgentManifest(AGENT, ['secret-scanner', 'style-guide']);
    expect(manifest.name).toBe(AGENT.name);
    expect(manifest.provider).toBe(AGENT.provider);
    expect(manifest.model).toBe(AGENT.model);
    expect(manifest.system_prompt).toBe(AGENT.system_prompt);
    expect(manifest.strategy).toBe(AGENT.strategy);
    expect(manifest.ci_fail_on).toBe(AGENT.ci_fail_on);
    expect(manifest.skills).toEqual(['secret-scanner', 'style-guide']);
  });

  it('normalizes an empty skills list to []', () => {
    const manifest = buildAgentManifest(AGENT, []);
    expect(manifest.skills).toEqual([]);
  });
});

describe('serializeAgentManifestYaml', () => {
  it('emits YAML that AgentManifest.safeParse accepts, with fields equal to the source (AC-5)', () => {
    const manifest = buildAgentManifest(AGENT, ['secret-scanner']);
    const yamlText = serializeAgentManifestYaml(manifest);

    const parsedPlainObject = parseGeneratedManifestYaml(yamlText);
    const result = AgentManifest.safeParse(parsedPlainObject);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(manifest);
    }
  });

  it('emits a flow-style empty array for skills: []', () => {
    const manifest = buildAgentManifest(AGENT, []);
    const yamlText = serializeAgentManifestYaml(manifest);
    expect(yamlText).toContain('skills: []');
  });

  it('round-trips a system_prompt containing newlines, quotes, and backslashes', () => {
    const tricky: AgentManifestSource = {
      ...AGENT,
      system_prompt: 'Line one.\nLine "two" with a backslash \\ and a tab\tend.',
    };
    const manifest = buildAgentManifest(tricky, []);
    const yamlText = serializeAgentManifestYaml(manifest);

    const parsed = AgentManifest.safeParse(parseGeneratedManifestYaml(yamlText));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.system_prompt).toBe(tricky.system_prompt);
    }
  });
});

describe('buildAgentManifestYaml', () => {
  it('builds + serializes in one call and produces valid, parseable manifest YAML', () => {
    const yamlText = buildAgentManifestYaml(AGENT, ['secret-scanner']);
    const parsed = AgentManifest.safeParse(parseGeneratedManifestYaml(yamlText));
    expect(parsed.success).toBe(true);
  });
});
