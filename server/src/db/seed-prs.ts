/**
 * M2 control-experiment fixture PRs for the demo repo (acme/payments-api).
 * No GitHub needed: the review diff-loader falls back to these persisted
 * `pr_files.patch` hunks when there is no clone.
 *
 *  #483 — refund logic with a happy-path-only test → Test Quality skills
 *         should flag the untested branches and the boundary case.
 *  #484 — payments route "cleanup" that renames a response field and a request
 *         field → the api-contract skill should flag the breaking change.
 */

export interface SeedPrFile {
  path: string;
  patch: string;
  additions: number;
  deletions: number;
}

export interface SeedPr {
  number: number;
  title: string;
  author: string;
  branch: string;
  headSha: string;
  body: string;
  commit: string;
  files: SeedPrFile[];
}

/** A single hunk; header counts are derived from the line prefixes. */
function hunk(oldStart: number, newStart: number, lines: string[], context = ''): SeedPrFile['patch'] {
  const oldCount = lines.filter((l) => l.startsWith(' ') || l.startsWith('-')).length;
  const newCount = lines.filter((l) => l.startsWith(' ') || l.startsWith('+')).length;
  const header = `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@${context ? ` ${context}` : ''}`;
  return [header, ...lines].join('\n');
}

function newFile(path: string, lines: string[]): SeedPrFile {
  return {
    path,
    patch: hunk(0, 1, lines.map((l) => `+${l}`)),
    additions: lines.length,
    deletions: 0,
  };
}

function changedFile(path: string, oldStart: number, lines: string[], context = ''): SeedPrFile {
  return {
    path,
    patch: hunk(oldStart, oldStart, lines, context),
    additions: lines.filter((l) => l.startsWith('+')).length,
    deletions: lines.filter((l) => l.startsWith('-')).length,
  };
}

export const REFUND_PR: SeedPr = {
  number: 483,
  title: 'Add partial refunds for captured payments',
  author: 'dev.olsen',
  branch: 'feat/partial-refunds',
  headSha: 'b483c0ffee01',
  body: 'Adds `refundPayment` so support can issue partial refunds. Tests included.',
  commit: 'Add refundPayment with test',
  files: [
    newFile('src/payments/refund.ts', [
      "import type { PaymentsRepo } from './repo.js';",
      '',
      'export class RefundError extends Error {}',
      '',
      'export async function refundPayment(',
      '  repo: PaymentsRepo,',
      '  paymentId: string,',
      '  amountCents: number,',
      "): Promise<{ status: 'refunded' | 'pending_review' }> {",
      '  const payment = await repo.get(paymentId);',
      "  if (!payment) throw new RefundError('payment not found');",
      "  if (amountCents <= 0) throw new RefundError('amount must be positive');",
      '  const refundable = payment.capturedCents - payment.refundedCents;',
      '  if (amountCents > refundable) {',
      '    throw new RefundError(`cannot refund more than ${refundable}`);',
      '  }',
      "  if (payment.status === 'disputed') {",
      '    await repo.flagForReview(paymentId);',
      "    return { status: 'pending_review' };",
      '  }',
      '  await repo.addRefund(paymentId, amountCents);',
      "  return { status: 'refunded' };",
      '}',
    ]),
    newFile('test/refund.test.ts', [
      "import { describe, it, expect, vi } from 'vitest';",
      "import { refundPayment } from '../src/payments/refund.js';",
      '',
      "describe('refundPayment', () => {",
      "  it('refunds a captured payment', async () => {",
      '    const repo = {',
      "      get: vi.fn().mockResolvedValue({ status: 'captured', capturedCents: 5000, refundedCents: 0 }),",
      '      addRefund: vi.fn().mockResolvedValue(undefined),',
      '      flagForReview: vi.fn(),',
      '    };',
      "    const res = await refundPayment(repo as never, 'pay_1', 2000);",
      "    expect(res.status).toBe('refunded');",
      '  });',
      '});',
    ]),
  ],
};

export const CONTRACT_PR: SeedPr = {
  number: 484,
  title: 'Clean up payments route naming',
  author: 'sam.rivera',
  branch: 'chore/payments-naming',
  headSha: 'c484deadbeef',
  body: 'Small cleanup: clearer param naming and integer cents everywhere. No behaviour change.',
  commit: 'Rename payment param and use integer cents',
  files: [
    changedFile(
      'src/api/payments.ts',
      12,
      [
        "-  app.get('/payments/:id', async (req) => {",
        '-    const { id } = req.params as { id: string };',
        '-    const payment = await repo.get(id);',
        "+  app.get('/payments/:paymentId', async (req) => {",
        '+    const { paymentId } = req.params as { paymentId: string };',
        '+    const payment = await repo.get(paymentId);',
        '     if (!payment) throw app.httpErrors.notFound();',
        '     return {',
        '       id: payment.id,',
        '-      amount: payment.amountCents / 100,',
        '+      amount_cents: payment.amountCents,',
        '       currency: payment.currency,',
        '       status: payment.status,',
        '     };',
        '   });',
        '',
        "   app.post('/payments/:id/capture', async (req) => {",
        '     const { id } = req.params as { id: string };',
        '-    const { amount } = req.body as { amount: number };',
        '-    return repo.capture(id, Math.round(amount * 100));',
        '+    const { amount_cents } = req.body as { amount_cents: number };',
        '+    return repo.capture(id, amount_cents);',
        '   });',
      ].map((l) => (l === '' ? ' ' : l)),
      'export async function paymentsRoutes(app: FastifyInstance) {',
    ),
  ],
};

export const SEED_FIXTURE_PRS: SeedPr[] = [REFUND_PR, CONTRACT_PR];
