# reviewer-core/ — `@devdigest/reviewer-core` (pure review engine)

Module guide. Root map: [../CLAUDE.md](../CLAUDE.md).

Diff → prompt → LLM → reduce → grounding gate → score. **No DB, GitHub or
filesystem access** — callers (the server, the CI runner) inject everything.

## Read when

- Any reviewer-core task → first read [INSIGHTS.md](INSIGHTS.md) (agent-written lessons).
- Pipeline stages and public API → [README.md](README.md)
- Prompt blocks, output conventions, severity/gate → [../docs/agent-prompts/README.md](../docs/agent-prompts/README.md)
- Deeper design notes → [docs/](docs/) · feature specs and plans → [specs/](specs/)

## Layout

```
src/review/run.ts      reviewPullRequest(): select mode → prompt → LLM → reduce → ground; sums tokens + costUsd
src/prompt.ts          prompt assembly (system, repo_map, callers, diff, …)
src/grounding.ts       grounding gate: keeps findings that point at changed lines
src/review/reduce.ts   merge chunk reviews
src/llm/openrouter.ts  OpenRouter client (real cost in usage.cost)
```

## Commands (run inside `reviewer-core/`, package manager is **npm**)

```sh
npm run typecheck
npm test
```

## Conventions

- Keep it pure: no imports from `server/` or `client/`, no I/O. New inputs are
  passed in as arguments.
- The server compiles this package from source (`../reviewer-core/src` alias), so
  after a change also run `pnpm typecheck` in `server/`.
- Do not edit `package-lock.json` by hand; no new dependencies without asking.
