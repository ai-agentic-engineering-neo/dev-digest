/* data_context.jsx — Project context documents discovered under specs/ · docs/ · insights/
   Drives the Agent Editor "Context" tab (N2b) and the Skill Editor "Project context to use" section (N2c).
   Attaching stores the file PATH (folder + name) in agent/skill metadata — never the body. */

const PROJECT_DOCS = [
  {
    id: "d1", name: "public-api.md", folder: "specs/", source: "specs", usedBy: 3,
    body: `# Public API

The public API is the only surface untrusted callers reach. Every route under
\`/api/public/*\` is rate-limited and must never trust request-supplied URLs.

## Versioning
- All cache and bucket keys MUST include the API version prefix (\`v2:\`).
- Breaking a response shape requires a new version path, never an in-place edit.

## Endpoints
- \`GET /api/public/items\` — paginated, max page size 100.
- \`POST /api/public/webhooks\` — verified via \`stripe-signature\`; raw body parser is intentional.
- \`GET /api/public/health\` — unauthenticated, no rate limit.

## Hard rules
- No secret may appear in any response.
- Callback URLs from the request body are treated as untrusted and must be allow-listed.`,
  },
  {
    id: "d2", name: "security-baseline.md", folder: "specs/", source: "specs", usedBy: 2,
    body: `# Security Baseline

The minimum bar every change must clear before merge.

## Secrets
- No \`sk_live\`, \`service_role\`, or \`NEXT_PUBLIC_\`-prefixed secrets in the diff.
- Secrets are resolved at runtime from the vault, never committed.

## Untrusted input
- Request body, query, and headers are untrusted.
- An untrusted value reaching \`fetch\`, \`exec\`, or a SQL string is a blocker.

## Lethal trifecta
A single PR that combines private data access, untrusted input, and an
outbound exfil path is always a CRITICAL finding — even if each part is benign alone.`,
  },
  {
    id: "d3", name: "rate-limiting.md", folder: "specs/", source: "specs", usedBy: 1,
    body: `# Rate Limiting

Token-bucket limiter in \`src/middleware/ratelimit.ts\`.

## Buckets
- Key = \`bucketKey(req)\` = \`v2:\${ip}:\${route}\`.
- Buckets reset hourly via the \`reset-rate-buckets\` cron.

## Limits
- Default 100 req / 15 min per IP.
- Webhooks are exempt from the IP limit but verified by signature.

## On limit
- Return \`429\` with a \`Retry-After\` header. Missing \`Retry-After\` is a WARNING.`,
  },
  {
    id: "d4", name: "architecture.md", folder: "docs/", source: "docs", usedBy: 2,
    body: `# Architecture

A Fastify monolith split into modules, each owning its own schema and routes.

## Layers
- \`adapters/\` — git, vault, third-party clients.
- \`platform/\` — errors, context, container wiring.
- \`modules/\` — feature slices; never import another module's internals.

## Errors
All thrown errors extend \`AppError\`. HTTP status is derived from the error class —
handlers never set status codes directly.`,
  },
  {
    id: "d5", name: "deployment.md", folder: "docs/", source: "docs", usedBy: 1,
    body: `# Deployment

## Migrations
- Migrations ship in their own PR, never bundled with feature code.
- A migration PR touches only \`migrations/\` and is reviewed for reversibility.

## Rollout
- Canary 5% for 30 min, then 100% if error rate holds.
- Feature flags default off; flipping a flag is a separate, logged action.`,
  },
  {
    id: "d6", name: "incident-2026-04-checkout.md", folder: "insights/", source: "insights", usedBy: 1,
    body: `# Incident — 2026-04 Checkout outage

## What happened
A webhook handler forwarded a request-supplied \`callback_url\` with the account
API token attached — an exfil path opened by untrusted input.

## Root cause
The callback URL was never allow-listed; review missed it because the three
pieces (data access, untrusted input, outbound fetch) landed in one diff.

## Follow-up
- Added the lethal-trifecta gate to the Security Reviewer agent.
- Any new outbound \`fetch\` in a public route now requires an allow-list entry.`,
  },
  {
    id: "d7", name: "perf-budget.md", folder: "insights/", source: "insights", usedBy: 1,
    body: `# Performance budget

Observed hot paths and the limits we hold them to.

## Budgets
- Public list endpoint p95 < 120ms.
- No N+1 in request handlers — batch or join.
- Allocations in the rate-limit path are counted; keep \`bucketKey\` allocation-free.

## Notes
- \`usePullDetail\` over-fetches on mount; acceptable until it shows in traces.`,
  },
];

// which docs each agent currently attaches (paths, in injection order)
const AGENT_CONTEXT = {
  ag1: ["specs/security-baseline.md", "specs/public-api.md"],
  ag2: ["insights/perf-budget.md"],
  ag3: [],
};

// which docs a skill carries (inherited by any agent using the skill)
const SKILL_CONTEXT = {
  s1: ["specs/public-api.md"],
  s2: [],
  s3: ["specs/security-baseline.md"],
  s4: ["specs/security-baseline.md", "insights/incident-2026-04-checkout.md"],
  s5: [],
  s6: [],
};

// rough token estimate per doc (mirrors CodeEditor's len/4)
PROJECT_DOCS.forEach((d) => { d.tokens = Math.round(d.body.length / 4); d.path = d.folder + d.name; });

const DOC_BY_PATH = Object.fromEntries(PROJECT_DOCS.map((d) => [d.path, d]));

Object.assign(window, { PROJECT_DOCS, AGENT_CONTEXT, SKILL_CONTEXT, DOC_BY_PATH });
