/**
 * L03 — `loadConfig` / `startupWarnings` (platform/config.ts). Pure: every
 * case passes an explicit env object, never `process.env`, so a developer's
 * real `PROMPT_LOG`/`NODE_ENV` can never leak into these assertions.
 */
import { describe, it, expect } from 'vitest';
import { loadConfig, startupWarnings } from '../src/platform/config.js';

describe('loadConfig — PROMPT_LOG (L03 prompt logging)', () => {
  it('defaults to summary, not verbose-ignored, with no PROMPT_LOG set', () => {
    const cfg = loadConfig({} as NodeJS.ProcessEnv);
    expect(cfg.promptLog).toBe('summary');
    expect(cfg.promptLogVerboseIgnored).toBe(false);
  });

  it('PROMPT_LOG=verbose in development resolves to verbose, with no startup warning', () => {
    const cfg = loadConfig({ NODE_ENV: 'development', PROMPT_LOG: 'verbose' } as NodeJS.ProcessEnv);
    expect(cfg.promptLog).toBe('verbose');
    expect(cfg.promptLogVerboseIgnored).toBe(false);
    expect(startupWarnings(cfg)).toEqual([]);
  });

  it('PROMPT_LOG=verbose in production is downgraded to summary, with one startup warning', () => {
    const cfg = loadConfig({ NODE_ENV: 'production', PROMPT_LOG: 'verbose' } as NodeJS.ProcessEnv);
    expect(cfg.promptLog).toBe('summary');
    expect(cfg.promptLogVerboseIgnored).toBe(true);

    const warnings = startupWarnings(cfg);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.msg).toContain('PROMPT_LOG=verbose ignored');
  });

  it('PROMPT_LOG="" (as shipped in .env / .env.example) falls through to summary', () => {
    const cfg = loadConfig({ PROMPT_LOG: '' } as NodeJS.ProcessEnv);
    expect(cfg.promptLog).toBe('summary');
  });

  it('an invalid PROMPT_LOG value fails startup, like an invalid LOG_LEVEL', () => {
    expect(() => loadConfig({ PROMPT_LOG: 'loud' } as NodeJS.ProcessEnv)).toThrow();
  });
});
