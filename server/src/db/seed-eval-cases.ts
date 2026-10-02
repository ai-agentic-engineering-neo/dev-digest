/**
 * specs/12-eval-pipeline.md D22/Q4 — the seven fixture eval cases for the
 * `Security Reviewer` agent, plus the fixture PR (#491, on the EXISTING
 * `acme/payments-api` repo — planner recommendation, see plans/12's Q4:
 * three e2e flows assume "acme/payments-api is the FIRST repo", and
 * `RepoRepository.list` has no `ORDER BY`, so a second seeded REPO is a
 * coin-flip; a second PR in the same repo is safe because those flows
 * navigate by clicking the PR title, not row index) whose `pr_files.patch`
 * carries REAL diff text — unlike the seeded PR #482, which has `patch: null`
 * on every row (server/LEARNINGS.md, 2026-08-04) and would be refused by
 * AC-6 (zero hunks, no expectation can ground).
 *
 * Kept separate from `seed.ts` for the same reason `seed-prompts.ts` /
 * `seed-skills.ts` are: the fixture DATA is bulky and unrelated to the
 * seeding CONTROL FLOW.
 */

export interface EvalFixtureFile {
  path: string;
  additions: number;
  deletions: number;
  /** GitHub-shaped patch text: hunks only, no `diff --git`/`---`/`+++`
   *  header (the same shape `pr_files.patch` stores for a real import). */
  patch: string;
}

export const EVAL_FIXTURE_PR = {
  number: 491,
  title: 'Fix session token handling in the auth middleware',
  author: 'priya.nair',
  branch: 'fix/session-token-ttl',
  base: 'main',
  headSha: 'f491c0de491f',
  body:
    'Rotates the session-signing secret, adds rate limiting to the refresh-token ' +
    'endpoint, and documents the new session TTL. Follow-up to the incident review.',
  files: [
    {
      path: 'src/middleware/session.ts',
      additions: 6,
      deletions: 3,
      patch: `@@ -1,10 +1,14 @@
 import jwt from 'jsonwebtoken';
+import { randomBytes } from 'crypto';

-const SESSION_SECRET = 'dev-secret';
+const SESSION_SECRET = 'sk_live_51HxampleNotARealKeyDoNotUse00';

 export function createSession(userId: string) {
-  return jwt.sign({ userId }, SESSION_SECRET, { expiresIn: '30d' });
+  return jwt.sign({ userId }, SESSION_SECRET, { expiresIn: '365d' });
 }

 export function verifySession(token: string) {
   return jwt.verify(token, SESSION_SECRET);
 }`,
    },
    {
      path: 'src/api/public/refresh-token.ts',
      additions: 3,
      deletions: 1,
      patch: `@@ -1,6 +1,9 @@
 import { Router } from 'express';
+import { rateLimiter } from '../../middleware/ratelimit';

 const router = Router();

-router.post('/refresh', async (req, res) => {
+router.post('/refresh', rateLimiter, async (req, res) => {
   const { refreshToken } = req.body;
+  console.log('refresh token payload', req.body);
   const session = await renewSession(refreshToken);
   res.json({ token: session.token });
 });`,
    },
    {
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: `@@ -1,4 +1,5 @@
 export const config = {
   port: 3000,
+  sessionTtlDays: 365,
 };`,
    },
  ] satisfies EvalFixtureFile[],
};

export interface EvalCaseFixture {
  name: string;
  file: string;
  type: 'must_find' | 'must_not_flag';
  start_line: number;
  end_line: number;
  severity: string;
  category: string;
  title: string;
}

/** Both expectation types are represented (D22: at least one of each). */
export const EVAL_FIXTURE_CASES: EvalCaseFixture[] = [
  {
    name: 'hardcoded-session-signing-secret',
    file: 'src/middleware/session.ts',
    type: 'must_find',
    start_line: 4,
    end_line: 4,
    severity: 'CRITICAL',
    category: 'security',
    title: 'Hardcoded secret key in session module',
  },
  {
    name: 'session-token-ttl-extended-to-a-year',
    file: 'src/middleware/session.ts',
    type: 'must_find',
    start_line: 7,
    end_line: 7,
    severity: 'WARNING',
    category: 'security',
    title: 'Session token TTL extended to 365 days',
  },
  {
    name: 'verify-session-signature-is-clean',
    file: 'src/middleware/session.ts',
    type: 'must_not_flag',
    start_line: 10,
    end_line: 11,
    severity: 'SUGGESTION',
    category: 'security',
    title: 'verifySession() signature is unchanged and not itself a finding',
  },
  {
    name: 'crypto-import-is-clean',
    file: 'src/middleware/session.ts',
    type: 'must_not_flag',
    start_line: 2,
    end_line: 2,
    severity: 'SUGGESTION',
    category: 'security',
    title: "Importing 'crypto' is not itself a security issue",
  },
  {
    name: 'refresh-token-payload-logged-in-plaintext',
    file: 'src/api/public/refresh-token.ts',
    type: 'must_find',
    start_line: 8,
    end_line: 8,
    severity: 'WARNING',
    category: 'security',
    title: 'Refresh-token request payload logged in plaintext',
  },
  {
    name: 'rate-limiter-addition-is-clean',
    file: 'src/api/public/refresh-token.ts',
    type: 'must_not_flag',
    start_line: 6,
    end_line: 6,
    severity: 'SUGGESTION',
    category: 'security',
    title: 'Adding rate-limiting middleware is not itself a vulnerability',
  },
  {
    name: 'config-session-ttl-year-long',
    file: 'src/config.ts',
    type: 'must_find',
    start_line: 3,
    end_line: 3,
    severity: 'WARNING',
    category: 'security',
    title: 'sessionTtlDays configured to a year is excessive',
  },
];
