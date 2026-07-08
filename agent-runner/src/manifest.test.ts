import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadManifests, findManifestPaths, loadAgentManifest } from './manifest.js';
import { RunnerError } from './errors.js';

const VALID_MANIFEST_YAML = `
name: "Security Reviewer"
provider: "openrouter"
model: "deepseek/deepseek-v4-flash"
system_prompt: "Review this PR for security issues."
skills: ["security-basics"]
strategy: "auto"
ci_fail_on: "critical"
`;

describe('manifest loading + validation (AC-20)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'devdigest-runner-manifest-'));
    mkdirSync(path.join(dir, 'agents'), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads and validates a well-formed manifest against the AgentManifest schema', () => {
    writeFileSync(path.join(dir, 'agents', 'security-reviewer.yaml'), VALID_MANIFEST_YAML);

    const manifests = loadManifests(dir);

    expect(manifests).toHaveLength(1);
    const manifest = manifests[0]!;
    expect(manifest.name).toBe('Security Reviewer');
    expect(manifest.model).toBe('deepseek/deepseek-v4-flash');
    expect(manifest.skills).toEqual(['security-basics']);
    expect(manifest.ci_fail_on).toBe('critical');
  });

  it('loads MULTIPLE manifests (multi-agent), in deterministic filename order', () => {
    writeFileSync(path.join(dir, 'agents', 'b-second.yaml'), VALID_MANIFEST_YAML);
    writeFileSync(
      path.join(dir, 'agents', 'a-first.yaml'),
      VALID_MANIFEST_YAML.replace('Security Reviewer', 'Performance Reviewer'),
    );

    expect(findManifestPaths(dir).map((p) => path.basename(p))).toEqual([
      'a-first.yaml',
      'b-second.yaml',
    ]);
    const names = loadManifests(dir).map((m) => m.name);
    expect(names).toEqual(['Performance Reviewer', 'Security Reviewer']);
  });

  it('fails clearly when the manifest fails schema validation (bad ci_fail_on)', () => {
    writeFileSync(
      path.join(dir, 'agents', 'bad.yaml'),
      `
name: "Bad Agent"
model: "gpt-4.1"
system_prompt: "review"
ci_fail_on: "sometimes"
`,
    );

    expect(() => loadManifests(dir)).toThrow(RunnerError);
    expect(() => loadManifests(dir)).toThrow(/failed validation/i);
  });

  it('fails clearly when the manifest is missing required fields', () => {
    writeFileSync(path.join(dir, 'agents', 'incomplete.yaml'), 'name: "No model or prompt"\n');
    expect(() => loadManifests(dir)).toThrow(RunnerError);
  });

  it('fails clearly when no manifest file exists', () => {
    rmSync(path.join(dir, 'agents', ), { recursive: true, force: true });
    expect(() => findManifestPaths(dir)).toThrow(/not found/i);
  });

  it('fails the whole batch if ANY of several manifests is invalid (never partial)', () => {
    writeFileSync(path.join(dir, 'agents', 'a-good.yaml'), VALID_MANIFEST_YAML);
    writeFileSync(path.join(dir, 'agents', 'b-bad.yaml'), 'name: "Bad"\nci_fail_on: "sometimes"\n');
    expect(() => loadManifests(dir)).toThrow(RunnerError);
  });

  it('fails clearly on malformed YAML', () => {
    writeFileSync(path.join(dir, 'agents', 'broken.yaml'), 'name: "unterminated\n  bad: [1, 2\n');
    const manifestPath = path.join(dir, 'agents', 'broken.yaml');
    expect(() => loadAgentManifest(manifestPath)).toThrow(RunnerError);
  });
});
