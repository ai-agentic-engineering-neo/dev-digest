/**
 * Demo PRs for the skills control experiment.
 *
 * Each one is built so that a GENERAL reviewer prompt plausibly passes it, and
 * the linked skill is what turns the miss into a finding. They carry real
 * `patch` text: `diffFromPrFiles` reconstructs the unified diff from these
 * hunks, so a review can run against a seeded workspace with no clone and no
 * GitHub token.
 */

export interface SeedPrFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string;
}

export interface SeedPr {
  number: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  headSha: string;
  body: string;
  files: SeedPrFile[];
  commitMessage: string;
}

/**
 * PR #483 — Test Quality. `refundPayment` has three branches; the test file
 * exercises exactly one of them. Nothing here is *wrong*, which is the point:
 * without the test-quality skill there is no defect to report.
 */
const HAPPY_PATH_ONLY_PR: SeedPr = {
  number: 483,
  title: 'Add refundPayment helper',
  author: 'dan.okafor',
  branch: 'feat/refund-helper',
  base: 'main',
  headSha: 'b7c1d9a4f2e8',
  body:
    'Adds a small helper for issuing refunds, with unit tests. ' +
    'Straightforward change — the tests pass and coverage is green.',
  commitMessage: 'Add refundPayment helper + tests',
  files: [
    {
      path: 'src/payments/refund.ts',
      additions: 24,
      deletions: 0,
      patch: `@@ -0,0 +1,24 @@
+import { getPayment, createRefund } from './gateway';
+
+export interface RefundResult {
+  refundId: string;
+  amount: number;
+}
+
+/** Refund a captured payment, in full or in part. */
+export async function refundPayment(paymentId: string, amount: number): Promise<RefundResult> {
+  const payment = await getPayment(paymentId);
+
+  if (payment.status !== 'captured') {
+    throw new Error(\`Payment \${paymentId} is not captured\`);
+  }
+
+  if (amount <= 0 || amount > payment.amount) {
+    throw new Error('Refund amount out of range');
+  }
+
+  const refund = await createRefund(paymentId, amount);
+  return { refundId: refund.id, amount };
+}
+
+export const MAX_PARTIAL_REFUNDS = 5;`,
    },
    {
      path: 'src/payments/refund.test.ts',
      additions: 14,
      deletions: 0,
      patch: `@@ -0,0 +1,14 @@
+import { describe, it, expect, vi } from 'vitest';
+import { refundPayment } from './refund';
+
+vi.mock('./gateway', () => ({
+  getPayment: vi.fn(async () => ({ status: 'captured', amount: 1000 })),
+  createRefund: vi.fn(async () => ({ id: 're_123' })),
+}));
+
+describe('refundPayment', () => {
+  it('refunds a captured payment', async () => {
+    const result = await refundPayment('pay_1', 500);
+    expect(result.refundId).toBe('re_123');
+  });
+});`,
    },
  ],
};

/**
 * PR #484 — API Contract. `currency` goes from optional-with-a-default to
 * required, and the success status changes 200 → 201. Both are invisible unless
 * you compare the two signatures line by line, which is exactly what the
 * api-contract-gate skill asks for.
 */
const BREAKING_SIGNATURE_PR: SeedPr = {
  number: 484,
  title: 'Tidy up the create-payment route schema',
  author: 'priya.raman',
  branch: 'chore/payment-schema-tidy',
  base: 'main',
  headSha: 'c3f8e0b6a719',
  body:
    'Small cleanup of the create-payment route: make the schema explicit and ' +
    'return a more correct status code. No functional change.',
  commitMessage: 'Tidy create-payment route schema',
  files: [
    {
      path: 'src/api/payments/routes.ts',
      additions: 9,
      deletions: 7,
      patch: `@@ -12,17 +12,19 @@ import { PaymentService } from './service';
 const CreatePaymentBody = z.object({
   amount: z.number().int().positive(),
-  currency: z.string().default('USD'),
-  description: z.string().optional(),
+  currency: z.enum(['USD', 'EUR', 'GBP']),
+  memo: z.string().optional(),
 });

 export default async function paymentRoutes(app: FastifyInstance) {
   const service = new PaymentService(app.container);

-  app.post('/payments', { schema: { body: CreatePaymentBody } }, async (req) => {
+  app.post('/payments', { schema: { body: CreatePaymentBody } }, async (req, reply) => {
     const payment = await service.create(req.body);
-    return payment;
+    reply.status(201);
+    return { payment };
   });`,
    },
    {
      path: 'src/api/payments/service.ts',
      additions: 3,
      deletions: 3,
      patch: `@@ -8,9 +8,9 @@ export class PaymentService {
   async create(input: CreatePaymentInput) {
-    const currency = input.currency ?? 'USD';
-    const row = await this.repo.insert({ ...input, currency });
-    return { id: row.id, amount: row.amount, currency: row.currency, description: row.description };
+    const row = await this.repo.insert({ ...input, currency: input.currency });
+    return { id: row.id, amount: row.amount, currency: row.currency, memo: row.memo };
   }`,
    },
  ],
};

export const CONTROL_PRS: SeedPr[] = [HAPPY_PATH_ONLY_PR, BREAKING_SIGNATURE_PR];
