import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff } from '../src/adapters/git/diff-parser.js';
import { SEED_FIXTURE_PRS, REFUND_PR, CONTRACT_PR } from '../src/db/seed-prs.js';
import { SEED_AGENT_SKILLS, SEED_SKILLS } from '../src/db/seed-skills.js';
import { CreateSkillInput } from '@devdigest/shared';

/**
 * M2 seed fixtures: the control-experiment PR patches must parse into a real
 * UnifiedDiff (the review diff-loader rebuilds the diff from them), and the
 * lines a reviewer should flag must be addressable new-side lines (grounding).
 */
function diffOf(pr: typeof REFUND_PR) {
  return parseUnifiedDiff(
    pr.files
      .map((f) => [`diff --git a/${f.path} b/${f.path}`, `--- a/${f.path}`, `+++ b/${f.path}`, f.patch].join('\n'))
      .join('\n'),
  );
}

describe('seed fixture PRs', () => {
  it('every patch parses with consistent hunk counts', () => {
    for (const pr of SEED_FIXTURE_PRS) {
      const diff = diffOf(pr);
      expect(diff.files.map((f) => f.path)).toEqual(pr.files.map((f) => f.path));
    }
  });

  it('#483: hunk covers the over-limit branch line and counts match the file', () => {
    const file = diffOf(REFUND_PR).files.find((f) => f.path === 'src/payments/refund.ts')!;
    const src = REFUND_PR.files[0]!.patch.split('\n').slice(1);
    const branchLine = src.findIndex((l) => l.includes('amountCents > refundable')) + 1;
    expect(branchLine).toBe(14);
    expect(file.hunks[0]!.newLineNumbers).toContain(branchLine);
    expect(file.additions).toBe(src.length);
  });

  it('#484: one hunk with matching old/new counts; field rename is on the new side', () => {
    const file = diffOf(CONTRACT_PR).files[0]!;
    expect(file.hunks).toHaveLength(1);
    expect(file.additions).toBe(CONTRACT_PR.files[0]!.additions);
    expect(file.deletions).toBe(CONTRACT_PR.files[0]!.deletions);
    expect(CONTRACT_PR.files[0]!.patch).toContain('+      amount_cents: payment.amountCents,');
  });
});

describe('seed skills', () => {
  it('are valid CreateSkillInput and every linked name exists', () => {
    for (const s of SEED_SKILLS) expect(CreateSkillInput.safeParse(s).success).toBe(true);
    const names = new Set(SEED_SKILLS.map((s) => s.name));
    for (const list of Object.values(SEED_AGENT_SKILLS)) for (const n of list) expect(names.has(n)).toBe(true);
  });
});
