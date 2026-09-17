# Engineering Insights — reference

Read this when you are about to write an entry. `SKILL.md` covers the protocol; this
covers the judgment calls: which section, is it already there, and how to keep the file
from rotting.

## Which section?

Work down the list and take the first match — the order encodes value, not just
grouping.

1. **Has this error bitten before?** (you can point at an earlier occurrence, in the
   file or in git history) → **Recurring Errors & Fixes**
2. **Did an approach fail?** dead end, antipattern, something that looked right and
   wasn't → **What Doesn't Work**
3. **Is it a dependency's behaviour?** version quirk, undocumented limit, tooling
   surprise → **Tool & Library Notes**
4. **Is it a rule about this codebase?** a convention, a boundary, an architectural
   decision you can't read off the code → **Codebase Patterns**
5. **Did an approach work, non-obviously?** a technique worth reaching for again here →
   **What Works**
6. **Is it unresolved?** you hit it, you didn't settle it → **Open Questions**
7. **None of the above, and still worth keeping?** → **Session Notes**, dated

If it's between two sections, pick the one the next agent would search first. Don't
cross-post the same entry into two sections — a duplicate that drifts is worse than a
slightly misfiled entry.

## Good and bad, per section

### What Works
- ❌ "Tests are useful here" — true of everywhere, says nothing
- ✅ "Flow tests run hermetically via `pnpm e2e:hermetic` (`scripts/e2e.sh`), not
  `pnpm start` — the watch-mode server races the runner and fails ~1 in 4
  (`e2e/run.ts:120`)"

### What Doesn't Work
- ❌ "Don't break the build"
- ✅ "Don't import `@devdigest/shared` expecting a workspace symlink — it's a
  hand-duplicated copy in `client/src/vendor/shared/` and `server/src/vendor/shared/`.
  Editing one and assuming the other follows silently ships a mismatch."

### Codebase Patterns
- ❌ "The server uses Fastify"  (in `server/CLAUDE.md` already — don't restate docs)
- ✅ "`src/modules/*` may import from `src/platform/*`, never the reverse — platform is
  the cross-cutting layer and a back-import creates a cycle tsc won't catch until build"

### Tool & Library Notes
- ❌ "Drizzle is the ORM"
- ✅ "`drizzle-kit` regenerates the full snapshot on `db:generate` — reviewing only the
  new SQL file hides column drops that landed in the snapshot (`server/src/db/`)"

### Recurring Errors & Fixes
- ❌ "Migrations can break"
- ✅ the journal-corruption entry already in `server/INSIGHTS.md` — symptom, cause, why
  CI masked it, the rule, the commit. Use it as the template.

### Session Notes
- ❌ "Worked on the reviewer pipeline today, made good progress"
- ✅ "2026-09-17 — Chose to keep grounding in `reviewer-core` rather than `server` so
  the pipeline stays runnable without a DB. Revisit if grounding needs pgvector."

### Open Questions
- ❌ "Should we refactor this?"
- ✅ "Unclear whether `e2e` flow specs should live in `e2e/specs/` or beside the feature
  they test — currently split, and nobody knows which is intentional"

## Is it already there?

Re-reading the file is mandatory before writing, but a literal string match isn't the
test — the same lesson gets written in different words. Before appending, ask:

- **Same file or symbol?** Search the INSIGHTS.md for the path, module, or library name
  in your candidate. Most duplicates share one.
- **Same root cause, different symptom?** "migrations fail on fresh DB" and "columns
  missing after merge" were one entry. If the `**Rule:**` line you'd write is a
  restatement of an existing `**Rule:**`, it's a duplicate.
- **Same rule, narrower case?** Don't add an entry that's a special case of one already
  there. If the existing rule doesn't quite cover your case, append a dated correction
  or extension beneath it instead.

Corrections look like this, directly under the entry they amend:

```markdown
> **2026-09-17 correction:** `pnpm db:generate` now refuses to overwrite a diverged
> journal (drizzle-kit 0.31), so the manual check below is belt-and-braces, not the
> only guard. (`server/package.json:14`)
```

Keeping the original visible is the point: the next reader learns what was believed and
why it changed, which is usually more useful than the corrected fact alone.

## Keeping the file worth reading

**Cap: ~30 live entries per module.** Past that, signal-to-noise falls and people stop
opening it. The rule that keeps it honest: **adding something new means removing
something obsolete.**

**Prune monthly.** Delete entries that:
- reference a bug that's now fixed
- duplicate another entry
- have never once been useful

Deleting is the one time you don't append. An entry about a quirk in a library version
you no longer run isn't neutral clutter — it's an active instruction to do the wrong
thing.

**Resolve contradictions explicitly.** If one entry says "always X here" and another
says "X fails here", the agent picks at random. When you spot a conflict, don't leave
both standing — reconcile them into one entry and note the date.

**Splitting.** If a module's file genuinely needs more than ~30 entries, split by domain
(`INSIGHTS-db.md`, `INSIGHTS-auth.md`) and link them from the module's `INSIGHTS.md`.
Splitting beats pruning something still true.

## This file is a draft, not scripture

A wrap-up gets you ~90% of the way; the model can summarize a session wrong. Entries are
committed to git, so a bad wrap-up is one `git revert` away, and a human spot-check is
expected. If an entry contradicts what you observe in the code, trust the code and
append a correction.
