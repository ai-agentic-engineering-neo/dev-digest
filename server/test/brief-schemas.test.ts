import { describe, it, expect } from 'vitest';
import { BriefGenerationOutput } from '../src/modules/brief/schemas.js';

/**
 * specs/11-why-risk-brief.md, plans/11-why-risk-brief.md Q4 — the raw
 * LLM-facing schema deliberately types `risk.kind` as `z.string()`, NOT the
 * shared `RiskKind` enum, so that an invented kind is a normalisation job for
 * `grounding.ts` (AC-15) rather than a schema-validation failure that would
 * burn a repair attempt (AC-11) or fail the whole generation (AC-33) over one
 * bad word. This test exists to catch a regression back to an enum here,
 * which would silently reintroduce that failure mode.
 */

function validOutput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    what: 'Adds rate limiting.',
    why: 'Prevents abuse.',
    risk_level: 'medium',
    risks: [
      {
        kind: 'performance',
        title: 'Hot path',
        explanation: 'Touches the handler.',
        severity: 'medium',
        file_refs: [{ file: 'src/a.ts', line: 12 }],
      },
    ],
    review_focus: [{ file: 'src/a.ts', line: 12, reason: 'Core change.' }],
    ...overrides,
  };
}

describe('BriefGenerationOutput', () => {
  it('parses a well-formed response', () => {
    const result = BriefGenerationOutput.safeParse(validOutput());
    expect(result.success).toBe(true);
  });

  it('Q4: an unrecognised, arbitrary `kind` string still PARSES — normalisation is grounding\'s job, not schema validation\'s', () => {
    const input = validOutput();
    (input.risks as Array<Record<string, unknown>>)[0]!.kind = 'this-is-not-in-the-vocabulary';
    const result = BriefGenerationOutput.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('`risk_level` stays a closed enum — an invalid value fails validation (triggers a repair attempt)', () => {
    const result = BriefGenerationOutput.safeParse(validOutput({ risk_level: 'catastrophic' }));
    expect(result.success).toBe(false);
  });

  it('a risk with zero file_refs fails validation — the raw schema requires at least one, before grounding ever runs', () => {
    const input = validOutput();
    (input.risks as Array<Record<string, unknown>>)[0]!.file_refs = [];
    const result = BriefGenerationOutput.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('`file_refs.line` accepts null, a positive int, or omission — never zero or negative', () => {
    const ok = validOutput();
    (ok.risks as Array<Record<string, unknown>>)[0]!.file_refs = [{ file: 'src/a.ts', line: null }];
    expect(BriefGenerationOutput.safeParse(ok).success).toBe(true);

    const bad = validOutput();
    (bad.risks as Array<Record<string, unknown>>)[0]!.file_refs = [{ file: 'src/a.ts', line: 0 }];
    expect(BriefGenerationOutput.safeParse(bad).success).toBe(false);
  });
});
