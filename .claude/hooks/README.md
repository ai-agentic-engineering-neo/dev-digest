# Hooks

## `pr-self-review-gate`

A `PreToolUse` hook that denies `git push` and `gh pr create|merge|ready` while the
[`pr-self-review`](../skills/pr-self-review/SKILL.md) gate is failing or stale.

**It cannot stop a merge.** `PreToolUse` fires only on Claude Code's `Bash` tool. A
push from a terminal, the VSCode Git panel, GitHub Desktop, or "Create pull
request" on github.com never reaches it. This is a self-discipline aid for the
agent-driven workflow. Real enforcement is a required GitHub check.

| File | Role |
|---|---|
| `pr-self-review-gate.sh` | Entry point. Resolves `node`, fails **safe** if it cannot. |
| `pr-self-review-gate.mjs` | The gate. Node built-ins only — lock files are off-limits here. |
| `test-gate.sh` | 23 offline cases. No model, no network, no API key. |

### What it does

1. Regex-tests the whole command string — compound commands (`a && git push`) are
   caught. `--dry-run`, `--delete` and `--tags` are exempt. **This happens before
   any subprocess**, so almost every Bash call in a session exits in ~40 ms.
2. Reads `$(git rev-parse --absolute-git-dir)/devdigest/pr-self-review.json`.
3. Denies if it is missing, unparseable, `mode: "fast"`, or stale — where stale
   means `branch`, `merge_base`, `head_sha` or `skills_digest` no longer match.
4. Recomputes the blockers itself from `findings[]`. **`report.gate` is never
   trusted**, the same way the product recomputes the model's score.
5. Denies if any unwaived, un-downgraded CRITICAL remains.

On a pass it prints **nothing** and exits 0. It never returns
`permissionDecision: "allow"` — that would bypass the normal permission prompt and
silently auto-approve every push.

### Overriding a false positive

**Waive one finding.** Create `.git/devdigest/pr-self-review.override.json`:

```json
{ "head_sha": "<the exact sha the report was written for>",
  "waived": [{
    "finding_id": "backend-architecture-1",
    "reason": "At least 40 characters explaining why this specific finding does not apply here.",
    "waived_by": "you@example.com",
    "waived_at": "2026-09-21T10:31:07Z"
  }] }
```

A waiver is honoured only when the sha matches current HEAD — **waivers do not
survive a new commit**, so you re-justify after changing the code. A reason under
40 characters is rejected as unauditable. Since `.git/` never leaves the machine,
also paste the trailer the skill prints into the PR description:

```
PR-Self-Review-Waiver: backend-architecture-1 — <reason>
```

**Dispute it** instead if you think the *review* is wrong rather than the rule
inapplicable: `/pr-self-review --dispute <id> "<argument>"` re-runs the verifier
with your argument, and it downgrades on the record if convinced.

**Break glass:** `PR_SELF_REVIEW_BYPASS=1 git push`. Allowed, and loudly announced
in the transcript. Log why in
[`suppressions.md`](../skills/pr-self-review/suppressions.md) — a rule that keeps
getting bypassed is a rule that needs fixing or deleting.

### Turning it off

Delete the `hooks` block from `.claude/settings.json`. Nothing else depends on it;
the skill still works when invoked by hand.

### Failure modes, by design

| Situation | Decision | Why |
|---|---|---|
| Report missing / stale / `fast` | `deny` | Nothing is known about the change |
| Unwaived CRITICAL | `deny` | The gate's whole purpose |
| Git missing, report unparseable, gate throws | `ask` | Our bug must not decide the push either way |
| `node` unresolvable | `ask` | See below |
| Pass | silent exit 0 | Leaves the normal permission flow intact |

**The `node` resolution problem.** A hook that exits non-zero is treated as an
*error* and the tool runs anyway. On this machine `node` is an asdf shim and
`env -i sh -c 'command -v node'` finds nothing — so a gate invoking `node` directly
could fail **open**, which is the worst possible outcome. The `.sh` wrapper
therefore tries `command -v node`, then asdf, volta, Homebrew, `/usr/local`,
`/usr/bin`, then the newest nvm/fnm install; and if all fail it emits an `ask`
decision and exits 0. `test-gate.sh` case 23 asserts this under `env -i`.

### After changing anything here

```bash
.claude/hooks/test-gate.sh
```

It builds a throwaway repo in `$TMPDIR`, so it never touches the real report.

## `implementer-guard`

A `PreToolUse` hook declared in the frontmatter of
[`../agents/implementer.md`](../agents/implementer.md), so it runs **only while the
`implementer` subagent is active** — not in `settings.json`, never for you or
other agents. It makes the root `AGENTS.md` "do not touch" list mechanical.

| File | Role |
|---|---|
| `implementer-guard.sh` | The guard. POSIX `sh`, no `node`; `jq` when present, `sed` fallback otherwise. |
| `test-implementer-guard.sh` | 138 offline checks (68 cases × jq/sed, plus 2 under `env -i`). |

| Tool call | Decision |
|---|---|
| Edit/Write under `server/src/db/migrations/`, any lock file, anything under `.claude/`, a `CLAUDE.md` / `CLAUDE.local.md` | `deny` |
| Edit/Write of a test — `*.test.ts(x)`, `server/test/**`, `reviewer-core/test/**`, `client/src/test/**`, `e2e/specs/*.flow.json` | `deny` — the [`test-writer`](../agents/test-writer.md) agent owns tests (`server/src/adapters/mocks.ts` stays allowed: it is production code) |
| Edit/Write of `server/src/db/schema*` or a `package.json` | `ask` — only for a change an approved plan Gate names |
| Bash: `git commit/push/reset/checkout/stash/…`, `gh pr`, `pnpm/npm add/remove/update`, `install` without `--frozen-lockfile`, `yarn`, `db:generate`, `drizzle-kit generate/push`, a write (`>`, `rm`, `mv`, `sed -i`, `tee`, …) into a protected path | `deny` |
| Anything else — including reading lock files and migrations, `git status/diff/log`, every test and typecheck command | silent exit 0 |
| Input it cannot parse (no `file_path`, no `command`, empty stdin) | `ask` |

**Not a sandbox.** It pattern-matches command text; `node -e` writing a lock file
or a script that runs `git commit` gets past it. It stops the implementer's
honest mistakes, which is what it is for; the real boundary for pushes is still
`pr-self-review-gate` plus a required GitHub check.

**Trusted workspaces only.** Claude Code skips a project agent's frontmatter hooks
until the folder is trusted, and a `claude -p` session never counts as trusted.

```bash
.claude/hooks/test-implementer-guard.sh
```

## `agent-scope-guard`

One `PreToolUse` hook, three profiles, declared in the frontmatter of five
agents — it runs **only while one of them is active**:

| Agent | Hook command |
|---|---|
| [`test-writer`](../agents/test-writer.md) | `agent-scope-guard.sh test-writer` |
| [`doc-writer`](../agents/doc-writer.md) | `agent-scope-guard.sh doc-writer` |
| [`planner`](../agents/planner.md), [`plan-verifier`](../agents/plan-verifier.md), [`architecture-reviewer`](../agents/architecture-reviewer.md) | `agent-scope-guard.sh read-only` |

| File | Role |
|---|---|
| `agent-scope-guard.sh` | The guard. POSIX `sh`, no `node`; `jq` when present, `sed` fallback otherwise — the same parser as `implementer-guard.sh`. |
| `test-agent-scope-guard.sh` | 256 offline checks (126 cases × jq/sed, plus 4 outside that loop: no `CLAUDE_PROJECT_DIR`, three under `env -i`). |

One script rather than four: the Bash rules are identical, and separate copies
would drift. `implementer-guard.sh` stays separate because it is already
verified and its profile differs (it may write production code).

### Edit / Write

The path is made repo-relative with `$CLAUDE_PROJECT_DIR`; without that
variable an absolute path cannot be placed, so the answer is `ask`.

| Path | test-writer | doc-writer | read-only |
|---|---|---|---|
| anything | — | — | `deny` |
| contains `..`, or outside the project | `deny` (except a path containing `devdigest-redproof-`) | `deny` | `deny` |
| migrations, lock files, `.claude/**`, `CLAUDE.md`, `INSIGHTS.md`, `package.json`, `*vitest.config.*`, `tsconfig*.json`, `next.config.*`, `drizzle.config.*`, `*/src/vendor/**` | `deny` | `deny` | `deny` |
| `server/test/**`, `reviewer-core/test/**`, `client/src/**/*.test.{ts,tsx}`, `e2e/specs/*.flow.json` | allow | `deny` | `deny` |
| `server/test/*.test.ts` (not `.it.test.ts`) whose content mentions `helpers/pg` | `deny` — rename to `.it.test.ts` | — | — |
| `server/test/helpers/**`, `client/src/test/**`, `server/src/adapters/mocks.ts` | `ask` | `deny` | `deny` |
| `AGENTS.md`, `*/specs/*.md`, `docs/agent-prompts/*.md` (not its README) | `deny` | `ask` | `deny` |
| `docs/**/*.md`, `<pkg>/docs/**/*.md`, any `README.md`, `TESTING.md` | `deny` | allow | `deny` |
| anything else | `deny` | `deny` | `deny` |

### Bash

| Command | test-writer | doc-writer, read-only |
|---|---|---|
| git state changes (`commit/push/reset/checkout/stash/restore/…`), `gh pr/release/repo/issue/api` | `deny` | `deny`; also `git add/rm/mv/fetch/config/gc/notes/update-ref/update-index` |
| `git worktree add/remove/…` | only with `devdigest-redproof-` in the command; `prune` always | `deny` (`list` is fine) |
| dependency changes, `yarn`, `npx -y`, `pnpx`, `pnpm dlx` | `deny` | `deny`; also any `npx` |
| `pnpm install` / `npm ci` | only `--frozen-lockfile` / `npm ci` | `deny` |
| `db:generate/migrate/seed/push`, `drizzle-kit generate/push/drop/migrate`, `docker rm/stop/volume/system`, `docker compose … down` | `deny` | `deny` |
| `vitest -u` / `--update` | `deny` | `deny` |
| `node -e`, `python -c`, `sh -c`, `eval`, `curl`, `wget` | `deny` | `deny` |
| a write: `>` / `>>` to anything but `/dev/null`, `rm/mv/cp/tee/touch/ln/mkdir/chmod/dd`, `sed -i`, `perl -i`, `find -delete/-exec` | only with `devdigest-redproof-` in the command | `deny` |
| anything else — `git status/diff/log/grep`, `grep`, `sed -n`, typecheck and test commands, `docker info` | silent exit 0 | silent exit 0 |
| input it cannot parse, unknown profile | `ask` | `ask` |

Quoted text is stripped before looking for redirects and write verbs, so
`grep -rn '</Modal>' src` or `grep -rn 'rm -rf' scripts` are reads, not writes.

**Not a sandbox.** It pattern-matches command text, like `implementer-guard`.
The red-proof marker is a whole-command exemption: `cp a "$TMPDIR/devdigest-redproof-1/" && rm b`
passes. An unquoted `>` inside an argument (`git log --format=%h>%s`) is
denied by the read-only profile — rephrase the command. It stops honest
mistakes; it does not stop an agent that is trying to get around it.

**Trusted workspaces only**, as for the implementer guard.

```bash
.claude/hooks/test-agent-scope-guard.sh
```

## Testing a hook end to end

The offline tests prove the decision table; they do not prove Claude Code runs
the hook. Two obvious ways to check that do **not** work in this repo:

- **Through an agent in this repo.** Ask `implementer` (or a plain `claude -p`)
  to edit a lock file and it refuses at its own Step 0, citing `AGENTS.md` — the
  hook never fires. It refused twice, even with "approved by the user" in the
  prompt.
- **Through a project agent in `-p`.** A project agent's frontmatter hooks are
  skipped in a `-p` session, which never counts as a trusted workspace.

What works (2026-09-24, binary 2.1.281):

- **Hook via `--settings`, in a throwaway dir.** Create a directory with dummy
  files (`server/pnpm-lock.yaml`, `server/src/a.ts`, `INSIGHTS.md`, …), `git
  init`, and **no `AGENTS.md`**, then run
  `"$CLAUDE_CODE_EXECPATH" -p '<steps>' --model haiku --permission-mode acceptEdits --settings '<json>'`,
  where the JSON declares the hook under `hooks.PreToolUse` with an absolute path
  to the script. Ask for each step as a separate tool call and "do not retry a
  denied step"; the denial appears in the stream as a `tool_result` starting
  with `PreToolUse:<Tool> hook error: <guard name>`.
- **An agent with its hooks:** pass the definition with `--agents '<json>'` —
  hooks declared there do run.
