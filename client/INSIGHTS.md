# Insights — client

UI decisions and dead ends. Read before restructuring pages, state, or the data
layer.

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
  `src/path/to/file.tsx:42`
```

Roughly 5 entries per section. Promote stable entries into `docs/` and delete
them here.

---

## Decisions

### 2026-09-20 — Restore a skill version by PUTting its body

**What:** the Versions tab Restore sends `PUT /skills/:id` with `{ body }`
of the chosen snapshot; `SkillsService.update()` already writes
`skill_versions` and bumps `version`.
**Why:** every body edit already snapshots; a dedicated restore route
would duplicate that write path.
**Rejected:** `POST /skills/:id/versions/:n/restore`.
`client/src/app/skills/_components/SkillDetail/_components/SkillVersionsTab/SkillVersionsTab.tsx`

### 2026-09-20 — Deselect all unaccepts; Reject still deletes

**What:** the conventions toolbar "Deselect all" sends `PATCH accepted:
false` per accepted row; card Reject stays `DELETE`.
**Why:** the homework mock has both controls, and D5/D6 still hold —
rejected rules must leave no trace, while deselect only drops them from
the skill draft.
**Rejected:** mapping Deselect all to DELETE (that would wipe accepted
rules the user only wanted un-ticked) and mapping Reject to PATCH-false
(the spec already found that a no-op against a boolean `accepted`).
`client/src/app/repos/[repoId]/conventions/_components/ConventionsView/ConventionsView.tsx`

### 2026-09-22 — Create-skill modal defaults to `repo-conventions`

**What:** the conventions Create skill modal seeds Name with
`CONVENTIONS_SKILL_NAME` (`repo-conventions`). Lookup still matches a
legacy `{repo}-conventions` skill via `skillNameForRepo` so D7 does not
spawn a duplicate.
**Why:** grading criterion 42 requires the fixed name; the earlier mock
preference for `{repo}-conventions` lost.
**Rejected:** keeping `skillNameForRepo` as the modal default (fails the
rubric) while only documenting a manual rename.
`client/src/app/repos/[repoId]/conventions/_components/ConventionsView/ConventionsView.tsx`

### 2026-09-20 — Skill name follows `{repo}-conventions`, still finds `repo-conventions`

**What:** ~~modal defaulted to `skillNameForRepo`~~ — superseded 2026-09-22
(default is now `repo-conventions`; helper kept for legacy lookup only).
**Why:** the mock shows `{repo}-conventions`; the spec's single-skill
rule (D7) must not spawn a second skill if one already exists under the
old name.
**Rejected:** hard-coding `repo-conventions` in the modal (fails the
mock) and creating a new skill whenever the preferred name is unused
(would duplicate on the next save).
`client/src/app/repos/[repoId]/conventions/_components/ConventionsView/helpers.ts`

## What Works

_None yet._

## What Doesn't Work

- **2026-09-26** — A flex row with `title { flex: 1; minWidth: 0 }` and a long
  `file:line` sibling without `whiteSpace: nowrap` + `textOverflow: ellipsis`
  on both makes the title wrap one word per line beside the path — reads as
  overlapping text on Risk Areas. Also avoid `all: "unset"` on the row button;
  reset only the properties you need. Intent must not sit in a half-empty
  `1fr 1fr` grid while Blast Radius is missing, or paths stay cramped.
  `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/IntentCard/RiskAreaRow/`

- **2026-09-18** — A correctly-worded i18n string sitting unused next to the
  wrong one it should have replaced went unnoticed for a whole feature: in
  `messages/en/prReview.json`, `timeline.findingsInRun` ("{count} findings in
  this run") was defined right after `timeline.findingsHoverTitle` ("{count}
  findings") but never referenced — `RunFindingsHoverCard.tsx:75` and
  `RunHistory.tsx:140` both called the wrong key. When a "fix the copy" task
  turns up a suspiciously well-worded key that isn't the one rendering,
  `grep -rn "<key>" src/` for every call site before assuming the string
  needs writing — it may already exist, just disconnected.

## Codebase Patterns

- **2026-09-25** — The Settings → Models picker lists only OpenRouter models
  (`useProviderModels("openrouter")`) and always saves
  `{ provider: "openrouter", model }`, so a `FEATURE_MODELS` default on any
  other provider (e.g. direct `anthropic`) cannot be chosen back in the UI.
  New feature-model defaults must use `openrouter` (`review_intent` is
  `deepseek/deepseek-v4-flash`), and the default has to be changed in BOTH
  registries: `server/src/vendor/shared/contracts/platform.ts` and the
  hand-mirrored `client/src/lib/feature-models.ts`. Evidence:
  `client/src/app/settings/[section]/_components/SettingsView/_components/SettingsModels/SettingsModels.tsx:24,32`.

- **2026-09-20** — Vendor `NAV` ships Agents under WORKSPACE. Move it into
  SKILLS LAB by splicing that same item object in
  `client/src/components/app-shell/nav.ts` — do not edit `vendor/ui/nav.ts`.
  Insert after Skills *before* Conventions is pushed so the lab order is
  Skills, Agents, Conventions. Re-running the register is a no-op: Agents
  is already gone from WORKSPACE.
  `client/src/components/app-shell/nav.ts`

- **2026-09-18** — To let a parent drive a child's internal filter state
  without a rewrite, add optional `<value>`/`on<Value>Change` props and branch
  on `isControlled = controlledValue !== undefined`, keeping the existing
  local-`useState` path as the default when the props are omitted. Used to
  lift `FindingsPanel`'s severity filter into `ReviewRunAccordion` (so new
  "N CRITICAL · N WARNING" pills in `VerdictBanner` and the panel's own
  toolbar counters share one filter) — every existing uncontrolled caller and
  test kept working unmodified because the props default to `undefined`.
  `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/FindingsPanel.tsx:16-49`

- **2026-08-04** — Before adding a new hook/endpoint to show "more detail on
  X" in a component, check whether the detail is already fetched elsewhere on
  the same page and can be threaded down as a prop instead. `RunHistory` only
  ever received `RunSummary[]` (denormalized `critical_count`/`warning_count`/
  `suggestion_count`, no finding detail), but `FindingsTab` — its direct
  parent — already holds the full `ReviewRecord[]` (each with a `findings:
  FindingRecord[]` and `run_id`) via `usePrReviews`. Adding a hover preview of
  a run's findings needed only `new Map(runs.map(r => [r.run_id,
  r.findings]))` in `FindingsTab` passed down as `findingsByRun`, zero new
  API/hook. `client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:75`

## Tool & Library Notes

- **2026-09-19** — Importing a VALUE (not a type) from `@devdigest/shared` in client code breaks `next build` with `Module not found: Can't resolve './contracts/knowledge.js'`: the vendored package is NodeNext-style TS (`from "./x.js"` meaning `x.ts`), which vitest and `tsc` resolve but webpack does not. Until now every client import from it was `import type`, erased before bundling. `next.config.mjs` now maps `.js` → `.ts` via `resolve.extensionAlias`; `pnpm build` (not typecheck/test) is the check that catches this. Building also rewrites `.next`, so restart a running `next dev` afterwards. Evidence: `client/next.config.mjs`, `src/app/skills/_components/SkillsView/_components/SkillEditorDrawer/helpers.ts` (imports the `SkillInput` zod schema).

- **2026-08-04** — This dev environment's seeded Postgres has zero
  `agent_runs` rows with `findings_count > 0` across all 3 seeded repos
  (`acme/payments-api`, `myasoid/dev-digest`, `quarkusio/quarkus`) — every
  seeded review is a clean 0-findings/100-score run. To visually verify any
  findings-related UI change, either trigger a real (costly) LLM review run,
  or temporarily `INSERT` rows into `findings` + bump the matching
  `agent_runs.critical_count`/`warning_count`/`suggestion_count`/
  `findings_count`, screenshot, then delete/revert immediately after —
  confirmed safe and fully reversible on the local dev DB
  (`postgres://devdigest:devdigest@localhost:5432/devdigest`). Separately, no
  `chromium-cli` or `agent-browser` CLI was present in this sandbox; `npx
  playwright install chromium` (no `--with-deps`, which needs sudo) downloads
  a working headless Chromium fine, so a scratch `npm install playwright` +
  a small driver script is the fallback for one-off browser verification here.

- **2026-09-19** — `@devdigest/ui` `Textarea`, `SelectInput` and `Toggle` accept no `id`/`aria-label`, and `FormField`'s `<label>` has no `htmlFor`, so `getByLabelText` cannot reach them. The skill Config tab therefore uses native `<input>/<textarea>/<select>` with `useId()` + `<label htmlFor>`, and wraps each `Toggle` in `<span role="group" aria-label>`. For master–detail state in the URL, tests mock `next/navigation` with a `useSyncExternalStore`-backed `useSearchParams` so `router.replace` really re-renders. Evidence: `src/app/skills/_components/SkillDetail/_components/SkillConfigTab/`, `SkillsView.test.tsx`.

## Recurring Errors & Fixes

- **2026-09-26** — A new PR-scoped query key goes stale unless it is added to
  the invalidations by hand: `useFindingAction`, `useRunReview`,
  `useDeleteRun` and `useDeleteReview` in `src/lib/hooks/reviews.ts` each
  invalidate `["reviews", prId]` only. `["smart-diff", prId]` had to be added
  next to each, plus in `onRunDone` in the PR `page.tsx`. `useRunReview`
  fires when the POST returns, before the SSE run finishes, so it is not
  enough on its own. Also: `@testing-library/user-event` is not installed in
  `client/`; use `fireEvent`.

- **2026-08-04** — `fireEvent.mouseEnter` on a component whose hover-open
  logic uses `setTimeout` (e.g. an open delay to survive a mouse
  pass-through) needs `vi.useFakeTimers()` **and** the timer advance wrapped
  in `act()` from `@testing-library/react`:
  `act(() => { vi.advanceTimersByTime(150); })`. Without the `act()` wrapper,
  the state update from the timer callback doesn't flush before the
  assertion runs — `aria-expanded` stays `"false"` and the popover content is
  never found, even though the component logic is correct.
  `client/src/app/repos/[repoId]/pulls/[number]/_components/RunHistory/RunHistory.test.tsx`

- **2026-08-01** — A vitest failure whose two sides look identical —
  `expected '9 119 tok' to be '9 119 tok'` — is a look-alike Unicode space, not
  an environment difference. `formatTokenCount` had a literal THIN SPACE
  (U+2009) typed into `.replace(/,/g, " ")`, invisible in the diff and in the
  test output. Dump code points first —
  `[...s].map((c) => c.charCodeAt(0).toString(16))` — before theorising about
  ICU or jsdom locale data, which is where this was initially misdiagnosed.
  Group digits with `.replace(/\B(?=(\d{3})+(?!\d))/g, " ")` rather than
  `toLocaleString` plus a separator swap, so the separator is a plain U+0020 a
  test can type. Find strays with `rg '\x{2009}' src/`.
  `client/src/lib/format.ts:40`

## Open Questions

_None yet._
