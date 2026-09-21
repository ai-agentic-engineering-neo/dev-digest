# e2e — patterns

## 1. Add a flow for a new user journey
1. The owning feature spec (`client/specs/NNN-*.md` or `server/specs/NNN-*.md`) names the flow under
   "Acceptance criteria" as `e2e/specs/NN-<name>.flow.json`. Pick the next two-digit prefix (current max is `07`).
2. Create the file with `name`, a `description` that states preconditions (fresh seed, which seeded rows it reads),
   and `steps`. Start with `["open", "{BASE}/<route>"]` then a `wait --url` or `wait --load networkidle`.
3. Prefer, in order: `wait --url`, `wait --text "<exact rendered string>"`, `find role <role> … --name "<accessible name>"`,
   `find label "<aria-label>"`, `find text "<text>"`. Add `--exact` when a name is a prefix of another ("1 Warning").
4. Every visible string you wait on must exist in `client/messages/en/*.json` or in `server/src/db/seed.ts`.
   If it does not, extend the seed rather than the flow; remember seed fixtures for PR #482 appear only on a fresh DB.
5. Only read seeded data; never click "Run review", never submit forms that call GitHub or an LLM.
6. Give each step a `label`; it is what the summary and CI log show.
7. Run `./scripts/e2e.sh` from the repo root. Confirm the new flow passes and the older ones still do.

## 2. Extend an existing flow when a screen changes
1. Find the flow by the route it exercises (`structure.md` table). Add steps after the navigation that already exists;
   do not open a second browser session or re-`open` the app mid-flow unless the journey restarts.
2. Update strings that the client change renamed (`wait --text`, `--name`). Check `client/messages/en/*.json` for the new copy.
3. If the change alters PR #482's seeded numbers (cost, token counts, findings), update `02` and `04` together and
   `server/src/db/seed.ts` in the same change.
4. Re-run hermetically and note the result in the spec's acceptance checkbox. An unexecuted step stays unchecked
   with a note (`client/specs/002-findings-severity.md` shows the format).

## 3. Debug a failing flow
1. Read the summary: `✗ <label> — <first line of agent-browser stderr>`; open `test-results/<flow-id>-fail.png`.
2. `wait --text` timeout on a long-lived dev DB usually means the wrong repo was opened (flows 02/04/05) or the
   old seed lacks the fixture. Fix: run `../scripts/e2e.sh`, not the flow (`INSIGHTS.md`, "Recurring Errors").
3. Reproduce a single step by hand: `AGENT_BROWSER_BIN=… agent-browser open http://localhost:3000/` then the failing `cmd` verbatim.
4. Raise `E2E_STEP_TIMEOUT` only for genuinely slow pages (`wait --load networkidle` after PR detail is the known one).
5. Failing only in CI: compare the boot sequence in `../.github/workflows/e2e-web.yml` (built `next start`, fresh seed) with your local run.

## Do not
- Use the agent-browser `chat` command or any AI locator.
- Assert on data your own dev DB created; only the seed is shared with CI.
- Put feature descriptions here; they belong in `client/specs/` or `server/specs/`.
