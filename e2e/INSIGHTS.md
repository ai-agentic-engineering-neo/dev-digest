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

### 2026-09-20 — The "hermetic" stack was NOT safe next to a dev server: both `next dev` shared `client/.next`
`scripts/e2e.sh` started `next dev -p 3100` in the same `client/.next` as a developer's `next dev` on :3000, so each overwrote the other's compiled bundles — the e2e web app ended up calling the dev API on :3001 ("Cannot reach the DevDigest engine") and the dev server could serve bundles built for :3101. Fixed by exporting `NEXT_DIST_DIR=.next-e2e` in the script (read by `client/next.config.mjs`, git-ignored). If a dev server ever shows the wrong API base or stale UI after an e2e run, delete `client/.next`.

### 2026-09-20 — Flow steps that pass or fail depending on window size: scroll before clicking, and never put a newline in an argument
The agent-browser window is ~1262×568, so a button that sits below the fold in a scrollable modal (the Add Skill "Create skill" button) is clicked at off-screen coordinates: exit 0, nothing happens, and the flow fails 60 s later at the *next* wait — precede such clicks with `scrollintoview <sel>` or trigger them via `eval` (`el.scrollIntoView(); el.click()`). Separately, args go through `cmd.exe` on Windows, which truncates a `fill` value at the first literal newline (a two-line body silently saved as `# Rule`, so the injection check "failed") — keep `fill` values single-line. Also: `find text`/CSS-`click` on an element in a long list can miss for the same off-screen reason.

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

### 2026-09-20 — Flows 02/04/05 failed at "seeded PR title row is visible": the PR list defaults to the Needs-review filter
`app/repos/[repoId]/pulls/page.tsx` defaults `status` to `needs_review` (committed L01 change), and the seeded PR #482 already has a review, so it isn't listed by default — flows that open `{REPO_PATH}` saw "No pull requests" and then timed out. The flows now open `{REPO_PATH}?status=all` (an explicit status always sticks). If a future default-filter change breaks these again, that is the first place to look. Note the `2026-09-19` "resolve the demo repo by name" entry is unrelated to this.

### 2026-09-20 — `npm run e2e:hermetic` fails under Windows cmd (`'..' is not recognized`)
The npm script is `../scripts/e2e.sh`, which cmd tries to execute directly. Run `./scripts/e2e.sh` from Git Bash instead (same thing, and it is what the README shows first). Use `E2E_ONLY=08` (substring of the flow file name) to iterate on a single flow against a stack you keep running.

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
