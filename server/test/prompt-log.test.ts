/**
 * Content-free prompt-assembly logging (`prompt.assembled`).
 *
 * The canary cases are the security proof: every prompt part is built from
 * CANARY strings, run through the REAL assembler and record builder, and the
 * serialised record must not contain any of them — in summary AND in verbose.
 * The gating cases pin that verbose (fingerprints) is honoured only when
 * NODE_ENV=development.
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '@devdigest/reviewer-core';
import {
  buildPromptLogRecord,
  createPromptMeasure,
  emitPromptLog,
  logPromptAssembled,
  type PromptLogInput,
  type PromptSectionInput,
} from '../src/platform/prompt-log.js';
import { describeIntentPrompt } from '../src/modules/intent/prompt.js';
import { loadConfig } from '../src/platform/config.js';

const RUN_ID = '11111111-2222-4333-8444-555555555555';
const ROUND_ID = '66666666-7777-4888-9999-aaaaaaaaaaaa';

/** Every text that reaches a prompt carries `CANARY`; the secret also has its own prefix. */
const SECRET = 'sk-or-v1-CANARY0123456789abcdef';
const reviewerParts = {
  system: 'You are a security reviewer. CANARY_SYSTEM_PROMPT',
  task: 'Review PR #482 "CANARY_PR_TITLE" by CANARY_AUTHOR',
  prDescription: `CANARY_PR_DESCRIPTION. Token for staging: ${SECRET}`,
  intent: {
    intent: 'CANARY_INTENT_TEXT',
    in_scope: ['CANARY_IN_SCOPE'],
    out_of_scope: ['CANARY_OUT_OF_SCOPE'],
  },
  skills: ['CANARY_SKILL_BODY: never log secrets'],
  memory: ['CANARY_MEMORY_ITEM'],
  repoMap: 'src/config.ts: CANARY_REPO_MAP',
  specs: ['CANARY_SPEC_TEXT (private spec)'],
  callers: 'src/server.ts:12 CANARY_CALLERS',
  diff: [
    'diff --git a/src/config.ts b/src/config.ts',
    '--- a/src/config.ts',
    '+++ b/src/config.ts',
    '@@ -1,1 +1,2 @@',
    ' const port = 3000;',
    '+const CANARY_DIFF_LINE = 1;',
  ].join('\n'),
};

const tokenizer = { count: (t: string) => t.length };

function assertContentFree(json: string) {
  expect(json).not.toContain('CANARY');
  expect(json).not.toContain('sk-or-v1');
}

describe('prompt.assembled record — content-free canary', () => {
  for (const mode of ['summary', 'verbose'] as const) {
    it(`${mode}: a reviewer record built from the real assembler carries no prompt text, secret or diff line`, () => {
      const assembled = assemblePrompt(reviewerParts, createPromptMeasure(mode, tokenizer));
      // Non-vacuous: the canaries really are in the prompt that would be sent.
      expect(assembled.messages[1]!.content).toContain('CANARY_DIFF_LINE');
      expect(assembled.messages[1]!.content).toContain(SECRET);

      const record = buildPromptLogRecord(
        {
          component: 'reviewer',
          provider: 'openai',
          model: 'gpt-4.1',
          // A non-uuid pr_id is dropped, so it cannot smuggle text either.
          correlation: { pr_id: 'CANARY_NOT_A_UUID', round_id: ROUND_ID, run_id: RUN_ID, agent: 'Sec' },
          review_mode: 'single-pass',
          chunk: { index: 0, count: 1 },
          sections: assembled.sections,
        },
        mode,
      );
      const json = JSON.stringify(record);

      assertContentFree(json);
      expect(record.event).toBe('prompt.assembled');
      expect(record.log_mode).toBe(mode);
      expect(record.correlation).toEqual({ round_id: ROUND_ID, run_id: RUN_ID, agent: 'Sec' });
      expect(record.sections.map((s) => s.name)).toEqual(assembled.sections.map((s) => s.name));
      expect(record.totals.chars).toBe(
        assembled.messages[0]!.content.length +
          assembled.messages[1]!.content.length -
          2 * (assembled.sections.length - 2),
      );
      // The verbose extras are present — and still content-free.
      const skills = record.sections.find((s) => s.name === 'skills')!;
      if (mode === 'verbose') {
        expect(skills.fp).toMatch(/^[0-9a-f]{8}$/);
        expect(skills.item_detail).toHaveLength(1);
      } else {
        expect(skills.fp).toBeUndefined();
        expect(skills.item_detail).toBeUndefined();
      }
    });

    it(`${mode}: an intent-classifier record never carries a label, title or source text`, () => {
      const metas = describeIntentPrompt(
        [
          { label: 'Issue 1', kind: 'issue', text: 'CANARY_ISSUE_BODY' },
          { label: 'PR description', kind: 'description', text: `CANARY_DESCRIPTION ${SECRET}` },
        ],
        'CANARY_PR_TITLE',
        createPromptMeasure(mode, tokenizer),
      );
      // A caller that passes a label as the section name (the regression the allowlist guards).
      const labelled: PromptSectionInput = {
        name: 'issue-0 CANARY_LABEL',
        role: 'user',
        source: 'untrusted',
        chars: 42,
        items: 1,
      };

      const record = buildPromptLogRecord(
        {
          component: 'intent_classifier',
          provider: 'openrouter',
          model: 'deepseek/deepseek-v4-flash',
          correlation: { pr_id: RUN_ID, run_ids: [RUN_ID], round_id: ROUND_ID },
          sections: [...metas, labelled],
        },
        mode,
      );

      assertContentFree(JSON.stringify(record));
      expect(record.sections.map((s) => s.name)).toEqual([
        'system',
        'task',
        'pr_title',
        'issue',
        'description',
        'other',
      ]);
    });
  }
});

describe('prompt.assembled record — verbose-only fields', () => {
  const section: PromptSectionInput = {
    name: 'skills',
    role: 'user',
    source: 'trusted',
    chars: 10,
    items: 1,
    tokens: 3,
    fingerprint: 'deadbeef',
    itemDetail: [{ chars: 10, tokens: 3, fingerprint: 'cafebabe' }],
  };
  const input = (s: PromptSectionInput): PromptLogInput => ({
    component: 'reviewer',
    provider: 'openai',
    model: 'gpt-4.1',
    correlation: {},
    sections: [s],
  });

  it('summary drops fp and item_detail even when the input carries them', () => {
    const [out] = buildPromptLogRecord(input(section), 'summary').sections;
    expect(out).toEqual({ name: 'skills', role: 'user', source: 'trusted', chars: 10, tokens: 3, items: 1 });
  });

  it('verbose keeps an 8-hex fingerprint and drops anything else', () => {
    expect(buildPromptLogRecord(input(section), 'verbose').sections[0]!.fp).toBe('deadbeef');

    const [bad] = buildPromptLogRecord(
      input({
        ...section,
        fingerprint: 'not hex: CANARY',
        itemDetail: [{ chars: 10, fingerprint: 'deadbeef00' }],
      }),
      'verbose',
    ).sections;
    expect(bad!.fp).toBeUndefined();
    expect(bad!.item_detail).toEqual([{ chars: 10 }]);
  });
});

describe('PROMPT_LOG gating (loadConfig, explicit env — process.env untouched)', () => {
  const cfg = (env: Record<string, string>) => loadConfig(env as NodeJS.ProcessEnv);

  it('verbose is honoured only in development', () => {
    expect(cfg({ PROMPT_LOG: 'verbose', NODE_ENV: 'development' })).toMatchObject({
      promptLog: 'verbose',
      promptLogDowngraded: false,
    });
    for (const nodeEnv of ['production', 'test']) {
      expect(cfg({ PROMPT_LOG: 'verbose', NODE_ENV: nodeEnv })).toMatchObject({
        promptLog: 'summary',
        promptLogDowngraded: true,
      });
    }
  });

  it('empty means summary, an unknown value fails boot, and off measures nothing', () => {
    expect(cfg({ PROMPT_LOG: '', NODE_ENV: 'production' })).toMatchObject({
      promptLog: 'summary',
      promptLogDowngraded: false,
    });
    expect(() => cfg({ PROMPT_LOG: 'loud' })).toThrow();

    let calls = 0;
    expect(createPromptMeasure('off', { count: () => ++calls })).toBeUndefined();
    expect(calls).toBe(0);
  });
});

describe('emitting never fails the caller', () => {
  const throwing = {
    info(): void {
      throw new Error('logger down');
    },
  };
  const record = buildPromptLogRecord(
    { component: 'reviewer', provider: 'openai', model: 'gpt-4.1', correlation: {}, sections: [] },
    'summary',
  );

  it('emitPromptLog and logPromptAssembled swallow a throwing logger', () => {
    expect(() => emitPromptLog(throwing, record)).not.toThrow();
    expect(() =>
      logPromptAssembled(
        throwing,
        { component: 'reviewer', provider: 'openai', model: 'gpt-4.1', correlation: {}, sections: [] },
        'summary',
      ),
    ).not.toThrow();
  });
});
