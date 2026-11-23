# Enforcement

Contents: [Why enforce](#why-enforce) · [Tools](#tools) · [Proposed dependency-cruiser rules](#proposed-dependency-cruiser-rules-not-applied) · [Baseline strategy](#baseline-strategy) · [Agent review procedure](#agent-review-procedure-without-tooling) · [Review checklist](#review-checklist)

**This skill ships no tooling and changes no `server/` config** (a decision for 1.0.0). What follows is a proposal for a team decision, plus a manual procedure agents can use today.

## Why enforce

TypeScript/Node has no built-in way to stop one folder importing another, so layering rules decay unless a tool or a reviewer checks them. A rule that exists only in prose erodes: the repo already has route files importing Drizzle (see the profile). [R2][E1]

## Tools

- **dependency-cruiser** — validates the import graph against `forbidden` rules (`from`/`to` path regexes, severity per rule), generates a starter config with `--init`. **Already a server dependency** (used by `adapters/depgraph` for repo-intel), so adopting it adds no new package. [E1][E1b]
- **eslint-plugin-boundaries** — classifies files into element types and declares allowed dependencies between them; fits if the team prefers lint-time feedback in the editor. Check the current docs: the config format changed between major versions. [E3]
- **fresh-onion** — a purpose-built Onion import linter (per-layer `allowedImports` config). The article is clear; the package itself is unverified here — treat as optional. [R2]
- (`import/no-restricted-paths` also works for a handful of zones.)

Recommendation: dependency-cruiser, because it is already installed and has a baseline mechanism for existing violations.

## Proposed dependency-cruiser rules (not applied)

Sketch for `server/.dependency-cruiser.cjs`. **Verify the exact syntax against the rules reference [E1b] before applying**; regexes are written against `src/` paths.

```js
module.exports = {
  forbidden: [
    {
      name: 'no-db-in-routes-services-domain',
      comment: 'Presentation/application/domain must not touch Drizzle or db/schema — use a repository.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/(routes|service|helpers)\\.ts$' },
      to: { path: ['^node_modules/drizzle-orm', '^src/db/(schema|client)'] },
    },
    {
      name: 'no-fastify-in-service-domain',
      comment: 'Services and pure helpers must not know the web framework.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/(service|helpers|constants)\\.ts$' },
      to: { path: '^node_modules/fastify' },
    },
    {
      name: 'sdks-only-in-adapters',
      comment: 'Vendor SDKs are infrastructure; reach them through a port.',
      severity: 'error',
      from: { path: '^src/(modules|platform)/', pathNot: '^src/platform/container\\.ts$' },
      to: { path: '^node_modules/(octokit|openai|@anthropic-ai|simple-git|@ast-grep|js-tiktoken)' },
    },
    {
      name: 'adapters-not-from-modules',
      comment: 'Infrastructure must not depend on feature modules (wrong direction).',
      severity: 'error',
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'no-cross-module-internals',
      comment: 'Modules talk through facades/the container, not each other’s files.',
      severity: 'warn',
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/([^/]+)/', pathNot: ['^src/modules/$1/', '^src/modules/_shared/', '/(types|index)\\.ts$'] },
    },
  ],
  options: { tsConfig: { fileName: 'tsconfig.json' }, doNotFollow: { path: 'node_modules' } },
};
```
Notes: `platform/container.ts` is the composition root and is deliberately exempt from the boundaries it wires. `modules/index.ts` likewise registers every module. Presentation-only helpers (`_shared/context.ts`) may import `fastify`.

Run idea (not wired): `pnpm exec depcruise src --config .dependency-cruiser.cjs`, exposed as a `lint:arch` script.

## Baseline strategy

Today's code violates several of these (see the profile), so switching rules on as `error` would fail immediately. dependency-cruiser supports recording known violations as a baseline and ignoring them (`--ignore-known`), so CI fails only on **new** violations while the existing ones are burned down opportunistically. Verify the exact flags in [E1]. Add new rules at `warn` first if the team is wary.

## Agent review procedure (without tooling)

On a server diff, an agent can check layering with greps and reading imports:

1. For every touched file, list its imports (`grep -n "^import" <file>`).
2. Classify the file by name: `routes.ts` (presentation), `service.ts`/`run-executor.ts` (application), `repository*.ts`/`adapters/**`/`db/**` (infrastructure), `helpers.ts`/`domain/**`/`constants.ts` (domain), `platform/container.ts`/`modules/index.ts` (composition).
3. Flag any import that points outward (table in `SKILL.md`, rule 1) except in the composition root.
4. Specifically grep the touched non-infrastructure files for: `drizzle-orm`, `db/schema`, `db/client`, `from 'fastify'`, `octokit`, `openai`, `@anthropic-ai`, `simple-git`, `process.env`.
5. Check that each new external dependency has: port, adapter, mock, container entry, override.
6. Report violations as **new** (introduced by this diff) vs **pre-existing** (listed in the profile) — don't fail a diff for old debt.

## Review checklist

See `SKILL.md` Step 3. Add for this repo: queries workspace-scoped; zod `schema` on every new route; `*.it.test.ts` for any new repository method with non-trivial SQL.
