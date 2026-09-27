# Insights — e2e

Learnings for `@devdigest/e2e`: agent-browser behaviour, flow determinism, and the
seeded-state preconditions the flows depend on.

**Fixed sections — append to the matching one, never to the bottom of the file.**
If an entry fits nowhere here, it probably belongs in `docs/` or nowhere at all.

How to write one: 1–3 lines, newest first inside its section, recording what a
careful reader could not have predicted from the code. Not a task log, not a
changelog, not a restatement of the diff. When an entry has bitten a third time,
promote it to `CLAUDE.md` — § Conventions for a pattern, § Gotchas for a trap —
and leave it here as history.

## What Works

Approaches and solutions that held up, with the context that made them work.

_None yet._

## What Doesn't Work

Dead ends and anti-patterns: what was tried, why it failed, what to do instead.
**The highest-value section and the one most often left empty. Fill it.**

_None yet._

## Codebase Patterns

Conventions and architectural decisions found while working here, before they are
settled enough to move into `CLAUDE.md`.

_None yet._

## Tool & Library Notes

Quirks of dependencies, versions and tooling — what a library does that its docs
do not say.

- **`find … click` scrolls the target with `DOM.scrollIntoViewIfNeeded` and discards any failure, then clicks the box centre — so a target that stays off-screen is "clicked" with exit 0 and nothing happens.** Source: `scroll_node_into_view` (`let _ = …`) and `resolve_element_center` in agent-browser `cli/src/native/element.rs`. The `/skills` list scrolls inside its own `overflow: auto` panel, and the seed puts `pr-quality-rubric` below the fold at 1280×577.
  → Bring the target on screen before clicking (filter the list, as flow 08 now does) rather than relying on the click to scroll an inner container.

- **`agent-browser find` needs an action after the locator: `find role button --name X` with none exits non-zero as a bare `Command failed`.** README § Find Elements: `find role <role> <action> [value]`, actions `click|fill|check|hover|text`; flow 10 failed exactly this way in CI on `4319fd3`.
  → For a presence check that must not click, use `find role button text --name X` with `"assert": { "stdoutIncludes": "X" }`.

- **`agent-browser wait --url <p>` is a plain substring test on `location.href` unless `<p>` contains `*`; then it is a glob anchored at both ends.** Source: `route_url_matches` in agent-browser `cli/src/native/actions.rs`; the URL is read with `Runtime.evaluate("location.href")`, so client-side `router.push`/`replace` changes are seen.
  → Assert a fragment only the target state has (`/skills/`, not `/skills`); add a `*` only if the pattern spells out the whole URL.
- **`find text <t> click` clicks the first LEAF element in `querySelectorAll('*')` order whose `textContent` includes `<t>`: `<script>` tags count, visibility does not.** Source: `handle_semantic_locator` in agent-browser `cli/src/native/actions.rs`. The root layout inlines every next-intl message into the RSC `<script>` payload (`skills.json` `config.namePlaceholder` is `pr-quality-rubric`); that script sits after the app content today, so the card still wins.
  → When the target string also lives in `client/messages/`, click with `find role button --name …` instead of `find text`.

## Recurring Errors & Fixes

Error or symptom → cause → fix, one entry each, so the next occurrence is a lookup
instead of an investigation.

_None yet._

## Session Notes

Dated summaries as `### YYYY-MM-DD — topic`: what was worked on and what state it
was left in. Prune an entry once its content has moved into a section above.

_None yet._

## Open Questions

Unresolved behaviour, undecided design, unverified assumptions. Delete an entry when
it is answered — the answer belongs in another section.

- **On this machine an isolated stack (fresh seed, `next start`) fails flows 04 and 05 at "open the PR row" (`find text Add rate limiting to public API endpoints`), while CI passes them.** (2026-09-25) Unverified suspicion: the isolated API still loads `server/.env`, whose real `GITHUB_TOKEN` lets it sync `acme/payments-api` against GitHub after flow 02; CI has no token. `scripts/e2e.sh` loads the same file.
  → Before treating a local 04/05 failure as a regression, rerun with `GITHUB_TOKEN=` exported empty.

- **Corrected 2026-09-25: flow 08 was not `find text` hitting the `<script>` — it failed the same way with `find role button click --name pr-quality-rubric` (`ca2bd52`).** The CI screenshot shows the list unscrolled and no card selected. Locally the step passes under `next build` + `next start` at 1280×577, with 6× CPU throttling via CDP, and after flows 01–07 in one session — the CI cause was not reproduced. The flow now fills `Search skills…` first, so the card sits at the top and no scroll is needed.
  → If CI still fails at "select the skill", read the new failure screenshot: a filtered one-card list rules out scrolling and points at the click itself.

- **Flow 08 still timed out on `wait --url /skills/` after selection moved into the path (`4319fd3`), so the navigation mechanism was never the cause — the click was.** (2026-09-24) Likely `find text pr-quality-rubric` hit the next-intl `<script>` payload (`skills.json` `config.namePlaceholder`), which the production build (`next build` + `next start` in `e2e-web.yml`) places before the list; the step now uses `find role button click --name pr-quality-rubric` (the card is `role="button"`). Unconfirmed until the next CI run.
  → If CI passes, treat `find text` on any string that also lives in `client/messages/` as broken under `next start`, not only "risky".

- **Why did a query-only `router.replace` on the static `/skills` route never put `?skill=` in the URL under `next build`/`next start`?** CI on commit `3331061`: flow 08 failed at `wait --url skill=` right after the `find text` click reported success, while flow 09's query-only `router.replace` on dynamic `/agents/[id]` passes. Not reproduced; the `e2e-failure` artifact `08-skills-fail.png` was not inspected.
  → Selection now lives in the path (`/skills/:id` via `router.push`), which does not depend on the answer; check the screenshot before relying on query-only navigation on a static route again.
