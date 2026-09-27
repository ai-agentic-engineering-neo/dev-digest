# Severity and the merge gate

## The scale

The project's own enum, no other: `CRITICAL` · `WARNING` · `SUGGESTION`
(`server/src/vendor/shared/contracts/findings.ts`). `INFO` exists in the client design
tokens only and must never be emitted here.

## Mapping the lanes' own scales

| Lane's own label | Here |
|---|---|
| `react-best-practices` CRITICAL | CRITICAL — **only if** the three-part test below passes; otherwise WARNING |
| `react-best-practices` HIGH | WARNING |
| `react-best-practices` MEDIUM | SUGGESTION |
| `security` HIGH confidence (attacker-controlled input confirmed) | CRITICAL |
| `security` MEDIUM confidence | WARNING |
| `security` LOW confidence | not reported at all |
| a lane with no scale (`zod`, `typescript-expert`, `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`, `frontend-ui-architecture`, `next-best-practices`, `react-testing-library`) | WARNING by default; CRITICAL only via the test below |
| `onion-architecture` violation that `depcruise` reports | CRITICAL |
| `onion-architecture` violation that `depcruise` does not catch | WARNING |

A skill calling its own rule "CRITICAL" is a prior, not a verdict. The rule below decides.

## The three-part test for CRITICAL

All three, or it is not a CRITICAL:

1. **Location** — a `file:line` inside the diff. Not "somewhere in this module".
2. **Failure scenario** — concrete input or state → wrong output, crash, data loss, leak,
   or a broken build. Written out, not implied.
3. **Verified** — the file was opened in step 4 of the run and the pattern is really there.

Fails any one → WARNING. Style, taste, "would be nicer", theoretical risk, a pattern in a
test file, dead code, or anything in `docs/`, `specs/`, `*.md` → never CRITICAL.

## What is genuinely CRITICAL in this repository

- `pnpm typecheck` / `npm run typecheck` fails in a package the diff touches.
- `depcruise` reports a violation: a `routes.ts` importing `drizzle-orm` or `db/schema.js`,
  a `modules/**` constructor taking `Container`, a module reaching into another module's
  internals, an import cycle.
- A contract changed in `server/src/vendor/shared/` but not in `client/src/vendor/shared/`
  (or the reverse) — the two copies are one contract, and CI type-checks them apart.
- A secret, token or real `.env` value added by the diff.
- A new route with no Zod validation of its input, or reading a resource by id with no
  ownership/access check.
- A destructive migration (`DROP TABLE`, `DROP COLUMN`) — the local volume holds every
  imported repo and every local review.
- React state mutated in place, or a hook called conditionally, where a concrete render
  path is broken by it.
- A lockfile edited without the matching `package.json` change.

## What is not

- A `service.ts` over 300 lines. A component over 200 lines. → SUGGESTION.
- `any` in a test helper. → SUGGESTION.
- A missing test for new code. → WARNING, and name the command the user should run.
- A naming-convention miss (`docs/foo_bar.md`, a non-PascalCase component folder). → WARNING.
- `process.env.X` read in server code. → not reported; it is server-controlled by design.

## Lane output contract

Each lane returns a JSON array and nothing else:

```json
[{"severity":"CRITICAL","file":"server/src/modules/pulls/routes.ts","line":12,
  "skill":"onion-architecture","title":"routes.ts queries Drizzle directly",
  "failure":"depcruise fails the server CI lane; the HTTP layer reads persistence with no repository",
  "fix":"move the query into pulls/repository.ts and call it from service.ts"}]
```

Cap: 10 findings per lane, CRITICAL first. A lane that wants to report more is describing
the codebase, not the diff.
