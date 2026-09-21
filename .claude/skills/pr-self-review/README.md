# PR Self Review Skill

**Version:** 1.0.0
**Compiled:** 2026-09-21

## What this skill is

A project-authored orchestration skill that reviews a branch's diff against `main` before
it becomes a GitHub PR, and blocks opening/merging it when a critical finding turns up. It
does not implement its own correctness/security/architecture review — it routes changed
files to the skills that already cover those (`security`, `code-review`,
`react-best-practices`, `onion-architecture`, `fastify-best-practices`,
`drizzle-orm-patterns`, `postgresql-table-design`, `next-best-practices`,
`frontend-ui-architecture`, `zod`, `react-testing-library`, `typescript-expert`), aggregates
their findings, and adds a merge gate on top.

## When this skill fires

- Manually: `/pr-self-review`, or asking "review my changes before I open a PR" / "is this
  ready to PR".
- Automatically: a `PreToolUse` hook (below) blocks any Bash call that runs `gh pr create`
  or `gh pr merge` until this skill has produced a fresh verdict for the current diff.

## Files in this skill

| File | Contents |
|---|---|
| [SKILL.md](SKILL.md) | Entry point: scope computation, the fan-out algorithm, the write-verdict step, and the report/gate step. |
| [routing.md](routing.md) | The file→skill bucket table, always-excluded generated paths, and what's cross-cutting vs domain-specific. |
| [gate.md](gate.md) | Per-skill CRITICAL mapping, the BLOCKED rule, the status-file schema, and the override/acknowledge protocol. |
| `scripts/diff-hash.sh` | Hashes the review-relevant diff (merge-base…HEAD + uncommitted, generated paths excluded) — the cache key for a verdict. |
| `scripts/check-gate.sh` | The gate: hook entrypoint and manual/`--acknowledge` use. |
| README.md (this file) | Overview, version, hook wiring, requirements. |

## Hook wiring

Add to `.claude/settings.json` (project-level, checked in — not `settings.local.json`):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/skills/pr-self-review/scripts/check-gate.sh"
          }
        ]
      }
    ]
  }
}
```

The hook fires on every Bash call, but `check-gate.sh` reads the hook's JSON payload and
exits `0` immediately for anything that isn't `gh pr create`/`gh pr merge` — it only ever
blocks those two commands. Blocking is a real technical gate (a nonzero exit denies the
tool call), not just an instruction the agent could skip — but the *content* gate (a
BLOCKED verdict) is intentionally overridable via `--acknowledge`, which requires an
explicit user confirmation in chat first. See [gate.md](gate.md#override--acknowledge-protocol).

## Requirements

- `bash`, `git`, `sha256sum` (all present in Git Bash on Windows and any Linux/macOS shell).
- `jq` is used for hook-payload parsing if present, with a `grep`/`sed` fallback if not —
  no hard dependency either way.
- No Node/Python dependency; the scripts are plain POSIX-ish bash so they work identically
  in the `server`/`client`/`reviewer-core`/`e2e` package split without picking a package
  manager.

## Relationship to sibling skills

- **`code-review`, `security-review`** — already diff-aware, already have severity/effort
  levels; this skill calls them for the whole scoped diff rather than re-implementing
  general correctness/security review (see [SKILL.md](SKILL.md) Step 1).
- **`react-best-practices`, `next-best-practices`, `frontend-ui-architecture`,
  `react-testing-library`** — UI-specific, dispatched only on their matched files
  ([routing.md](routing.md)).
- **`onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`,
  `postgresql-table-design`** — backend-specific, same treatment.
- **`zod`, `typescript-expert`** — cross-cutting, dispatched conditionally
  ([routing.md](routing.md)).
- **`engineering-insights`, `mermaid-diagram`** — not review skills, never routed to.

## What this skill deliberately does not do

- Does not re-review whole files — only lines the diff actually touches (see
  [SKILL.md](SKILL.md) Step 2's hunk-scoping instruction), so pre-existing issues unrelated
  to the PR don't trigger the gate.
- Does not hard-block on the *content* of a BLOCKED verdict — only on the *absence* of a
  fresh review. A deliberate, chat-confirmed override is always possible, and is recorded
  both locally (status file) and in the PR body (audit trail).
- Does not touch `server/src/db/migrations/**` or lock files — these are generated/
  immutable per [AGENTS.md](../../../AGENTS.md) and excluded from scope entirely.
- Does not provide a hard block on GitHub's own Merge button — that would require branch
  protection + a required CI status check, which is outside what a local Claude Code hook
  can enforce. This skill gates the *local* path to opening/merging a PR from this session;
  a true GitHub-side block is a separate, optional infra follow-up.

## Changelog

- **1.0.0** (2026-09-21) — Initial version: routing table, severity mapping, diff-hash
  caching, and the hook-enforced/chat-overridable gate.
