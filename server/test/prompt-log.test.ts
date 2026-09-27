import { describe, it, expect } from 'vitest';
import type { PromptSectionMeta } from '@devdigest/reviewer-core';
import { buildPromptLog } from '../src/modules/reviews/prompt-log.js';
import { loadConfig } from '../src/platform/config.js';

const manifest: PromptSectionMeta[] = [
  { name: 'system', origin: 'agent', chars: 100, approx_tokens: 25, lines: 3, raw_chars: 100, truncated: false },
  {
    name: 'skills',
    origin: 'agent_skills',
    chars: 41,
    approx_tokens: 11,
    lines: 4,
    raw_chars: 41,
    truncated: false,
    items: 2,
    item_chars: [20, 15],
  },
  { name: 'diff', origin: 'pull_request', chars: 300, approx_tokens: 75, lines: 9, raw_chars: 300, truncated: false },
];
const ctx = { runId: 'run-1', prId: 'pr-1', agent: 'Sec', provider: 'openrouter', model: 'm/x', mode: 'single-pass' };

describe('buildPromptLog', () => {
  it('summary: ids, model, totals, per-section name/origin/size — no verbose fields', () => {
    const log = buildPromptLog(manifest, ctx, false) as any;
    expect(log).toMatchObject({
      event: 'prompt.assembled',
      correlation_id: 'run-1',
      run_id: 'run-1',
      pr_id: 'pr-1',
      model: 'm/x',
      total_chars: 441,
      section_count: 3,
    });
    expect(log.sections[1]).toEqual({
      name: 'skills',
      origin: 'agent_skills',
      chars: 41,
      approx_tokens: 11,
      truncated: false,
      items: 2,
    });
  });

  it('verbose adds lines, raw sizes and per-item sizes, still no text', () => {
    const log = buildPromptLog(manifest, ctx, true) as any;
    expect(log.sections[1]).toMatchObject({ lines: 4, raw_chars: 41, item_chars: [20, 15] });
    expect(JSON.stringify(log)).not.toMatch(/sk_live|BEGIN|password/i);
  });

  it('drops any field that is not on the allowlist, even if the manifest is polluted', () => {
    const polluted = [{ ...manifest[0], text: 'sk_live_LEAK', content: 'sk_live_LEAK' }] as unknown as PromptSectionMeta[];
    expect(JSON.stringify(buildPromptLog(polluted, ctx, true))).not.toContain('sk_live_LEAK');
  });
});

describe('PROMPT_LOG_VERBOSE gating', () => {
  const on = { PROMPT_LOG_VERBOSE: '1' };
  it('on only in development with a loopback host', () => {
    const c = loadConfig({ ...on, NODE_ENV: 'development', API_HOST: '127.0.0.1' });
    expect(c.promptLogVerbose).toBe(true);
    expect(c.promptLogVerboseIgnored).toBe(false);
  });
  it('refused (and flagged) when bound to all interfaces', () => {
    const c = loadConfig({ ...on, NODE_ENV: 'development', API_HOST: '0.0.0.0' });
    expect(c.promptLogVerbose).toBe(false);
    expect(c.promptLogVerboseIgnored).toBe(true);
  });
  it('refused in production and in test', () => {
    for (const NODE_ENV of ['production', 'test'] as const) {
      const c = loadConfig({ ...on, NODE_ENV, API_HOST: '127.0.0.1' });
      expect(c.promptLogVerbose).toBe(false);
      expect(c.promptLogVerboseIgnored).toBe(true);
    }
  });
  it('off and not flagged when unset', () => {
    const c = loadConfig({ NODE_ENV: 'development' });
    expect(c.promptLogVerbose).toBe(false);
    expect(c.promptLogVerboseIgnored).toBe(false);
  });
});
