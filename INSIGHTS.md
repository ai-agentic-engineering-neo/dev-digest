# DevDigest — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it rather than editing it away.

This is the **root** file: it holds only findings that cross package boundaries.
Anything scoped to one package lives in that package's file —
[`client`](client/INSIGHTS.md) · [`server`](server/INSIGHTS.md) ·
[`reviewer-core`](reviewer-core/INSIGHTS.md) · [`e2e`](e2e/INSIGHTS.md).

Sections are fixed. Add to the one that fits; never invent a new heading.

## What Works

## What Doesn't Work

- **2026-07-29** — Editing `client/src/vendor/shared/` alone silently desyncs the client from the API: it is a hand-copy of the canonical `server/src/vendor/shared/`, there is no sync script, and it already lags in 5 files. Evidence: `diff -rq server/src/vendor/shared client/src/vendor/shared`.

  | File | Missing on the client side |
  |------|----------------------------|
  | `adapters.ts` | `sessionId` on the LLM call; `'openrouter'` in the provider union; `CommitFile` / `CommitFilesPayload` |
  | `contracts/eval-ci.ts` | the whole `AgentManifest` schema; the `Provider` / `CiFailOn` imports |
  | `contracts/knowledge.ts` | `'openrouter'` notes; expanded `CiFailOn` policy comments; the `agent_versions` config-snapshot block |
  | `contracts/productionize.ts` | `'openrouter'` in the provider enum |
  | `contracts/trace.ts` | comment wording only (harmless) |

  Every gap is OpenRouter- or CI-runner-related, so the client cannot currently express an OpenRouter-backed agent even though the API accepts one.

- **2026-07-29** — `.claude/skills/README.md` documents a `.cursor/skills → ../.claude/skills` symlink that does not exist, so Cursor gets no skills here. Evidence: `ls .cursor` → no such directory.

## Codebase Patterns

- **2026-07-29** — `.gitignore` carries un-ignore rules for an `agent-runner/dist/` that does not exist yet; they are pre-staged for the Export-to-CI lesson (L06), not leftovers to clean up. Evidence: `.gitignore:3-6`, `reviewer-core/README.md:7-9`.

## Tool & Library Notes

- **2026-07-29** — Half this repo is pnpm and half is npm, so running `pnpm install` in `reviewer-core/` or `e2e/` would create a second competing lockfile — match the lockfile already in the directory, not the root README's pnpm prerequisite.

  | Package | Lockfile |
  |---------|----------|
  | `server/`, `client/` | `pnpm-lock.yaml` |
  | `reviewer-core/`, `e2e/` | `package-lock.json` |

- **2026-07-29** — `skills-lock.json` disagrees with `.claude/skills/` in both directions, so it cannot be read as an index of available skills; read the directory. Evidence: lock-only — `architecture-patterns`, `github-workflow-automation`; disk-only — `mermaid-diagram`, `react-best-practices`, `react-testing-library`, `security`.

## Recurring Errors & Fixes

## Session Notes

- **2026-07-29** — Wrote per-module `CLAUDE.md` files and swept the repo for drift while doing it; every entry here and in the per-module files came from that sweep. The `engineering-insights` skill was built in the same session.
- **2026-07-29** — Run Cost Badge lab re-added per-run cost (`agent_runs.cost_usd`, migration 0010) that commit `d45ab0d` had deliberately removed — the removal only disconnected persistence/UI, `reviewer-core` kept computing `ReviewOutcome.costUsd` the whole time, so the re-add was a one-field reconnect. Evidence: `reviewer-core/src/review/run.ts:216`.

## Open Questions

- **2026-07-29** — Is the client's vendored `@devdigest/shared` copy meant to be synced by a manual step someone knows about, or was it simply forgotten? Nothing in `scripts/` or CI touches it, and the drift is one-directional.
- **2026-07-29** — Are `architecture-patterns` and `github-workflow-automation` in `skills-lock.json` planned additions or removed skills whose lock entries were never cleaned?
