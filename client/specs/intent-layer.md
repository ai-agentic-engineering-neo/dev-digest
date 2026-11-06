# Intent Layer — client

Server half: [../../server/specs/intent-layer.md](../../server/specs/intent-layer.md).
Course lesson L03. Plan: [../../plans/intent-layer.md](../../plans/intent-layer.md).

## Goal

Show the reviewer what the PR is *meant* to do (derived intent, scope, confidence, and the sources
behind it) before and alongside the findings. Let them refresh the intent, or correct it when the
derivation is wrong.

## Current state (verified 2026-11-06)

- The PR page Overview tab (`src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/OverviewTab.tsx`)
  renders only the PR description.
- `messages/en/brief.json` already has `block.intent: "Intent"`. There is no intent UI, hook or type.
- Settings → Models already lists `review_intent` "PR Review · Intent" (`src/lib/feature-models.ts:22`).
  **No new setting.**
- `Intent` exists in `src/vendor/shared` (do-not-touch). New DTO fields go into `src/lib/types.ts`
  as a mirror of the server module type.

## Scope

### Intent card (PR page, Overview tab, above Description)
- **Intent** sentence, **kind** tag, **In scope** / **Out of scope** lists. A list is hidden when it
  is empty.
- **Confidence** badge `High | Medium | Low`, using existing tokens (no status colors for "low",
  muted/warn as the design decides). It has a tooltip/hint for the reason (e.g. "Derived only from
  title, branch and commits — the PR body has no description").
- **Sources** chips: PR body, Title, `Issue #12` (links to GitHub), `plans/foo.md` (path), Branch,
  Commits, Paths. Sources that were unavailable or skipped (private issue, external URL, missing
  file) are shown dimmed with the reason.
- Meta line: model, cost (reuse `RunCostBadge` formatting), and "computed for `abc1234`".
- **Stale** state when the stored head ≠ the PR head, or the body changed. It shows a "Refresh"
  call to action.
- **Edit** opens an inline form (intent + scope lists) and saves an override. The card then shows
  an "Edited" badge and "Reset to derived".
- **Refresh** recomputes. It is disabled while pending and shows an error through the global
  mutation toast, with no double toast.
- **Empty** state (no intent yet): "Intent is derived before the first review", plus a "Derive now"
  button.
- **Loading** / **error** states follow existing patterns (skeleton, `ErrorState` + Retry).

### Run trace
- No new UI. The intent derivation step comes from the server run log (Trace/Log tab). The derived
  intent block is visible in the prompt view (where exactly depends on server Q5).

### Plumbing
- `src/lib/types.ts`: a `PrIntent` mirror (snake_case fields).
- `src/lib/hooks/`: `usePrIntent(prId)`, `useRefreshIntent`, `useSaveIntentOverride`,
  `useResetIntent`. Mutations write the returned entity into the query cache before invalidating
  (client INSIGHTS). After a review run completes, invalidate the intent query, because the run may
  have derived it.
- i18n strings live in the `brief` namespace (or the namespace the plan picks). Nothing is
  hard-coded.

## Out of scope
- Intent on the PR list, the multi-agent page, or the GitHub-posted review.
- Changing Settings → Models (the row already exists).

## Acceptance criteria

1. On a PR with derived intent, the Overview tab shows the intent card above Description: intent,
   kind, scope lists, a confidence badge, and source chips. An issue chip links to the GitHub issue.
2. `low` confidence shows the "derived from indirect signals" hint. `high` / `medium` show their own
   labels. These are covered by RTL tests for all three levels.
3. Unavailable or skipped sources render dimmed with a reason.
4. When `stale` is true, the card shows the stale notice and Refresh. Clicking Refresh calls
   `POST /pulls/:id/intent/refresh`, and the card shows the returned intent without a reload.
5. Edit → Save calls `PUT /pulls/:id/intent`. The card shows "Edited" with the override text.
   "Reset to derived" removes the override.
6. With no intent yet, the empty state and "Derive now" show. A failed load shows `ErrorState` +
   Retry.
7. All strings come from next-intl. `css-vars.test.ts` passes (only existing tokens). Typecheck and
   the client tests are green. No edits under `src/vendor/shared`.

## Open questions
- **Q-a** Should the intent card also appear above the findings (Findings tab) or in the run
  accordion, or only on Overview?
- **Q-b** Should overriding intent prompt "re-run review with the new intent?"
