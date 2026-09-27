# Routing — changed file → skill lanes

`scripts/route-skills.sh` is this table in executable form. **Change both together**, and
keep the "not routed" list complete: a skill that appears in `.claude/skills/README.md`
and in neither column here is a routing bug.

## By path

| Path pattern | Lanes |
|---|---|
| `client/**/*.{test,spec}.{ts,tsx}` | `react-testing-library` |
| `client/src/app/**/{page,layout,route,loading,error,template,not-found,default}.{ts,tsx}` | `next-best-practices`, `react-best-practices`, `frontend-ui-architecture` |
| `client/**/*.tsx` (non-test) | `react-best-practices`, `frontend-ui-architecture` |
| `client/src/**/*.ts` (non-test) | `frontend-ui-architecture` |
| `server/src/modules/*/routes.ts` | `fastify-best-practices`, `onion-architecture`, `security`, `zod` |
| `server/src/platform/{sse,jobs,http}.ts` | `fastify-best-practices`, `onion-architecture` |
| `server/src/modules/*/repository.ts` | `onion-architecture`, `drizzle-orm-patterns` |
| `server/src/{modules,domain,adapters,platform}/**` | `onion-architecture` |
| `server/src/db/{schema,rows}.ts`, `server/src/db/migrations/**` | `drizzle-orm-patterns`, `postgresql-table-design` |
| `{server,client}/src/vendor/shared/**` | `zod`, `onion-architecture` + the dual-copy check |
| `reviewer-core/src/**` | `onion-architecture`, `typescript-expert`, `zod` |
| `e2e/**` | conventions lane only (`e2e/AGENTS.md` — no skill exists) |
| `.github/**`, `scripts/**`, `.claude/**`, root `*.md`, `docs/**`, `specs/**` | conventions lane only |

`onion-architecture` is the backend architecture lane: it covers `server/` **and**
`reviewer-core/`, and it is the only lane allowed to raise a layering CRITICAL.
The three React/Next/frontend lanes never look at `server/**`, and the backend lanes never
look at `client/**` — the split is the point of this file.

## By content (on added lines only)

Path alone misses these, so they are matched against the `+` lines of the diff
(whole file for a new untracked file):

| Trigger | Lane |
|---|---|
| `dangerouslySetInnerHTML`, `innerHTML`, `child_process`, `execSync`, `spawn(`, `exec(`, `eval(`, `new Function`, `Authorization`, `password`, `secret`, `token`, `apiKey`, `api_key`, `jwt`, `bcrypt`, `cookie`, `cors`, `helmet`, `.query.`, `.body.`, `.params.`, `redirect(`, `upload` | `security` |
| `any`, `as unknown as`, `as <Type>`, `@ts-ignore`, `@ts-expect-error`, `infer`, `keyof`, `satisfies`, `declare module`, any `tsconfig*.json` | `typescript-expert` |

Content triggers are deliberately wide: the lane's own skill decides what is reportable
(`security` has a confidence table, `typescript-expert` has none — see `../rules/severity.md`).
A wide trigger costs one subagent; a narrow one costs a missed CRITICAL.

## Not routed, on purpose

| Skill | Why |
|---|---|
| `mermaid-diagram` | authoring aid, has no review rules |
| `engineering-insights` | writes `INSIGHTS.md`; runs at the end of a session, not inside a review |
| `pr-self-review` | this skill — the router, not a lane |

## Keeping it honest

```bash
for s in $(ls -1 .claude/skills | grep -vE '\.(md|json)$'); do
  grep -q "\`$s\`" .claude/skills/pr-self-review/rules/routing.md || echo "unrouted skill: $s"
done
```

Silence means every skill in the catalog is either routed above or listed as deliberately
not routed. Any line of output is a skill this review would ignore without saying so.
