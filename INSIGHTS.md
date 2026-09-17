# dev-digest — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it rather than editing it away.

Sections are fixed. Add to the one that fits; never invent a new heading.

Routing: an insight local to one package goes in that package's `INSIGHTS.md`
(`server/`, `client/`, `reviewer-core/`, `e2e/`). Anything crossing a package
boundary — and anything about `@devdigest/shared`, which exists in two copies —
belongs here.

## What Works

- **2026-09-16** — Consuming `reviewer-core` and `@devdigest/shared` as TypeScript source through tsconfig `paths` keeps one Zod definition serving as request validator, response serializer, client type, and LLM JSON Schema, with no build step between packages. Evidence: `server/tsconfig.json` `paths`, `client/tsconfig.json:22`.

## What Doesn't Work

- **2026-09-16** — `@devdigest/shared` is vendored twice and the copies have already diverged, so editing `client/src/vendor/shared/` alone desyncs it from the API — change the server copy first, then mirror. Evidence: `server/src/vendor/shared/adapters.ts:83` declares `'openai' | 'anthropic' | 'openrouter'` where `client/src/vendor/shared/adapters.ts:77` still has `'openai' | 'anthropic'`.

- **2026-09-16** — `docker compose down -v` to "reset" the database deletes the named volume, not just the container, taking every imported repo and stored review with it; use `scripts/e2e.sh`, which runs its own volume-less Postgres. Evidence: `docker-compose.yml:22-24`.

- **2026-09-16** — `skills-lock.json` is not an inventory of `.claude/skills/`: it still pins `architecture-patterns` and `github-workflow-automation`, neither of which has a folder on disk, while `mermaid-diagram`, `react-best-practices`, `react-testing-library`, and `security` exist but are unpinned — read the directory, never the lock, to learn which skills are actually installed. Evidence: `skills-lock.json:4`, `skills-lock.json:22` vs `.claude/skills/README.md:9-19`.

- **2026-09-16** — The `.cursor/skills/ → ../.claude/skills` symlink that the skills README documents does not exist in the repo, so skills resolve in Claude Code only; a Cursor user who trusts that line gets no skills and no error to explain why. Evidence: `.claude/skills/README.md:3`.

## Codebase Patterns

- **2026-09-16** — `reviewer-core`'s raw source is imported by the API at runtime, so its `node_modules` must be installed separately or the API crashes on boot even though nothing references the package directly in `server/package.json`. Evidence: `scripts/dev.sh:78-80`.

- **2026-09-16** — Insight capture is instructed, never hooked, and the absent `.claude/settings.json` is the deliberate state: `Stop` fires at the end of every assistant turn rather than at session end, and `SessionEnd` can run a command but cannot feed anything back to Claude, so no honest "always at session end" trigger exists — the `Session Protocol` in `CLAUDE.md` carries it until L06 introduces the hook. Evidence: `CLAUDE.md:21-26`, `.claude/skills/engineering-insights/SKILL.md:14-21`.

## Tool & Library Notes

- **2026-09-16** — A DB-backed server test not named `*.it.test.ts` runs in the unit lane and fails there without Docker; the split is by filename, not by content. Evidence: `TESTING.md:79`.

## Recurring Errors & Fixes

## Session Notes

- **2026-09-16** — Added `CLAUDE.md` maps plus `docs/` and `specs/` to each package, and moved the deep sections out of the package READMEs into `docs/`. Entry points: [CLAUDE.md](CLAUDE.md), [docs/architecture.md](docs/architecture.md), [specs/review-flow.md](specs/review-flow.md).

## Open Questions

- **2026-09-16** — Whether the `client`/`server` divergence in `@devdigest/shared` is deliberate (the client may intentionally have no `openrouter`, `commitFiles`, or `sessionId` surface) or drift that should be reconciled; nothing in either tree states the intent.
