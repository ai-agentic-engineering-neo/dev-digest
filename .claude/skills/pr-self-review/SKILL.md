---
name: pr-self-review
description: "Manual Workflow dispatcher for reviewing the current git diff or PR. Use when the user asks to self-review a PR, run pr-self-review, or review mixed client/server changes. Never auto-invoke on git push or other git hooks. Loads ui-architecture for client/ changes and onion-architecture for server/ or reviewer-core/ changes; a mixed diff loads both at once."
metadata:
  type: workflow
  tags: workflow, pr-review, dispatcher
---

# pr-self-review

Manual **Workflow** skill. It does not review code itself — it decides **which architecture skills to load**, then follows them.

## Hard rules

1. **No auto-call.** Do not install, enable, or run a git hook (`pre-push`, `pre-commit`, `commit-msg`). This skill runs only when the user invokes it.
2. **Dispatcher, not a duplicate.** Do not paste the contents of other skills into the review. Read the matching `SKILL.md` files and apply them.
3. **Mixed diffs load both packs at once.** If the diff touches frontend and backend, load both sets in the same turn — never pick only one.

## When this runs

The user explicitly asks to self-review, or names this skill. Typical trigger: a local diff or PR that is not going through the studio "Run Review" button.

## Step 1 — Collect the diff

Use the user-supplied diff if they pasted one. Otherwise:

```sh
git diff --name-only HEAD
git diff HEAD
```

If they name a branch or PR, diff against that merge-base. Stay read-only; do not commit, push, or amend.

## Step 2 — Classify paths

| Path prefix | Pack |
|---|---|
| `client/` | Frontend — `ui-architecture` (and `react-best-practices` / `next-best-practices` only if the hunks need them) |
| `server/` | Backend — `onion-architecture` |
| `reviewer-core/` | Backend — `onion-architecture` |
| other (`e2e/`, `docs/`, root) | No architecture pack unless a hunk clearly belongs to client or server |

A path can match only one pack. A **diff** can match both.

## Step 3 — Load skills

- **Frontend-only** → read `.claude/skills/ui-architecture/SKILL.md` and review with that.
- **Backend-only** → read `.claude/skills/onion-architecture/SKILL.md` and review with that.
- **Both** (`client/` plus `server/` and/or `reviewer-core/`) → read **both** skill files **before** commenting, then apply both rule sets to the matching hunks in one review.

Do not load `pr-self-review` recursively.

## Step 4 — Review

Report findings grouped by pack. Cite `file:line`. Frontend hunks: colocation, `_components/`, no cross-feature imports, tests next to the source. Backend hunks: `routes.ts` → `service.ts` → port ← `repository.ts`/`adapters/*`; no adapter call from a route; dependencies point inward.

If a hunk is out of scope for both packs, say so in one line and skip it.
