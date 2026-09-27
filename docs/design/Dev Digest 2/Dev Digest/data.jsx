/* data.jsx — realistic mock data for DevDigest screens */

const REPO = { owner: "acme", name: "payments-api", full: "acme/payments-api", branch: "main" };

const PR = {
  number: 482,
  title: "Add rate limiting to public API endpoints",
  author: "marisa.koch",
  branch: "feat/rate-limit-public",
  base: "main",
  additions: 247,
  deletions: 38,
  files: 9,
  openedAgo: "3h ago",
  status: "needs_review",
  commits: 6,
};

const VERDICT = {
  verdict: "request_changes",
  summary: "Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter. Two blockers before merge.",
  score: 61,
  cost: 0.014,
  tokens_in: 8200,
  tokens_out: 1300,
};

const INTENT = {
  intent: "Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.",
  in_scope: [
    "Add middleware for rate limiting",
    "Apply to /api/public/* routes",
    "Return 429 with Retry-After header",
  ],
  out_of_scope: [
    "Authentication changes",
    "Adding new endpoints",
    "Logging / observability for the limiter",
  ],
};

const RISKS = [
  { kind: "security", title: "Auth surface touched", explanation: "Middleware sits in front of `/api/public/*` and reads the `Authorization` header to bucket anonymous vs. authed traffic. A bug here changes who gets through.", severity: "high", file_refs: ["src/middleware/ratelimit.ts:12-18"], anchor: { file: "src/middleware/ratelimit.ts", line: 25 } },
  { kind: "deps", title: "New dependency: ioredis", explanation: "Adds `ioredis@5.4.1` for the distributed token bucket. Pulls 4 transitive deps; review the lockfile diff.", severity: "medium", file_refs: ["package.json:34"], anchor: { file: "package.json", line: null } },
  { kind: "perf", title: "Adds Redis round-trip per request", explanation: "Each public request now does a Redis `INCR`+`EXPIRE`. Co-located Redis keeps this <1ms, but cross-AZ would hurt p99.", severity: "low", file_refs: ["src/middleware/ratelimit.ts:40-52"], anchor: { file: "src/middleware/ratelimit.ts", line: 52 } },
];

// review_focus[] — the brief's "read these first" reading order (NOT alphabetical).
// Each entry deep-links to file:line in the Files-changed diff.
const REVIEW_FOCUS = [
  { file: "src/config.ts", line: 12, reason: "live Stripe key (sk_live_…) committed in plaintext" },
  { file: "src/api/public/webhooks.ts", line: 61, reason: "request callback_url forwards the account token to a caller-controlled URL" },
  { file: "src/middleware/ratelimit.ts", line: 52, reason: "429 branch omits the Retry-After header the PR scope promises" },
  { file: "src/api/users.ts", line: 46, reason: "N+1 query — one posts lookup per user, hit harder under the new limiter" },
];

const BLAST = {
  changed_symbols: [
    { name: "rateLimit", file: "src/middleware/ratelimit.ts", kind: "function" },
    { name: "bucketKey", file: "src/middleware/ratelimit.ts", kind: "function" },
  ],
  summary: "2 functions changed → 14 callers, 3 endpoints, 1 cron",
  downstream: [
    {
      symbol: "rateLimit",
      callers: [
        { name: "publicRouter", file: "src/api/public/index.ts", line: 23 },
        { name: "webhookHandler", file: "src/api/public/webhooks.ts", line: 45 },
        { name: "healthCheck", file: "src/api/public/health.ts", line: 11 },
        { name: "app", file: "src/server.ts", line: 88 },
      ],
      endpoints_affected: ["GET /api/public/items", "POST /api/public/webhooks", "GET /api/public/health"],
      crons_affected: ["reset-rate-buckets (hourly)"],
    },
    {
      symbol: "bucketKey",
      callers: [
        { name: "rateLimit", file: "src/middleware/ratelimit.ts", line: 41 },
        { name: "resetBuckets", file: "src/jobs/reset-buckets.ts", line: 8 },
      ],
      endpoints_affected: [],
      crons_affected: ["reset-rate-buckets (hourly)"],
    },
  ],
};

const FINDINGS = [
  {
    id: "f1", severity: "CRITICAL", category: "security", title: "Hardcoded Stripe secret key in commit",
    file: "src/config.ts", start_line: 12, end_line: 12, confidence: 0.98,
    rationale: "Line 12 contains a literal string starting with `sk_live_`, which appears to be a Stripe **secret key**. Committing this exposes it to anyone with read access to the repo — including via git history even after a later removal.",
    suggestion: "Move the key to an environment variable. Add `STRIPE_SECRET_KEY=...` to your `.env` and reference it via `process.env.STRIPE_SECRET_KEY`. **Rotate the key immediately** — assume it's already compromised.",
    kind: "secret_leak",
  },
  {
    id: "f2", severity: "CRITICAL", category: "security", title: "Lethal trifecta: untrusted input reaches exfil path",
    file: "src/api/public/webhooks.ts", start_line: 61, end_line: 74, confidence: 0.79,
    rationale: "The webhook handler reads attacker-controllable `req.body.callback_url` (untrusted input), loads the account's API token from the DB (private data), and issues an outbound `fetch()` to that URL (exfil path). All three legs of the lethal trifecta are present in one request flow.",
    suggestion: "Allow-list `callback_url` against pre-registered endpoints, or strip credentials before any outbound request derived from request input.",
    kind: "lethal_trifecta",
    trifecta_components: ["private_data_access", "untrusted_input", "exfil_path"],
    evidence: [
      { component: "untrusted_input", file: "src/api/public/webhooks.ts", line: 61 },
      { component: "private_data_access", file: "src/api/public/webhooks.ts", line: 68 },
      { component: "exfil_path", file: "src/api/public/webhooks.ts", line: 73 },
    ],
  },
  {
    id: "f3", severity: "WARNING", category: "perf", title: "N+1 query in user list endpoint",
    file: "src/api/users.ts", start_line: 45, end_line: 52, confidence: 0.86,
    rationale: "The loop on line 46 calls `db.posts.findMany({ userId })` once per user. For a user list of N items, this creates **N+1 queries**. Under the new rate limiter this endpoint will be hit harder and the query count will dominate response time.",
    suggestion: "Replace with a single query using `IN`: `db.posts.findMany({ where: { userId: { in: userIds } } })`, then group by `userId` in memory.",
  },
  {
    id: "f4", severity: "WARNING", category: "bug", title: "Retry-After header omitted on 429",
    file: "src/middleware/ratelimit.ts", start_line: 52, end_line: 52, confidence: 0.81,
    rationale: "The PR intent explicitly lists \"Return 429 with `Retry-After` header\" as in-scope, but the 429 branch sets only the status code. Clients can't back off correctly.",
    suggestion: "Set `res.setHeader('Retry-After', String(retryAfterSeconds))` before returning the 429.",
  },
  {
    id: "f5", severity: "SUGGESTION", category: "style", title: "Extract magic number 3600",
    file: "src/middleware/ratelimit.ts", start_line: 28, end_line: 28, confidence: 0.62,
    rationale: "The number `3600` appears twice without explanation. A reader has to infer it means seconds-in-an-hour.",
    suggestion: "Extract as `const WINDOW_SECONDS = 3600` at the top of the file.",
  },
  {
    id: "f6", severity: "SUGGESTION", category: "test", title: "No test covers the 429 path",
    file: "test/ratelimit.test.ts", start_line: 1, end_line: 1, confidence: 0.7,
    rationale: "New middleware has tests for the happy path but none asserting a 429 is returned once the bucket is exhausted.",
    suggestion: "Add a test that fires `limit + 1` requests and asserts the last response is `429`.",
  },
];

const DIFF = {
  groups: [
    { role: "core", files: [
      { path: "src/middleware/ratelimit.ts", pseudocode_summary: "New token-bucket limiter: read bucketKey → Redis INCR → if over limit return 429, else next().", additions: 84, deletions: 0, finding_lines: [28, 52] },
      { path: "src/api/public/webhooks.ts", pseudocode_summary: "Forward webhook to caller-supplied callback_url with account token attached.", additions: 31, deletions: 6, finding_lines: [61, 73] },
    ]},
    { role: "wiring", files: [
      { path: "src/api/public/index.ts", additions: 12, deletions: 2, finding_lines: [] },
      { path: "src/server.ts", additions: 8, deletions: 1, finding_lines: [] },
      { path: "src/config.ts", additions: 4, deletions: 0, finding_lines: [12] },
    ]},
    { role: "boilerplate", files: [
      { path: "package.json", additions: 3, deletions: 1, finding_lines: [] },
      { path: "package-lock.json", additions: 92, deletions: 24, finding_lines: [] },
      { path: "src/api/users.ts", additions: 7, deletions: 2, finding_lines: [45] },
      { path: "test/ratelimit.test.ts", additions: 6, deletions: 0, finding_lines: [] },
    ]},
  ],
  split_suggestion: {
    too_big: false, total_lines: 285,
    proposed_splits: [
      { name: "rate limiter core", files: ["src/middleware/ratelimit.ts", "src/api/public/index.ts"] },
      { name: "webhook forwarding", files: ["src/api/public/webhooks.ts"] },
    ],
  },
};

const HISTORY = [
  { pr_number: 401, title: "Introduce public API namespace", merged_at: "2026-03-18", author: "deepak.r", files_overlap: ["src/api/public/index.ts", "src/server.ts"], notes: "Original `/api/public/*` split-out. Established the router this PR hooks into." },
  { pr_number: 356, title: "Add ioredis client for session cache", merged_at: "2026-02-02", author: "marisa.koch", files_overlap: ["package.json"], notes: "Redis client already lives here — **reuse `src/lib/redis.ts`** instead of constructing a second connection." },
  { pr_number: 288, title: "Webhook forwarding for connect accounts", merged_at: "2025-12-11", author: "tomek.w", files_overlap: ["src/api/public/webhooks.ts"], notes: "Last change to webhooks. SSRF concern was raised in review then but deferred — relevant to finding f2." },
];

// ---- code snippets for diff rendering ----
const CODE_SNIPPETS = {
  "src/middleware/ratelimit.ts": [
    { n: 24, t: "" , s: "" },
    { n: 25, t: "export async function rateLimit(req: Req, res: Res, next: Next) {", s: "" },
    { n: 26, t: "  const key = bucketKey(req);", s: "add" },
    { n: 27, t: "  const count = await redis.incr(key);", s: "add" },
    { n: 28, t: "  if (count === 1) await redis.expire(key, 3600);", s: "add", finding: "f5" },
    { n: 29, t: "", s: "" },
    { n: 30, t: "  if (count > limitFor(req)) {", s: "add" },
    { n: 52, t: "    return res.status(429).end();", s: "add", finding: "f4" },
    { n: 53, t: "  }", s: "add" },
    { n: 54, t: "  return next();", s: "add" },
    { n: 55, t: "}", s: "" },
  ],
  "src/config.ts": [
    { n: 10, t: "export const config = {", s: "" },
    { n: 11, t: "  port: Number(process.env.PORT ?? 3000),", s: "" },
    { n: 12, t: '  stripeKey: "sk_live_51H8xq2Ka9Vn3PqLm7Rd0bZ4Xc",', s: "add", finding: "f1" },
    { n: 13, t: "  redisUrl: process.env.REDIS_URL,", s: "" },
    { n: 14, t: "};", s: "" },
  ],
  "src/api/public/webhooks.ts": [
    { n: 60, t: "export async function webhookHandler(req: Req, res: Res) {", s: "" },
    { n: 61, t: "  const target = req.body.callback_url;", s: "add", finding: "f2" },
    { n: 62, t: "  const account = await db.accounts.find(req.accountId);", s: "" },
    { n: 68, t: "  const token = account.apiToken;", s: "add", finding: "f2" },
    { n: 73, t: "  await fetch(target, { headers: { Authorization: token } });", s: "add", finding: "f2" },
    { n: 74, t: "  return res.status(202).end();", s: "" },
  ],
  "src/api/users.ts": [
    { n: 44, t: "  const users = await db.users.findMany();", s: "" },
    { n: 45, t: "  const result = [];", s: "add" },
    { n: 46, t: "  for (const u of users) {", s: "add", finding: "f3" },
    { n: 47, t: "    const posts = await db.posts.findMany({ userId: u.id });", s: "add", finding: "f3" },
    { n: 48, t: "    result.push({ ...u, posts });", s: "add" },
    { n: 49, t: "  }", s: "add" },
  ],
};

// ---- repo dashboard list ----
const PR_LIST = [
  { number: 482, title: "Add rate limiting to public API endpoints", author: "marisa.koch", size: "M", sizeLines: 285, score: 61, findings: { CRITICAL: 2, WARNING: 2, SUGGESTION: 2 }, status: "needs_review", updated: "3h ago", cost: 0.014 },
  { number: 479, title: "Migrate sessions table to UUID primary key", author: "deepak.r", size: "L", sizeLines: 1240, score: 44, findings: { CRITICAL: 1, WARNING: 4, SUGGESTION: 3 }, status: "needs_review", updated: "6h ago", cost: 0.041 },
  { number: 477, title: "Fix flaky checkout integration test", author: "tomek.w", size: "S", sizeLines: 42, score: 92, findings: { CRITICAL: 0, WARNING: 0, SUGGESTION: 1 }, status: "reviewed", updated: "1d ago", cost: 0.003 },
  { number: 471, title: "Refactor invoice PDF renderer", author: "sara.lin", size: "L", sizeLines: 880, score: 73, findings: { CRITICAL: 0, WARNING: 3, SUGGESTION: 5 }, status: "reviewed", updated: "2d ago", cost: 0.028 },
  { number: 468, title: "Add idempotency keys to charge endpoint", author: "marisa.koch", size: "M", sizeLines: 310, score: 81, findings: { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 }, status: "reviewed", updated: "2d ago", cost: 0.012 },
  { number: 460, title: "Bump node 18 → 20 in CI", author: "deepak.r", size: "S", sizeLines: 18, score: 95, findings: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }, status: "stale", updated: "9d ago", cost: null },
  { number: 455, title: "Webhook retry with exponential backoff", author: "tomek.w", size: "M", sizeLines: 240, score: 68, findings: { CRITICAL: 0, WARNING: 2, SUGGESTION: 4 }, status: "stale", updated: "14d ago", cost: 0.022 },
];

// ---- skills ----
const SKILLS = [
  { id: "s1", name: "pr-quality-rubric", description: "Rubric for evaluating overall PR quality across correctness, tests, and clarity.", type: "rubric", source: "manual", enabled: true, order: 1, version: 5 },
  { id: "s2", name: "no-then-chains", description: "House rule: always use async/await instead of .then() chains.", type: "convention", source: "extracted", enabled: true, order: 2, version: 2, evidence_files: ["src/api/users.ts", "src/lib/redis.ts"] },
  { id: "s3", name: "secret-leakage-gate", description: "Detects sk_live, service_role, and NEXT_PUBLIC_ secret patterns in diffs.", type: "security", source: "community", enabled: true, order: 3, version: 4 },
  { id: "s4", name: "lethal-trifecta", description: "Flags PRs combining private data access, untrusted input, and an exfil path.", type: "security", source: "community", enabled: true, order: 4, version: 3 },
  { id: "s5", name: "phantom-api-gate", description: "Detects imports of functions/modules that don't exist in the resolved deps.", type: "security", source: "imported_url", enabled: false, order: 5, version: 1 },
  { id: "s6", name: "test-coverage-nudge", description: "Suggests tests when new branches lack assertions.", type: "custom", source: "manual", enabled: true, order: 6, version: 2 },
];

const SKILL_BODY = `# PR Quality Rubric

Evaluate the pull request against the following dimensions. For each, return a
finding only when the issue is **worth the author's time** — aim for 5 high-signal
findings, not 50.

## Correctness
- Does the change do what the PR description claims?
- Are edge cases (empty input, nulls, concurrency) handled?

## Security
- Any secrets, tokens, or credentials in the diff?
- Untrusted input reaching a sink (SQL, shell, fetch)?

## Tests
- New branches covered by assertions?
- Are tests meaningful (not just snapshot churn)?

## Scope
- Does the diff stay within the stated intent?
- Flag out-of-scope changes separately rather than blocking.`;

// per-skill detail: body, type, source, and usage stats — drives the skill editor
const SKILL_DETAIL = {
  s1: {
    usedBy: ["Security Reviewer", "Performance Reviewer", "Custom Mentor"], pull: 0.71, accept: 0.74, findings30d: 96, evals: { pass: 17, total: 20 },
    version: 5, versions: [
      { v: 5, date: "2026-05-30", note: "Tightened scope rule; cap at 5 high-signal findings", current: true },
      { v: 4, date: "2026-05-09", note: "Added Tests dimension" },
      { v: 3, date: "2026-04-18", note: "Reworded Correctness checks" },
      { v: 2, date: "2026-03-22", note: "Added Security dimension" },
      { v: 1, date: "2026-03-02", note: "Initial rubric" },
    ],
    body: SKILL_BODY,
  },
  s2: {
    usedBy: ["Performance Reviewer"], pull: 0.34, accept: 0.61, findings30d: 18, evals: { pass: 4, total: 5 },
    version: 2, versions: [
      { v: 2, date: "2026-04-30", note: "Added exceptions for bootstrap promises", current: true },
      { v: 1, date: "2026-01-22", note: "Extracted from codebase scan" },
    ],
    body: `# No .then() chains

House convention extracted from the codebase. Prefer \`async/await\` over
\`.then()\` promise chains for readability and correct error propagation.

## Rule
Flag any new \`.then(\` / \`.catch(\` chain in application code (not tests).

## Good
\`\`\`ts
const user = await db.users.find(id);
const posts = await db.posts.findMany({ userId });
\`\`\`

## Avoid
\`\`\`ts
db.users.find(id).then(user => db.posts.findMany(...)).then(...)
\`\`\`

## Exceptions
- \`.then()\` on a top-level bootstrap promise is fine.
- Library code that must stay framework-agnostic.`,
  },
  s3: {
    usedBy: ["Security Reviewer"], pull: 0.92, accept: 0.88, findings30d: 41, evals: { pass: 6, total: 6 },
    version: 4, versions: [
      { v: 4, date: "2026-05-28", note: "Added NEXT_PUBLIC_ pattern + fixture-file guard", current: true },
      { v: 3, date: "2026-04-12", note: "Added Supabase service_role pattern" },
      { v: 2, date: "2026-02-28", note: "Lowered false positives on .example files" },
      { v: 1, date: "2026-02-10", note: "Imported from secdev/agent-skills" },
    ],
    body: `# Secret Leakage Gate

Detect committed secrets in the diff. This is a **blocking** check — any match
is a CRITICAL finding.

## Patterns
- \`sk_live_\` / \`sk_test_\` — Stripe keys
- \`service_role\` — Supabase service-role keys
- \`NEXT_PUBLIC_\` env vars holding tokens
- 40-char hex strings assigned to \`*_SECRET\`, \`*_TOKEN\`, \`*_KEY\`

## On match
1. Emit a CRITICAL finding at the exact \`file:line\`.
2. Tell the author to rotate the key — assume it is already compromised.
3. Recommend moving it to an environment variable.

## False-positive guard
Ignore values inside \`*.example\`, \`*.sample\`, and fixture files.`,
  },
  s4: {
    usedBy: ["Security Reviewer"], pull: 0.88, accept: 0.83, findings30d: 12, evals: { pass: 5, total: 5 },
    version: 3, versions: [
      { v: 3, date: "2026-05-15", note: "Render three-circle overlap in output", current: true },
      { v: 2, date: "2026-03-30", note: "Added per-leg line attribution" },
      { v: 1, date: "2026-03-11", note: "Initial trifecta detector" },
    ],
    body: `# Lethal Trifecta

Flag a PR when a single request flow combines **all three** of:

1. **Private data access** — reads secrets, tokens, or another user's data
2. **Untrusted input** — attacker-controllable request fields
3. **Exfil path** — an outbound \`fetch\`, email, or log derived from that input

## Output
When all three legs are present, emit a CRITICAL finding and name which line
satisfies each leg. Render the three-circle overlap so the reviewer sees the
combination, not just the parts.

## Mitigations to suggest
- Allow-list outbound destinations.
- Strip credentials before any request derived from user input.`,
  },
  s5: {
    usedBy: [], pull: 0.0, accept: 0.0, findings30d: 0, evals: { pass: 0, total: 4 },
    version: 1, versions: [
      { v: 1, date: "2026-05-20", note: "Draft — resolver not yet wired", current: true },
    ],
    body: `# Phantom API Gate

Detect imports of functions or modules that don't exist in the resolved
dependency tree — a common hallucination pattern in AI-authored PRs.

## Method
1. Parse all new \`import\` / \`require\` statements in the diff.
2. Resolve each against \`package.json\` + the repo's own modules.
3. Flag any symbol that cannot be resolved.

## Status
Disabled — needs the resolver wired to the workspace index first.`,
  },
  s6: {
    usedBy: ["Performance Reviewer", "Security Reviewer"], pull: 0.22, accept: 0.69, findings30d: 27, evals: { pass: 3, total: 4 },
    version: 2, versions: [
      { v: 2, date: "2026-05-04", note: "Emit one-line test skeleton in suggestion", current: true },
      { v: 1, date: "2026-04-08", note: "Initial coverage nudge" },
    ],
    body: `# Test Coverage Nudge

Suggest a test when a new code branch lands without assertions covering it.

## Heuristic
- New \`if\` / \`switch\` / \`catch\` branch in app code…
- …with no corresponding change under \`test/\` or \`*.test.ts\`.

## Output
A SUGGESTION (never blocking) pointing at the uncovered branch with a one-line
test skeleton the author can drop in.`,
  },
};

const CONVENTIONS = [
  { id: "c1", rule: "Always use async/await instead of .then() chains", evidence_path: "src/api/users.ts:23-31", evidence_snippet: "const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId });", confidence: 0.91, accepted: false },
  { id: "c2", rule: "All public route handlers return typed Result<T, ApiError>", evidence_path: "src/api/public/index.ts:14-20", evidence_snippet: "function handler(): Result<Item[], ApiError> {\n  return ok(items);\n}", confidence: 0.78, accepted: false },
  { id: "c3", rule: "Redis access goes through src/lib/redis.ts singleton", evidence_path: "src/lib/redis.ts:1-9", evidence_snippet: "export const redis = new Redis(config.redisUrl);", confidence: 0.85, accepted: false },
];

const LEARNINGS = [
  { id: "l1", rule: "Don't flag try/catch around JSON.parse — intentional in this repo", scope: "repo", source_pr: 412, confidence: 0.93, confirmed_count: 4, created_at: "2026-03-02", updated_at: "2026-05-19" },
  { id: "l2", rule: "snake_case in DB columns is the house style; don't suggest camelCase", scope: "repo", source_pr: 388, confidence: 0.88, confirmed_count: 7, created_at: "2026-01-22", updated_at: "2026-05-11" },
  { id: "l3", rule: "console.log in src/jobs/* is acceptable — those run in workers without a logger", scope: "repo", source_pr: 455, confidence: 0.71, confirmed_count: 2, created_at: "2026-04-08", updated_at: "2026-04-30" },
  { id: "l4", rule: "Prefer Vitest over Jest assertions; this org standardized on it", scope: "global", source_pr: 277, confidence: 0.95, confirmed_count: 12, created_at: "2025-11-14", updated_at: "2026-05-02" },
];

// ---- eval ----
const EVAL = {
  current: { recall: 0.82, precision: 0.91, citation: 0.95, traces_passed: 17, traces_total: 20, cost: 0.23, duration_ms: 12000 },
  delta: { recall: +0.04, precision: -0.02, citation: +0.01 },
  trend: {
    recall:   [0.71, 0.74, 0.73, 0.78, 0.76, 0.80, 0.78, 0.82],
    precision:[0.86, 0.88, 0.90, 0.89, 0.92, 0.93, 0.93, 0.91],
    citation: [0.90, 0.91, 0.92, 0.92, 0.93, 0.94, 0.94, 0.95],
  },
  runs: [
    { id: "r1", agent: "ag1", ran_at: "2026-05-29 09:14", version: "v7", recall: 0.82, precision: 0.91, citation: 0.95, passed: 17, total: 20, cost: 0.23,
      prompt: "You are a security-focused PR reviewer. Examine the diff for hardcoded secrets, untrusted input reaching a sink, and the lethal trifecta.\nReturn at most 5 findings ranked by severity.\nFlag unused imports as suggestions.\nEvery finding MUST cite file and start_line\u2013end_line inside the diff hunks." },
    { id: "r2", agent: "ag1", ran_at: "2026-05-27 16:40", version: "v6", recall: 0.78, precision: 0.93, citation: 0.94, passed: 16, total: 20, cost: 0.21,
      prompt: "You are a security-focused PR reviewer. Examine the diff for hardcoded secrets, untrusted input reaching a sink, and the lethal trifecta.\nReturn at most 5 findings ranked by severity.\nEvery finding MUST cite file and start_line\u2013end_line inside the diff hunks." },
    { id: "r3", agent: "ag1", ran_at: "2026-05-25 11:02", version: "v5", recall: 0.80, precision: 0.92, citation: 0.94, passed: 16, total: 20, cost: 0.24,
      prompt: "You are a security PR reviewer. Look for hardcoded secrets and untrusted input reaching a sink.\nReturn findings ranked by severity.\nCite file and line for each finding." },
    { id: "r4", agent: "ag1", ran_at: "2026-05-22 14:33", version: "v4", recall: 0.76, precision: 0.92, citation: 0.93, passed: 15, total: 20, cost: 0.22,
      prompt: "You are a security PR reviewer. Look for hardcoded secrets and untrusted input reaching a sink.\nReturn findings ranked by severity." },
    { id: "r5", agent: "ag1", ran_at: "2026-05-19 10:08", version: "v3", recall: 0.78, precision: 0.89, citation: 0.92, passed: 15, total: 20, cost: 0.20,
      prompt: "You are a PR reviewer. Look for security problems in the diff and report them." },
    { id: "r6", agent: "ag2", ran_at: "2026-05-28 13:20", version: "v4", recall: 0.74, precision: 0.88, citation: 0.90, passed: 13, total: 18, cost: 0.19,
      prompt: "You are a performance reviewer. Flag N+1 queries, missing indexes, and hot-path allocations.\nReturn findings ranked by impact.\nCite file and start_line\u2013end_line inside the diff hunks." },
    { id: "r7", agent: "ag2", ran_at: "2026-05-24 10:11", version: "v3", recall: 0.71, precision: 0.90, citation: 0.89, passed: 12, total: 18, cost: 0.18,
      prompt: "You are a performance reviewer. Flag N+1 queries and missing indexes.\nReturn findings ranked by impact.\nCite file and line." },
    { id: "r8", agent: "ag2", ran_at: "2026-05-20 09:02", version: "v2", recall: 0.69, precision: 0.87, citation: 0.88, passed: 11, total: 18, cost: 0.17,
      prompt: "You are a performance reviewer. Flag slow database queries.\nReturn findings ranked by impact." },
    { id: "r9", agent: "ag3", ran_at: "2026-05-26 15:47", version: "v2", recall: 0.63, precision: 0.79, citation: 0.85, passed: 8, total: 14, cost: 0.14,
      prompt: "You are a mentoring reviewer. Explain issues kindly and suggest idiomatic fixes.\nReturn findings with a teaching note.\nCite file and start_line\u2013end_line." },
    { id: "r10", agent: "ag3", ran_at: "2026-05-21 12:30", version: "v1", recall: 0.58, precision: 0.76, citation: 0.83, passed: 7, total: 14, cost: 0.13,
      prompt: "You are a mentoring reviewer. Explain issues kindly.\nReturn findings with a teaching note." },
  ],
  traces: [
    { id: "t01", name: "stripe-key-leak", pass: true, expected: "CRITICAL security", actual: "CRITICAL security" },
    { id: "t02", name: "n+1-users", pass: true, expected: "WARNING perf", actual: "WARNING perf" },
    { id: "t03", name: "ssrf-webhook", pass: true, expected: "CRITICAL security", actual: "CRITICAL security" },
    { id: "t04", name: "missing-retry-after", pass: false, expected: "WARNING bug", actual: "— (missed)" },
    { id: "t05", name: "magic-number", pass: true, expected: "SUGGESTION style", actual: "SUGGESTION style" },
    { id: "t06", name: "unused-import", pass: false, expected: "— (none)", actual: "SUGGESTION style (false +)" },
  ],
};

// ---- memory ----
const MEMORY = [
  { id: "m1", content: "Team decided **not** to adopt tRPC; public surface stays REST + OpenAPI. Revisit in Q3.", scope: "team", kind: "decision", confidence: 0.92, last_used: "2026-05-20", updated: "2026-04-15", sources: [{ pr: 401, context: "tRPC migration RFC closed wontfix" }, { pr: 423, context: "OpenAPI spec re-affirmed" }] },
  { id: "m2", content: "`bucketKey()` must include the API version prefix or v1/v2 clients collide in the same bucket.", scope: "repo", kind: "fact", confidence: 0.84, last_used: "2026-05-29", updated: "2026-05-29", sources: [{ pr: 482, context: "raised during current review" }] },
  { id: "m3", content: "Reviewer prefers findings grouped by file, not by severity, when a PR touches >6 files.", scope: "global", kind: "preference", confidence: 0.67, last_used: "2026-05-12", updated: "2026-03-30", sources: [{ pr: 471, context: "explicit reviewer feedback" }] },
  { id: "m4", content: "DB migrations always ship in their own PR — never bundled with feature code.", scope: "repo", kind: "convention", confidence: 0.95, last_used: "2026-05-26", updated: "2026-02-11", sources: [{ pr: 479, context: "split requested" }, { pr: 356, context: "migration isolated" }, { pr: 288, context: "convention origin" }] },
  { id: "m5", content: "Stripe webhooks are verified with the `stripe-signature` header — do not flag the raw-body parser as a bug.", scope: "repo", kind: "fact", confidence: 0.88, last_used: "2026-05-18", updated: "2026-01-09", sources: [{ pr: 288, context: "raw body intentional" }] },
  { id: "m6", content: "Don't flag `try/catch` around `JSON.parse` — it's intentional defensive parsing in this repo.", scope: "repo", kind: "learning", confidence: 0.93, last_used: "2026-05-30", updated: "2026-05-30", sources: [{ pr: 482, context: "learned from a dismissed finding" }] },
];

// ---- personas ----
const PERSONAS = [
  { name: "Security", icon: "Shield", color: "#ef4444", score: 38, duration_ms: 8200, cost: 0.06,
    summary: "Two critical exposures: a committed live key and an SSRF-shaped webhook forwarder. Block.",
    findings: [FINDINGS[0], FINDINGS[1], FINDINGS[3]] },
  { name: "Performance", icon: "Zap", color: "#f59e0b", score: 64, duration_ms: 7400, cost: 0.05,
    summary: "N+1 in the user list will bite under the new limiter. Redis round-trip is acceptable.",
    findings: [FINDINGS[2], { id: "p_perf1", severity: "SUGGESTION", category: "perf", title: "Pipeline INCR+EXPIRE into one round-trip", file: "src/middleware/ratelimit.ts", start_line: 27, end_line: 28, confidence: 0.6, rationale: "Two sequential Redis calls per request can be a single `MULTI`/pipeline.", suggestion: "Use `redis.multi().incr(key).expire(key, WINDOW).exec()`." }] },
  { name: "Junior Mentor", icon: "Lightbulb", color: "#3b82f6", score: 72, duration_ms: 6900, cost: 0.04,
    summary: "Readable change. A couple of naming + magic-number nits worth fixing before merge.",
    findings: [FINDINGS[4], FINDINGS[5]] },
  { name: "Customer-Facing", icon: "Users", color: "#8b5cf6", score: 58, duration_ms: 7100, cost: 0.05,
    summary: "Missing Retry-After breaks well-behaved client back-off — a real DX regression.",
    findings: [FINDINGS[3], { id: "p_cf1", severity: "WARNING", category: "bug", title: "429 body has no machine-readable error code", file: "src/middleware/ratelimit.ts", start_line: 52, end_line: 52, confidence: 0.66, rationale: "Clients can't distinguish rate-limit from other 4xx without a body `code`.", suggestion: "Return `{ code: 'rate_limited', retry_after: n }`." }] },
  { name: "Architecture", icon: "Boxes", color: "#10b981", score: 69, duration_ms: 9100, cost: 0.07,
    summary: "Second Redis connection duplicates the session-cache client. Consolidate on the singleton.",
    findings: [{ id: "p_arch1", severity: "WARNING", category: "style", title: "Duplicate Redis connection", file: "src/middleware/ratelimit.ts", start_line: 4, end_line: 4, confidence: 0.83, rationale: "A new `new Redis()` is constructed here, but `src/lib/redis.ts` already exports a shared client (see PR #356).", suggestion: "Import the shared `redis` singleton from `src/lib/redis.ts`." }, FINDINGS[2]] },
];

const PERSONA_CONFLICTS = [
  { file: "src/middleware/ratelimit.ts", line: 28, title: "Magic number 3600",
    takes: [
      { persona: "Junior Mentor", verdict: "SUGGESTION", note: "Extract for readability." },
      { persona: "Security", verdict: "ignored", note: "Not a security concern." },
      { persona: "Architecture", verdict: "ignored", note: "Cosmetic; out of scope for arch review." },
    ] },
  { file: "src/middleware/ratelimit.ts", line: 52, title: "429 response shape",
    takes: [
      { persona: "Customer-Facing", verdict: "WARNING", note: "Needs machine-readable code + Retry-After." },
      { persona: "Performance", verdict: "ignored", note: "No perf impact." },
      { persona: "Security", verdict: "ignored", note: "No security impact." },
    ] },
];

Object.assign(window, {
  REPO, PR, VERDICT, INTENT, RISKS, REVIEW_FOCUS, BLAST, FINDINGS, DIFF, HISTORY, CODE_SNIPPETS,
  PR_LIST, SKILLS, SKILL_BODY, SKILL_DETAIL, CONVENTIONS, LEARNINGS, EVAL, MEMORY, PERSONAS, PERSONA_CONFLICTS,
});
