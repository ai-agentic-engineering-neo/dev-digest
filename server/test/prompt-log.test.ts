/**
 * L03 — `platform/prompt-log.ts`: `fingerprintText`, `toPromptLogRecord`
 * (summary/verbose field filtering, field-by-field mapping — never a spread of
 * the input) and `emitPromptLog` (never throws, no-op without a logger).
 */
import { describe, it, expect } from 'vitest';
import {
  fingerprintText,
  toPromptLogRecord,
  emitPromptLog,
  type PromptLogInput,
} from '../src/platform/prompt-log.js';

describe('fingerprintText', () => {
  it('is the first 12 hex chars of sha256(text)', () => {
    // sha256('abc') = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    expect(fingerprintText('abc')).toBe('ba7816bf8f01');
  });
});

const FULL_INPUT: PromptLogInput = {
  feature: 'review',
  scope: 'chunk',
  correlation_id: 'run-1',
  pr_id: 'pr-1',
  run_id: 'run-1',
  agent: 'Reviewer',
  provider: 'openai',
  model: 'gpt-4.1',
  mode: 'map-reduce',
  chunk_count: 2,
  chunk_index: 0,
  chunk_label: 'src/a.ts',
  system_chars: 10,
  user_chars: 20,
  total_chars: 30,
  tokens_est: 8,
  sections: [
    {
      name: 'diff',
      source: 'diff',
      role: 'user',
      untrusted: true,
      chars: 20,
      tokens_est: 5,
      fingerprint: 'abc123abc123',
      ref: null,
    },
  ],
  diff_files: [{ path: 'src/a.ts', chars: 20 }],
  skills: ['rate-limit-rules'],
};

describe('toPromptLogRecord', () => {
  it('summary mode strips fingerprints, refs, chunk_label, diff_files and skills', () => {
    const rec = toPromptLogRecord(FULL_INPUT, 'summary');

    expect(rec).not.toHaveProperty('chunk_label');
    expect(rec).not.toHaveProperty('diff_files');
    expect(rec).not.toHaveProperty('skills');
    for (const s of rec.sections) {
      expect(s).not.toHaveProperty('fingerprint');
      expect(s).not.toHaveProperty('ref');
    }
    expect(rec.event).toBe('prompt.assembled');
    expect(rec.prompt_log).toBe('summary');
  });

  it('verbose mode keeps every field with its input value', () => {
    const rec = toPromptLogRecord(FULL_INPUT, 'verbose');

    expect(rec.chunk_label).toBe('src/a.ts');
    expect(rec.diff_files).toEqual([{ path: 'src/a.ts', chars: 20 }]);
    expect(rec.skills).toEqual(['rate-limit-rules']);
    expect(rec.sections[0]!.fingerprint).toBe('abc123abc123');
    expect(rec.sections[0]!.ref).toBeNull();
    expect(rec.event).toBe('prompt.assembled');
    expect(rec.prompt_log).toBe('verbose');
  });

  it('never leaks a field beyond the whitelist — field-by-field mapping, not a spread', () => {
    const withStrayField = {
      ...FULL_INPUT,
      // Cast past the type: simulates a future field added to PromptLogInput
      // that the builder does not yet know about.
      text: 'CANARY_X',
      sections: [{ ...FULL_INPUT.sections[0]!, text: 'CANARY_X' }],
    } as unknown as PromptLogInput;

    const rec = toPromptLogRecord(withStrayField, 'verbose');
    expect(JSON.stringify(rec)).not.toContain('CANARY_X');
  });
});

describe('emitPromptLog', () => {
  it('is a no-op without a logger', () => {
    expect(() => emitPromptLog(undefined, FULL_INPUT, 'summary')).not.toThrow();
  });

  it('never throws, even when logger.info throws', () => {
    const logger = {
      info: () => {
        throw new Error('boom');
      },
    };
    expect(() => emitPromptLog(logger, FULL_INPUT, 'summary')).not.toThrow();
  });

  it('calls logger.info exactly once, with the record and the fixed message', () => {
    const calls: unknown[][] = [];
    const logger = { info: (...args: unknown[]) => calls.push(args) };

    emitPromptLog(logger, FULL_INPUT, 'summary');

    expect(calls).toHaveLength(1);
    expect(calls[0]![1]).toBe('prompt: assembled');
    expect((calls[0]![0] as { event: string }).event).toBe('prompt.assembled');
  });
});
