/**
 * Demo pull requests for the M2 control experiment, seeded on
 * `acme/payments-api` by `seed.ts`. Pure data, no imports.
 *
 * Each file carries a real GitHub-style patch, so `loadDiff` can rebuild the
 * diff from `pr_files` without a clone.
 * - #483 adds a refunds endpoint and a test that covers only the happy path
 *   (Test Quality Reviewer, with and without its skills).
 * - #484 renames a route parameter and changes the response shape
 *   (General Reviewer, with and without the API-contract skills).
 */

export interface DemoPrFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string;
}

export interface DemoPr {
  number: number;
  title: string;
  author: string;
  branch: string;
  headSha: string;
  body: string;
  commitMessage: string;
  files: DemoPrFile[];
}

/**
 * One hunk from prefixed lines (' ' context, '+' added, '-' removed); the
 * header's line counts are computed, so they always match the body.
 */
function hunk(oldStart: number, newStart: number, lines: string[]): string {
  const oldCount = lines.filter((l) => !l.startsWith('+')).length;
  const newCount = lines.filter((l) => !l.startsWith('-')).length;
  return [`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`, ...lines].join('\n');
}

/** A file built from hunks, with its addition/deletion counts. */
function file(path: string, hunks: { oldStart: number; newStart: number; lines: string[] }[]): DemoPrFile {
  const all = hunks.flatMap((h) => h.lines);
  return {
    path,
    additions: all.filter((l) => l.startsWith('+')).length,
    deletions: all.filter((l) => l.startsWith('-')).length,
    patch: hunks.map((h) => hunk(h.oldStart, h.newStart, h.lines)).join('\n'),
  };
}

/** A new file: every line added. */
function newFile(path: string, source: string): DemoPrFile {
  return file(path, [{ oldStart: 0, newStart: 1, lines: source.split('\n').map((l) => `+${l}`) }]);
}

const REFUNDS_ROUTE = `import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { payments, refunds } from '../db/index.js';
import { stripe } from '../lib/stripe.js';

const RefundBody = z.object({
  amount_cents: z.number().int().positive(),
  reason: z.string().max(200).optional(),
});

export default async function refundRoutes(app: FastifyInstance) {
  app.post('/payments/:id/refunds', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = RefundBody.parse(req.body);
    const key = req.headers['idempotency-key'];

    const payment = await payments.findById(id);
    if (!payment) {
      return reply.code(404).send({ error: 'payment_not_found' });
    }
    if (payment.status !== 'captured') {
      return reply.code(409).send({ error: 'payment_not_captured' });
    }

    if (typeof key === 'string') {
      const previous = await refunds.findByIdempotencyKey(key);
      if (previous) return reply.code(200).send(previous);
    }

    const refunded = await refunds.sumForPayment(id);
    if (refunded + body.amount_cents > payment.amount_cents) {
      return reply.code(400).send({ error: 'refund_exceeds_payment' });
    }

    try {
      const result = await stripe.refunds.create({
        payment_intent: payment.stripe_intent_id,
        amount: body.amount_cents,
      });
      const refund = await refunds.insert({
        paymentId: id,
        amountCents: body.amount_cents,
        reason: body.reason ?? null,
        stripeRefundId: result.id,
        idempotencyKey: typeof key === 'string' ? key : null,
      });
      return reply.code(201).send(refund);
    } catch (err) {
      req.log.error({ err, paymentId: id }, 'stripe refund failed');
      return reply.code(502).send({ error: 'refund_provider_failed' });
    }
  });
}`;

const REFUNDS_TEST = `import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import refundRoutes from '../src/api/refunds.js';
import { payments, refunds } from '../src/db/index.js';
import { stripe } from '../src/lib/stripe.js';

vi.mock('../src/db/index.js');
vi.mock('../src/lib/stripe.js');

describe('POST /payments/:id/refunds', () => {
  it('refunds a captured payment', async () => {
    vi.mocked(payments.findById).mockResolvedValue({
      id: 'pay_1',
      status: 'captured',
      amount_cents: 5000,
      stripe_intent_id: 'pi_1',
    } as never);
    vi.mocked(refunds.sumForPayment).mockResolvedValue(0);
    vi.mocked(stripe.refunds.create).mockResolvedValue({ id: 're_1' } as never);
    vi.mocked(refunds.insert).mockResolvedValue({ id: 'ref_1', amountCents: 1000 } as never);

    const app = Fastify();
    await app.register(refundRoutes);
    const res = await app.inject({
      method: 'POST',
      url: '/payments/pay_1/refunds',
      payload: { amount_cents: 1000 },
    });

    await new Promise((r) => setTimeout(r, 200));
    expect(res.statusCode).toBe(201);
    expect(refunds.insert).toHaveBeenCalled();
  });
});`;

const PR_483: DemoPr = {
  number: 483,
  title: 'Add partial refunds endpoint',
  author: 'dev.okafor',
  branch: 'feat/partial-refunds',
  headSha: 'b4e83c0f9a21',
  body:
    'Adds POST /payments/:id/refunds so support can issue partial refunds through Stripe. ' +
    'Guards against refunding more than was captured and supports an Idempotency-Key header.',
  commitMessage: 'Add partial refunds endpoint with a test',
  files: [
    newFile('src/api/refunds.ts', REFUNDS_ROUTE),
    newFile('test/refunds.test.ts', REFUNDS_TEST),
    file('src/app.ts', [
      {
        oldStart: 6,
        newStart: 6,
        lines: [
          " import paymentRoutes from './api/payments.js';",
          "+import refundRoutes from './api/refunds.js';",
          " import invoiceRoutes from './api/invoices.js';",
        ],
      },
      {
        oldStart: 24,
        newStart: 25,
        lines: [
          '   await app.register(paymentRoutes);',
          '+  await app.register(refundRoutes);',
          '   await app.register(invoiceRoutes);',
        ],
      },
    ]),
  ],
};

const PR_484: DemoPr = {
  number: 484,
  title: 'Paginate customer invoices',
  author: 'lena.brandt',
  branch: 'feat/invoice-pagination',
  headSha: 'c7d21a9e4b58',
  body:
    'Invoices for large customers time out. This paginates GET /customers/:id/invoices with a cursor ' +
    'and switches amounts to integer cents.',
  commitMessage: 'Paginate customer invoices and return amounts in cents',
  files: [
    file('src/api/invoices.ts', [
      {
        oldStart: 1,
        newStart: 1,
        lines: [
          " import type { FastifyInstance } from 'fastify';",
          "-import { InvoiceList } from '../schemas/invoice.js';",
          "+import { InvoicePage, InvoiceQuery } from '../schemas/invoice.js';",
          " import { invoices } from '../db/index.js';",
          ' ',
          ' export default async function invoiceRoutes(app: FastifyInstance) {',
          '-  app.get(',
          "-    '/customers/:customerId/invoices',",
          '-    { schema: { response: { 200: InvoiceList } } },',
          '-    async (req) => {',
          '-      const { customerId } = req.params as { customerId: string };',
          '-      const rows = await invoices.listForCustomer(customerId);',
          '-      return rows.map((r) => ({ id: r.id, amount: r.amountCents / 100, status: r.status }));',
          '-    },',
          '-  );',
          '+  app.get(',
          "+    '/customers/:id/invoices',",
          '+    { schema: { querystring: InvoiceQuery, response: { 200: InvoicePage } } },',
          '+    async (req) => {',
          '+      const { customerId } = req.params as { customerId: string };',
          '+      const { cursor, limit } = req.query as { cursor?: string; limit: number };',
          '+      const rows = await invoices.listForCustomer(customerId, { cursor, limit: limit + 1 });',
          '+      const items = rows.slice(0, limit).map((r) => ({',
          '+        id: r.id,',
          '+        amount_cents: r.amountCents,',
          '+        status: r.status,',
          '+      }));',
          '+      const next_cursor = rows.length > limit ? rows[limit - 1]!.id : null;',
          '+      return { items, next_cursor };',
          '+    },',
          '+  );',
          ' }',
        ],
      },
    ]),
    file('src/schemas/invoice.ts', [
      {
        oldStart: 1,
        newStart: 1,
        lines: [
          " import { z } from 'zod';",
          ' ',
          ' export const Invoice = z.object({',
          '   id: z.string(),',
          '-  amount: z.number(),',
          '+  amount_cents: z.number().int(),',
          "   status: z.enum(['draft', 'open', 'paid', 'void']),",
          ' });',
          ' ',
          '-export const InvoiceList = z.array(Invoice);',
          '+export const InvoiceQuery = z.object({',
          '+  cursor: z.string().optional(),',
          '+  limit: z.coerce.number().int().min(1).max(100).default(25),',
          '+});',
          '+',
          '+export const InvoicePage = z.object({',
          '+  items: z.array(Invoice),',
          '+  next_cursor: z.string().nullable(),',
          '+});',
        ],
      },
    ]),
  ],
};

export const DEMO_PRS: DemoPr[] = [PR_483, PR_484];
