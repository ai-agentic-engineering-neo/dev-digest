# spec — routes, their data, and their URL contract

Every screen in the studio, what it fetches, and which URL state it owns. This
is the contract an agent should check before adding a route or changing a query
parameter — the params below are shareable links and deep-link targets, so
renaming one breaks bookmarks and the e2e flows that assert on them.

Architecture: [`../docs/ui-architecture.md`](../docs/ui-architecture.md).

## Route table

| Route | File | Renders | Data |
|---|---|---|---|
| `/` | `app/(shell)/page.tsx` | redirect | `useRepos` → replaces with the first repo's PR list; no repos → onboarding CTA |
| `/onboarding` | `app/onboarding/page.tsx` | add-repository form | `useAddRepo` → `POST /repos` |
| `/repos/:repoId/pulls` | `app/(shell)/repos/[repoId]/pulls/page.tsx` | PR list table | `usePulls`, `useRepoIntelStatus` |
| `/repos/:repoId/pulls/:number` | `.../pulls/[number]/page.tsx` | PR detail, three tabs | `usePulls` (number→id), `usePullDetail`, `usePrReviews`, `usePrRuns`, `usePrActiveRuns` |
| `/agents` | `app/(shell)/agents/page.tsx` | agent list + create modal | `useAgents` |
| `/agents/:id` | `app/(shell)/agents/[id]/page.tsx` | agent editor | `useAgent`, `useProviderModels`, `useUpdateAgent` |
| `/settings/:section` | `app/(shell)/settings/[section]/page.tsx` | API keys / models | `useSettings`, `useSecretsStatus`, `useTestConnection` |
| `/skills` (and `/skills/:id`) | client's choice — a `[id]` route or a `[[...id]]` catch-all | the skills list/detail route: master-detail; no selection renders the list only, selecting a skill opens its detail pane | `GET /skills`, `GET /skills/:id` + its sub-resources (`server/specs/skills.md`) |
| `/skills/new` | client's choice | create-skill form | `POST /skills` (`server/specs/skills.md`) |
| `/repos/:repoId/conventions` | `app/(shell)/repos/[repoId]/conventions/page.tsx` | convention candidates for the repo, Run Scan / Re-scan, Create skill | `useConventions(repoId)`, `useExtractConventions`, `usePatchConvention`, `useCreateConventionsSkill` (`server/specs/conventions.md`) |

`(shell)` is a route group (no URL segment): its `layout.tsx` mounts the app shell
once, so the sidebar/top bar survive navigation. Views set the breadcrumb with
`useCrumb([...])`. `/onboarding` sits outside the group and has no shell.

## Navigation rules

1. **`/` never renders a page of its own.** It resolves the repo list and
   `router.replace`s to `/repos/<first>/pulls`. An empty repo list shows the
   onboarding call to action instead of redirecting, so a fresh install does not
   bounce into a dead route.
2. **The active repo resolves by priority: URL path → `localStorage["dd-repo"]`
   → first repo from the API** (`lib/repo-context.tsx`). A URL always wins, so a
   shared link opens the repo it names regardless of what the recipient last
   viewed.
3. **A stale `:repoId` is not an error.** `useRepoNotFound` renders a friendly
   empty state rather than surfacing a 404 — a deleted repo is an expected state
   in a local-first tool.
4. **The PR detail route is keyed by PR *number*, every PR API by the row's
   *uuid*.** The page resolves number → uuid through the cached pulls list, which
   is why it depends on `usePulls` even though it renders a single PR. Opening
   the route cold therefore fetches the list first; this is deliberate — it keeps
   URLs human (`/pulls/482`) without a second lookup endpoint.

## URL state contract

State that must survive a reload, a back button, or being pasted to someone else
lives in the URL. Everything else is component state.

| Param | Route | Values | Meaning |
|---|---|---|---|
| `?status=` | PR list | `all`, `needs_review` (default), `reviewed`, `stale` | filter chip |
| `?tab=` | PR detail | `overview` (default), `findings`, `diff` | active tab. `findings` is the tab labelled **Agent runs** — the internal key predates the label |
| `?trace=<runId>` | PR detail | run uuid | opens the run trace drawer on that run |
| `?severity=` | PR detail | `CRITICAL`, `WARNING`, `SUGGESTION` | filters every run's findings panel to one severity |
| `?tab=` | skills list/detail | `config` (default), `preview`, `stats`, `versions` | active tab on the selected skill's detail pane; unrecognised → `config`, per the rule below |
| `?tab=` | agent editor | existing set **plus** `skills` | the agent editor's `?tab=` values gain a `skills` tab (the agent's attached-skills panel) alongside whatever tabs it already had |

Two rules about reading them:

- **An unrecognised value reads as "no filter", never as "show nothing".** A
  hand-edited or stale link must degrade to the unfiltered view; an empty page
  with no explanation is the failure mode being avoided.
- **Writing a param goes through the page's `setParam` helper**, which deletes
  the key when the value is `null` and uses `router.replace` — filter changes are
  not history entries, but they are shareable.

## Presentation invariants

These hold across screens and are the ones most easily broken by an isolated
change:

1. **A missing number renders as an em dash, never as a fabricated zero.**
   `formatUsd(null)` → `—`; `formatUsd(0)` → `$0`, because some models genuinely
   cost nothing. Route every USD value through `lib/format.ts` rather than
   formatting inline — the cost surfaces live in three separate subtrees and
   drifting formatters is exactly how they stop matching.
2. **The PR list's columns are data-driven.** `COLUMN_KEYS`, the `GRID` template
   and `RIGHT_ALIGNED_COLUMNS` in `app/(shell)/repos/[repoId]/pulls/constants.ts` must
   change together — the header and the row both render from them, so a column
   added to one and not the others silently shifts every cell.
3. **The whole PR row is a navigation target.** Anything interactive inside a
   cell either stops propagation or is deliberately non-interactive. Severity
   chips in the FINDINGS column are non-interactive by design: filtering lives on
   the detail page, and a chip that swallowed the click would make the row's
   primary action unreachable in that cell.
4. **Run outcome is derived from counts, not from the model's verdict.** A
   settled run with blockers reads `rejected` (red), never a green `done`; the
   timeline colours on the denormalised `blockers` / `findings_count` on the run
   row, which is the same signal the CI gate uses.
5. **Severity counters always count the full set**, never the filtered subset —
   otherwise clicking one counter makes the others appear to vanish.

## Conventions page

`useConventions(repoId)` (`GET /repos/:id/conventions`) drives the whole
screen; there is no separate loading state per card. Header reads
"Conventions in `<repo>`" with a subtitle: "Detected from N sample files ·
last scan `<relative>`" once a scan exists, or the empty state's copy before
the first one. **Run Scan** renders when there is no scan yet; **Re-scan**
once one exists — both disabled while `useExtractConventions` is in flight,
and both re-labelled to a spinner state ("Scanning…") rather than merely
disabled, so a slow extraction (up to ~90s) doesn't read as a dead button.
After a scan completes, a line reads "N candidates dropped (no evidence)"
when `dropped > 0`.

Each `ConventionCard` shows the rule, a `path:start-end` link built with
`githubBlobUrl(full_name, scan.sha, evidence_path, evidence_start_line,
evidence_end_line)`, the evidence snippet, a confidence bar (green ≥0.8,
amber ≥0.6, else red), and Accept / Reject / an inline edit of the rule text
and category. A rejected card leaves the list immediately (C5) — there is no
undo in the UI; re-scanning does not bring it back either (C6).

The toolbar shows "X of Y accepted", a **Deselect all** action (every
`accepted` candidate back to `pending` — a client-side bulk `PATCH`, not a
new endpoint), and **Create skill**, visible once at least one candidate is
accepted. Create skill opens `CreateSkillModal` (name defaults to
`repo-conventions`, editable; description, type, enabled, a body editor with
line numbers seeded from `POST /repos/:id/conventions/skill/preview` and a
live token count via `POST /skills/tokens`; footer "Saved as v1 · added to
Skills Lab"). The modal renders inside a `stopPropagation` wrapper like every
other `Modal`-based dialog in this app (`client/INSIGHTS.md`). On a name
clash (`preview`'s `name_taken_by` is set) the modal offers the two choices
already agreed with the user: save as a new version of that existing skill
(`replace_skill_id`, an S4 update) or rename before creating. After a
successful create, a toast fires with a link to `/skills/:id` and the skills
list query is invalidated so the new skill shows up there immediately.

Error / empty states: no scan yet → the empty-state card with a **Run
extraction** CTA; the repo not cloned or not indexed yet (409) → an inline
notice explaining a scan isn't possible until the repo finishes indexing,
with no retry loop; an extraction failure (C10) → the previous candidates
stay on screen with a dismissible error banner, never a blank page.

## Screens deliberately absent

`pulls`, `skills`, `agents`, and `conventions` are live entries in the nav
today (`vendor/ui/nav.ts`'s `NAV` — its own comment notes "the visual design
shows more Skills Lab entries, but the rest lead to pages that do not exist
yet and are deliberately excluded"). Conventions is a nav entry pointing at a
route this lesson builds (see the route table above); Memory, Eval,
Multi-Agent Review, CI Runs, Agent Performance and a few others do **not**
have nav entries yet — only their i18n namespaces exist in `messages/en/` as
placeholders (e.g. `shell.json`'s `nav` namespace already carries
translation keys — `eval`, `memory`, `multi-agent`, `agent-performance`,
`ci-runs` — for labels the `NAV` array does not render). Neither the
existing nav entries nor the unused namespaces are dead code to remove.

`nav.ts` sits under the client's `src/vendor/ui/**` do-not-touch path, but it
is a plain data registry, not vendored component code — adding the
Conventions nav item is a one-line, agreed exception (`client/INSIGHTS.md`,
2026-09-22).
