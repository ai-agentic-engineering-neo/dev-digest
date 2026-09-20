# e2e/ — Insights

Running log of gotchas, tricky bugs, and rationale for non-default decisions in
this module. Linked from [CLAUDE.md](./CLAUDE.md) — not inlined there because
this list is expected to grow and change often (volatile by design).

Format: newest first within each section. One entry = one decision or one
gotcha. Keep entries short; link to code/PR/commit for the full story instead
of re-explaining it here.

---

## What Works

## What Doesn't Work

### 2026-09-16 — Never `docker compose down -v` against the dev stack
`-v` deletes the `devdigest_pgdata` volume along with every repo and review
you've imported for local development — it is not scoped to e2e data. Use the
hermetic runner (`./scripts/e2e.sh`, isolated ports 5433/3101/3100, no
persistent volume) whenever you need a clean-slate Postgres for a test run.

## Codebase Patterns

### 2026-09-19 — Flows 02/04/05 resolve the demo repo by name, not DB order
Previously these flows followed the home redirect to whatever repo the API
returned *first*, so running `npm test` against a dev stack with other
imported repos made them land on the wrong one and fail non-deterministically
— only the hermetic runner's empty-DB seed made "first" reliably mean
`acme/payments-api`. Fixed: `run.ts` resolves the demo repo's id by
`full_name` via `GET {NEXT_PUBLIC_API_BASE}/repos` once at startup and exposes
it to specs as a `{REPO_PATH}` template var (alongside `{BASE}`); flows
navigate straight to `{BASE}{REPO_PATH}` instead of `{BASE}/` + waiting for
the redirect. Flow `01-app-boot` deliberately keeps testing the `{BASE}/`
redirect itself (that's the behavior it exercises), so it's unaffected. This
still requires the demo repo to exist under that exact `full_name` — same
precondition the suite always had (see `e2e/CLAUDE.md`'s "read-only seeded
data" note) — it just no longer also requires it to be the *first* one.

## Tool & Library Notes

### 2026-09-17 — `run.ts` used `execFile('agent-browser', …)`, which is broken on Windows
npm installs `agent-browser` on Windows as a `.cmd` shim (plus a `.ps1` and an
extensionless POSIX script). `node:child_process`'s `execFile`/`spawn` do NOT
append `.cmd` when resolving a bare command name (that PATH-extension
resolution is shell behavior, not `CreateProcess` behavior), so it failed with
`ENOENT`. Passing the `.cmd` name explicitly then hit `EINVAL` — Node
deliberately refuses to spawn `.cmd`/`.bat` without `shell: true`
(CVE-2024-27980). But naive `shell: true` breaks argument boundaries: an arg
like `find text "some label"` gets shell-split on its internal spaces instead
of staying one argument, since Node does not auto-quote args for the shell
path. **Fix:** replaced `execFile` with `cross-spawn`'s `sync()` (`run.ts`),
which resolves the Windows shim AND quotes arguments correctly. Verified
6/7 flows pass after the fix (see Open Questions for the 7th).

## Recurring Errors & Fixes

## Session Notes

## Open Questions

### 2026-09-17 — Flow `01-app-boot` reliably times out on its first command, only on a fresh run
Every fresh `./scripts/e2e.sh` run: flow 01's very first `agent-browser`
command ("load the app root") hits `spawnSync ... ETIMEDOUT` — reproduced 3
times, including once with `E2E_STEP_TIMEOUT=150000` (2.5x the 60s default),
same result. Since a longer timeout didn't help, this looks like the
`agent-browser` daemon's startup handshake hanging on this Windows machine,
not merely "Chrome cold-start is slow" — flows 02-07 (same run, daemon now
started) always pass immediately after. Not investigated further yet
(time-boxed). Next step: run `agent-browser` daemon manually in isolation
before flow 01's first command to see if the daemon-start step itself is what
hangs, vs. the CDP navigate/wait step.

---

<!-- Add new entries above this line within the relevant section, newest first. -->
