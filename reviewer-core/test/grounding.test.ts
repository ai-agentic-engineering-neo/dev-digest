import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { CONFIG_DIFF } from './stubs.js';
import { groundFindings } from '../src/index.js';

/** CONFIG_DIFF covers new-side lines 10–12 of src/config.ts. */
function f(partial: Partial<Finding>): Finding {
  return {
    id: 'x',
    severity: 'WARNING',
    category: 'bug',
    title: 't',
    file: 'src/config.ts',
    start_line: 11,
    end_line: 11,
    rationale: 'r',
    confidence: 0.8,
    ...partial,
  };
}

describe('groundFindings (specs/grounding-model-findings.md)', () => {
  it('line-grounds a full-file kind by default and exempts it only for a scanner', () => {
    const leak = f({ start_line: 1, end_line: 1, kind: 'secret_leak' });

    expect(groundFindings([leak], CONFIG_DIFF).kept).toHaveLength(0);
    expect(groundFindings([leak], CONFIG_DIFF, { fullFileScanner: true }).kept).toHaveLength(1);
  });

  it('drops a reversed range', () => {
    const res = groundFindings([f({ start_line: 12, end_line: 10 })], CONFIG_DIFF);
    expect(res.kept).toHaveLength(0);
    expect(res.dropped[0]!.reason).toMatch(/is after end_line/);
  });

  it('drops an end_line of 1e9 promptly instead of looping over the range', () => {
    const started = performance.now();
    const res = groundFindings([f({ start_line: 13, end_line: 1e9 })], CONFIG_DIFF);
    expect(performance.now() - started).toBeLessThan(50);
    expect(res.kept).toHaveLength(0);
    expect(res.dropped[0]!.reason).toMatch(/exceeds/);
  });
});
