# Examples — what blocks a PR here and what does not

Each pair is a real shape from this repository. The difference is never the topic; it is
whether the three-part test in `rules/severity.md` passes.

---

### 1. Layering

**CRITICAL.** `server/src/modules/pulls/routes.ts:8` adds `import { eq } from 'drizzle-orm'`
and queries `pull_requests` inside the handler.
*Failure:* `pnpm exec depcruise src --config .dependency-cruiser.cjs` reports a
`no-routes-to-drizzle` violation, which is a `severity: error` rule wired into
`.github/workflows/server-unit.yml` — the branch cannot go green.
*Fix:* the query moves to `pulls/repository.ts`, the route calls the service.

**WARNING, not CRITICAL.** The same file's handler is 90 lines long and mixes two use cases.
No rule fails, nothing breaks; it is a shape complaint. Report it, do not block on it.

---

### 2. Contracts

**CRITICAL.** `server/src/vendor/shared/contracts/findings.ts` gains a field; the client
copy is untouched.
*Failure:* `cd client && pnpm typecheck` still passes today, so CI is green — and the wire
shape has already diverged. The next client change that reads the field fails in a file
nobody edited. `diff -r server/src/vendor/shared client/src/vendor/shared` shows it in one line.
*Fix:* land the identical change in both copies, in this diff.

**SUGGESTION.** A new Zod schema is called `findingSummary` instead of `FindingSummary`.
Convention miss, no behaviour.

---

### 3. Security

**CRITICAL.** A new route takes `req.params.repoId` and returns rows without checking that
the repo belongs to the caller.
*Failure:* any id enumerates other workspaces' repos — attacker-controlled input, confirmed
data flow, which is the `security` skill's HIGH confidence row.
*Fix:* ownership check in the service before the repository call.

**Not reported at all.** The same diff adds `fetch(process.env.API_BASE + '/health')`.
Server-controlled value; the skill's own golden rule excludes it. Reporting it trains the
user to ignore the report.

---

### 4. React

**CRITICAL.** `FindingsPanel.tsx:64` does `findings.sort((a, b) => ...)` on the array that
came in as a prop.
*Failure:* `Array.prototype.sort` mutates in place, so the parent's state array is reordered
without a state update — the list renders stale order until an unrelated re-render.
Concrete path, concrete wrong output.
*Fix:* `[...findings].sort(...)`.

**WARNING.** The same component derives `total` into `useState` + `useEffect` instead of
computing it during render. It is the anti-pattern the skill calls CRITICAL, but nothing
observable is wrong here — one extra render. WARNING, with the fix spelled out.

---

### 5. Tests

**CRITICAL.** A new `server/src/modules/repos/repository.test.ts` opens a real Postgres
connection.
*Failure:* the hermetic lane runs `vitest run --exclude '**/*.it.test.ts'`, so this file
runs there with no database and fails CI for everyone.
*Fix:* rename to `repository.it.test.ts`.

**WARNING.** New service code arrives with no test at all. Worth saying, with the exact
command the user would run — not worth blocking a PR that CI will judge anyway.
