/**
 * Unified-diff hunks for the seeded PR #482 (acme/payments-api), stored in
 * pr_files.patch. The demo repo is never cloned, so this is the diff a review
 * sees (diff-loader falls back to pr_files) and what "Files changed" renders.
 *
 * Line numbers matter: the seeded findings (src/config.ts:12,
 * src/api/users.ts:45-52) and the mock LLM's findings
 * (adapters/llm/mock.ts → src/middleware/ratelimit.ts:4 and :7) must land
 * inside these hunks or the grounding gate drops them
 * (test/mock-llm-provider.test.ts checks this).
 */
export const SEED_PR_482_PATCHES: Record<string, string> = {
  'src/middleware/ratelimit.ts': [
    '@@ -0,0 +1,15 @@',
    "+import type { FastifyRequest, FastifyReply } from 'fastify';",
    "+import { config } from '../config';",
    '+',
    '+const buckets = new Map<string, { tokens: number; updatedAt: number }>();',
    '+',
    '+export async function rateLimit(req: FastifyRequest, reply: FastifyReply) {',
    "+  const key = (req.headers['x-forwarded-for'] as string) ?? req.ip;",
    '+  const now = Date.now();',
    '+  const bucket = buckets.get(key) ?? { tokens: config.rateLimitBurst, updatedAt: now };',
    '+  bucket.tokens = Math.min(config.rateLimitBurst, bucket.tokens + ((now - bucket.updatedAt) / 60_000) * config.rateLimitPerMinute);',
    '+  bucket.updatedAt = now;',
    "+  if (bucket.tokens < 1) return reply.code(429).send({ error: 'rate_limited' });",
    '+  bucket.tokens -= 1;',
    '+  buckets.set(key, bucket);',
    '+}',
  ].join('\n'),
  'src/api/public/webhooks.ts': [
    '@@ -1,4 +1,6 @@',
    " import { FastifyInstance } from 'fastify';",
    "+import { rateLimit } from '../../middleware/ratelimit';",
    ' ',
    ' export async function webhooksRoutes(app: FastifyInstance) {',
    "-  app.post('/webhooks/stripe', handleStripe);",
    "+  app.post('/webhooks/stripe', { preHandler: rateLimit }, handleStripe);",
    "+  app.post('/webhooks/github', { preHandler: rateLimit }, handleGithub);",
  ].join('\n'),
  'src/config.ts': [
    '@@ -9,4 +9,7 @@ export const config = {',
    '   port: Number(process.env.PORT ?? 3000),',
    '   redisUrl: process.env.REDIS_URL,',
    "   logLevel: process.env.LOG_LEVEL ?? 'info',",
    "+  stripeKey: 'sk_live_REDACTED_FOR_DEMO',",
    '+  rateLimitPerMinute: 60,',
    '+  rateLimitBurst: 20,',
    ' };',
  ].join('\n'),
  'src/api/users.ts': [
    '@@ -43,5 +43,8 @@ export async function listUsers(req: FastifyRequest) {',
    '   const users = await db.select().from(usersTable).limit(50);',
    '-  const out = [];',
    '-  for (const u of users) out.push(u);',
    '+  const out = [];',
    '+  for (const u of users) {',
    '+    const orgs = await db.select().from(orgsTable).where(eq(orgsTable.userId, u.id));',
    '+    out.push({ ...u, orgs });',
    '+  }',
    '   return out;',
    ' }',
  ].join('\n'),
};
