import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FEATURE_MODELS } from '@devdigest/shared';
import { BLAST_DEGRADED_REASONS } from '../src/modules/blast/domain/types.js';
import { DEFAULT_BRIEF_MODEL } from '../src/modules/brief/constants.js';
import { BRIEF_BLAST_REASONS } from '../src/modules/brief/domain/types.js';
import {
  BriefMissingInputSchema,
  BriefModelReply,
  PrBriefResponseSchema,
} from '../src/modules/brief/schemas.js';

const fixture: unknown = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/brief-response.json'), 'utf8'),
);

type Mutable = {
  brief: { head_sha?: string; review_focus: { line: number }[] };
};

function clone(): Mutable {
  return JSON.parse(JSON.stringify(fixture)) as Mutable;
}

describe('brief schemas', () => {
  it('parses the golden fixture', () => {
    expect(PrBriefResponseSchema.safeParse(fixture).success).toBe(true);
  });

  it('rejects a brief without head_sha', () => {
    const f = clone();
    delete f.brief.head_sha;
    expect(PrBriefResponseSchema.safeParse(f).success).toBe(false);
  });

  it('rejects a focus item with line 0', () => {
    const f = clone();
    f.brief.review_focus[0]!.line = 0;
    expect(PrBriefResponseSchema.safeParse(f).success).toBe(false);
  });

  it('rejects a blast missing input with an intent reason', () => {
    expect(BriefMissingInputSchema.safeParse({ input: 'blast', reason: 'not_derived' }).success).toBe(false);
  });

  it('keeps blast reasons in sync with the blast module', () => {
    expect([...BRIEF_BLAST_REASONS]).toEqual([...BLAST_DEGRADED_REASONS]);
  });

  it('parses a lenient model reply and rejects an unknown severity', () => {
    const risk = { kind: 'auth', title: 't', explanation: 'e', severity: 'high', file_refs: ['a.ts'] };
    const ok = BriefModelReply.safeParse({
      summary: 's',
      risks: [risk],
      review_focus: [{ file: 'a.ts', line: 12, reason: 'r' }],
    });
    expect(ok.success).toBe(true);
    const bad = BriefModelReply.safeParse({
      summary: 's',
      risks: [{ ...risk, severity: 'critical' }],
      review_focus: [],
    });
    expect(bad.success).toBe(false);
  });

  it('uses its own default model, different from the shared risk_brief default', () => {
    expect(DEFAULT_BRIEF_MODEL).toEqual({ provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' });
    const shared = FEATURE_MODELS.find((f) => f.id === 'risk_brief');
    expect(shared).toBeDefined();
    expect({ provider: shared?.defaultProvider, model: shared?.defaultModel }).not.toEqual(DEFAULT_BRIEF_MODEL);
  });
});
