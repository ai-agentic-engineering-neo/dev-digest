# Routing — diff paths to reviewer groups

Input: `git diff --name-status -M <merge-base> HEAD`.
Output: every path in exactly one of **excluded**, **routed**, **unrouted**.

Match top to bottom; a path may join more than one group (a `repository.ts` is
both backend architecture and backend data). A group spawns only if it matched at
least one non-excluded file.

## Excluded — listed in the report, never reviewed

| Glob | Reason |
|---|---|
| `client/src/vendor/ui/**` | Vendored design system, not hand-authored app code |
| `server/src/db/migrations/**` | Off-limits per `AGENTS.md` |
| `**/pnpm-lock.yaml`, `**/package-lock.json`, `skills-lock.json` | Off-limits per `AGENTS.md` |
| `**/node_modules/**`, `**/*.snap`, `**/dist/**` | Generated |
| `e2e/test-results/**` | Run artifacts |

A migration or lock file in the diff is a hard `AGENTS.md` violation. This gate
only *excludes* it from review — it does not flag it. Mention it in the summary so
it is not invisible.

## Groups

| Group | Skills to read | Matches |
|---|---|---|
| **A · backend-architecture** | `onion-architecture`, `fastify-best-practices` | `server/src/**/*.ts` |
| **B · backend-data** | `drizzle-orm-patterns`, `postgresql-table-design`, `zod` | `server/src/db/schema.ts`, `server/src/db/schema/**`, `server/src/**/repository.ts`, `server/src/**/*.repo.ts`, `{server,client}/src/vendor/shared/**` |
| **C · frontend-architecture** | `frontend-ui-architecture`; add `next-best-practices` iff `client/src/app/**` is touched | `client/src/**/*.{ts,tsx}` minus `client/src/vendor/ui/**` |
| **D · frontend-react** | `react-best-practices`; add `react-testing-library` iff a `client/src/**/*.test.tsx` is in the diff | `client/src/app/**/_components/**/*.tsx`, `client/src/components/**/*.tsx`, `client/src/lib/hooks/**/*.ts` |
| **E · security** | `docs/agent-prompts/security-reviewer.md` **as the prompt**, `.claude/skills/security/SKILL.md` **as a checklist only** | `server/src/modules/**/routes.ts`, `server/src/app.ts`, `server/src/adapters/{auth,secrets,github,llm}/**`, `server/src/platform/**`, `server/src/vendor/shared/**`, `client/src/lib/api.ts`, `.github/workflows/**`, plus **any** file whose diff adds `process.env`, `exec(`, `spawn(`, `dangerouslySetInnerHTML`, or a secret-shaped literal |
| **F · generic** | `docs/agent-prompts/general-reviewer.md` | everything no group matched **by path** — `reviewer-core/**`, `e2e/**`, `scripts/*.sh`, `docs/**`, `*.md`, `.claude/**`, `.github/**`, `package.json`. A file that reaches E **only** through the content trigger stays in F too (see below) |

### Group E's content trigger never removes a file from F

The content trigger is a text match on added lines, so it also fires on prose and
test setup: a skill `.md` that documents `process.env`, a `server/test/*.test.ts`
that sets `process.env.X`. Such a file is not security code, and if E is its
**only** route, the E reviewer rightly skips it as noise — and nobody reviews it.
On 2026-09-26 that silently dropped 14 files (7 skill docs, 7 server tests) from a
353-file run until the orchestrator caught it.

So a content-only E match **adds** E; it never replaces the path route. Compute
groups by path first (A–D, the E path globs, else F), then add E for a content
hit. A file in F that also carries an E content hit goes to both reviewers.

### Group E — the security stack mismatch

`.claude/skills/security/SKILL.md` is written for **Express + Mongoose + JWT**.
This repo is **Fastify + Drizzle/Postgres + local auth**. Fed raw, it produces
confident findings about Helmet configuration and Mongoose parameterisation for
code that does not exist.

So `docs/agent-prompts/security-reviewer.md` — already stack-agnostic, already
carrying this repo's severity and discipline conventions, already the product's own
security prompt — is the prompt. The skill contributes only its OWASP categories
and its confidence table, behind this preamble, which you must include verbatim:

> The `security` skill's examples assume Express/Mongoose/JWT. This repo is
> Fastify + Drizzle/Postgres + local auth. Read its **categories** (A01–A10) and
> its **confidence table**; ignore every framework-specific remedy. Do not report
> the absence of an Express or Mongo control. If you cannot name the Fastify or
> Drizzle equivalent that is missing, you do not have a finding.

## Skills deliberately not in any group

| Skill | Why |
|---|---|
| `engineering-insights` | A process skill that writes `INSIGHTS.md`. It runs *after* this gate, per the `AGENTS.md` workflow — nothing in a diff violates it. |
| `mermaid-diagram` | Authoring guidance for diagrams. Nothing in a diff can violate it. |
| `typescript-expert` | A persona ("You are an advanced TypeScript expert…"), not a rule catalogue: no anti-pattern table, no severity vocabulary, no grounding in this repo. Given a diff it produces preference-shaped opinions, and an opinion must never block a merge. Group F already covers the part of TS review that matters at merge time — a broken contract, a changed response shape, a nullability regression. |
| `pr-self-review` | This skill. |

`next-best-practices` carries `user-invocable: false`. That only hides it from the
slash-command list; a sub-agent can still `Read` its `SKILL.md` by path, which is
exactly how every skill is loaded here. Routing is unaffected.

## Unrouted paths

A path matching no group goes to **F**, and is also listed in `unrouted_files` so
the gap is visible. Silence is the failure mode to avoid: a file nobody reviewed
should be named, not implied.

---

# The two deterministic checks that run here

## Routing drift guard

```bash
ls -d .claude/skills/*/ | xargs -n1 basename
```

Every name must appear either in a group above or in "deliberately not in any
group". An unaccounted skill becomes a **WARNING** naming it:

> `<name>` is installed but absent from `routing.md` — it will never run. Add it
> to a group, or to the deliberately-excluded table with a reason.

This costs nothing and stops the routing table rotting the first time someone adds
a skill.

## Vendored-contract twin check

`AGENTS.md` → Cross-package invariants: the `@devdigest/shared` Zod contracts are
vendored in **both** `server/src/vendor/shared` and `client/src/vendor/shared` and
must change together. A one-sided edit ships a silent type desync between the API
and the web app.

For each changed path under `<side>/src/vendor/shared/<rel>`, require the mirror
`<other side>/src/vendor/shared/<rel>` to be in the diff too. If it is missing,
emit a synthetic finding:

```json
{ "severity": "CRITICAL", "category": "bug",
  "title": "Vendored shared contract changed on one side only",
  "file": "server/src/vendor/shared/contracts/findings.ts",
  "source_skill": "AGENTS.md", "source_rule": "Cross-package invariants",
  "rationale": "client/src/vendor/shared/contracts/findings.ts was not changed. The two copies are the same module vendored twice; letting them drift means the API validates one shape and the web app expects another, with no compile error to catch it.",
  "confidence": 1.0 }
```

Set difference on two path lists. No false positives, and it catches a real bug
class — distinct from the no-touch exclusions above, which are about files that
must not be edited at all.
