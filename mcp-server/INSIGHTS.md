# Insights — mcp-server

Design decisions for the local MCP server. Read before adding a tool or
changing how it talks to the DevDigest API.

Read at the start of a task, written at the end of one, by the
`engineering-insights` skill. Sections are fixed — add to the one that fits,
newest first. If it would be obvious to anyone reading the code, leave it out.

Formats — `Decisions` takes prose; every other section takes a dated bullet:

```markdown
### YYYY-MM-DD — <short title>

**What:** the decision, in one sentence.
**Why:** the constraint that forced it.
**Rejected:** what we tried or considered, and how it failed.
```

```markdown
- **YYYY-MM-DD** — <the claim, specific enough to act on cold>.
  `src/path/to/file.ts:42`
```

Roughly 5 entries per section. Promote stable entries into `docs/` and delete
them here.

---

## Decisions

### 2026-08-22 — Hand-mirror trimmed `@devdigest/shared` shapes instead of aliasing the real package

**What:** `src/types.ts` hand-copies only the fields each tool needs
(`AgentSummary`, `Repo`, `PrMeta`, `RunSummary`, `ReviewRecord`,
`ConventionCandidate`, ...) from `@devdigest/shared`'s contracts, each
comment-tagged with the source file it mirrors, instead of tsconfig-aliasing
`server/src/vendor/shared` as live TypeScript source.
**Why:** `mcp-server` is meant to stay a genuinely standalone npm package
(own `package-lock.json`, outside the pnpm workspace, per the repo's "not a
monorepo" convention) — `reviewer-core` proves the alias mechanism works
across the npm/pnpm boundary, but pulling it in here would make `mcp-server`
depend on `server/`'s internal layout for compilation.
**Rejected:** aliasing `@devdigest/shared` as source. This is a **third**
hand-copy of these contracts — `client/src/vendor/shared/` is the second, and
root `INSIGHTS.md` already documents it drifting by 5 files with no sync
script. Accepted here for the same reason it was accepted there, with the
same risk: nothing will flag `mcp-server/src/types.ts` going stale when a
contract shape changes upstream. Re-check it by hand whenever a route this
package calls changes its response shape.
