/**
 * assemblePrompt manifest — size-only metadata for the prompt log.
 * The safety property: the manifest never carries section TEXT.
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '../src/prompt.js';
import { MockLLMProvider, MockGitClient } from '../../server/src/adapters/mocks.js';
import { reviewPullRequest } from '../src/index.js';

const SECRET = 'sk_live_SUPERSECRET123';

describe('assemblePrompt manifest', () => {
  const parts = {
    system: 'You are a reviewer.',
    task: `Review PR #1 "${SECRET} title"`,
    prDescription: `desc ${SECRET}`,
    skills: [`### s1\n${SECRET} skill body`, '### s2\nbody'],
    specs: [`private spec ${SECRET}`],
    memory: ['remember this'],
    repoMap: `map ${SECRET}`,
    callers: `callers ${SECRET}`,
    diff: `+const key = "${SECRET}";`,
  };

  it('lists sections in prompt order with generic origins', () => {
    const { manifest } = assemblePrompt(parts);
    expect(manifest.map((s) => s.name)).toEqual([
      'system',
      'injection_guard',
      'task',
      'pr_description',
      'skills',
      'memory',
      'repo_map',
      'specs',
      'callers',
      'diff',
    ]);
    expect(manifest.find((s) => s.name === 'diff')?.origin).toBe('pull_request');
    expect(manifest.find((s) => s.name === 'skills')?.origin).toBe('agent_skills');
  });

  it('carries no prompt text — a secret in any section never appears in the manifest', () => {
    const { manifest } = assemblePrompt(parts);
    expect(JSON.stringify(manifest)).not.toContain(SECRET);
    expect(JSON.stringify(manifest)).not.toContain('reviewer');
  });

  it('reports sizes, item counts and per-item sizes', () => {
    const { manifest, messages } = assemblePrompt(parts);
    const skills = manifest.find((s) => s.name === 'skills')!;
    expect(skills.items).toBe(2);
    expect(skills.item_chars).toEqual(parts.skills.map((s) => s.length));
    const userChars = manifest
      .filter((s) => !['system', 'injection_guard'].includes(s.name))
      .reduce((n, s) => n + s.chars, 0);
    // user message = sections joined by a blank line
    expect(messages[1]!.content.length).toBe(userChars + 2 * (manifest.length - 2 - 1));
    for (const s of manifest) expect(s.approx_tokens).toBe(Math.ceil(s.chars / 4));
  });

  it('flags a truncated PR description and keeps its raw size', () => {
    const { manifest } = assemblePrompt({ system: 's', diff: 'd', prDescription: 'x'.repeat(5000) });
    const d = manifest.find((s) => s.name === 'pr_description')!;
    expect(d.truncated).toBe(true);
    expect(d.raw_chars).toBe(5000);
  });

  it('omits sections that are absent', () => {
    const { manifest } = assemblePrompt({ system: 's', diff: 'd' });
    expect(manifest.map((s) => s.name)).toEqual(['system', 'injection_guard', 'diff']);
  });
});

describe('reviewPullRequest → onPromptAssembled', () => {
  it('fires once, before the LLM call, with size-only metadata (the mock diff holds an sk_live key)', async () => {
    const llm = new MockLLMProvider('openai', {
      structured: { verdict: 'approve', summary: 's', score: 100, findings: [] },
    });
    const diff = await new MockGitClient().diff();
    const seen: { callsAtFire: number; info: unknown }[] = [];
    await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'gpt-4.1',
      diff,
      llm,
      onPromptAssembled: (info) => seen.push({ callsAtFire: llm.calls.length, info }),
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.callsAtFire).toBe(0);
    expect(JSON.stringify(seen[0]!.info)).not.toContain('sk_live');
    expect((seen[0]!.info as { manifest: { name: string }[] }).manifest.map((s) => s.name)).toContain('diff');
  });
});
