# server/ — Insights

Running log of gotchas, tricky bugs, and rationale for non-default decisions in
this module. Linked from [CLAUDE.md](./CLAUDE.md) — not inlined there because
this list is expected to grow and change often (volatile by design).

Format: newest first within each section. One entry = one decision or one
gotcha. Keep entries short; link to code/PR/commit for the full story instead
of re-explaining it here.

---

## What Works

## What Doesn't Work

## Codebase Patterns

### 2026-09-16 — Score is always recomputed from grounded findings
Models reliably return a self-reported `score` inconsistent with their own
findings list. Fix: `scoreFromFindings()` recomputes deterministically
(0 findings ⇒ 100; −35/−12/−3 per CRITICAL/WARNING/SUGGESTION) and the model's
number is discarded outright. Do not reintroduce a path that reads the model's
`score` field.

### 2026-09-16 — Shared contracts are vendored, not a real shared package
`@devdigest/shared` lives at `server/src/vendor/shared` **and separately** at
`client/src/vendor/shared` — copy-pasted, not symlinked, because there's no
workspace tool. Editing one without the other silently desyncs request/response
contracts between client and server with no compiler error until runtime.

## Tool & Library Notes

### 2026-09-16 — `server/package.json` is `skip-worktree`
A local variant of `package.json` diverges from the committed file on some dev
machines (`git update-index --skip-worktree` hides that from `git status`).
**Consequence:** CI cannot rely on committed `test`/`typecheck` npm scripts
matching what's actually run locally — it invokes `pnpm exec vitest run …`
directly instead. If you add or rename a script, check
`git ls-files -v | grep '^S'` first or your change may silently not apply for
whoever has the skip-worktree bit set.

## Recurring Errors & Fixes

## Session Notes

## Open Questions

---

<!-- Add new entries above this line within the relevant section, newest first. -->
