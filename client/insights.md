# client — insights

Durable findings for `@devdigest/web`: things that are true about this code but not
visible in it. Recorded by agents at the end of a non-trivial task, per
[`CLAUDE.md`](CLAUDE.md) → *After finishing*.

Append-only; correct a stale entry with a dated note beneath it. Every entry cites
evidence. Fixed sections — never invent a heading. Cross-package findings live in
[`../insights.md`](../insights.md) instead.

## Gotchas & fixes

- **2026-09-18** — `client/src/vendor/shared/` is a hand-copy of the canonical
  `server/src/vendor/shared/`. There is no sync script, and it already lags in 5
  files. Evidence: `diff -rq server/src/vendor/shared client/src/vendor/shared`.

  | File | Missing on the client side |
  |------|----------------------------|
  | `adapters.ts` | `sessionId` on the LLM call; `'openrouter'` in the provider union; `CommitFile` / `CommitFilesPayload` |
  | `contracts/eval-ci.ts` | the whole `AgentManifest` schema; `Provider` / `CiFailOn` imports |
  | `contracts/knowledge.ts` | `'openrouter'` notes; expanded `CiFailOn` policy comments; the `agent_versions` config-snapshot block |
  | `contracts/productionize.ts` | `'openrouter'` in the provider enum |
  | `contracts/trace.ts` | comment wording only (harmless) |

  Every gap is OpenRouter- or CI-runner-related, so the client cannot currently
  express an OpenRouter-backed agent even though the API accepts one.

## Codebase patterns

## Rejected approaches

## Open questions

- **2026-09-18** — Is the client's vendored `@devdigest/shared` copy meant to be
  synced by a manual step someone knows about, or was it simply forgotten? Nothing in
  `scripts/` or CI touches it, and the drift is one-directional.
