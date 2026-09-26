# spec — what the browser suite pins

The behaviour contract of the e2e suite: which user journeys are guaranteed to
work, what each flow asserts, and what is deliberately left uncovered. Runner
mechanics: [`flow-authoring.md`](flow-authoring.md). Repo-wide test policy:
[`../../TESTING.md`](../../TESTING.md).

The suite is **typological, not exhaustive**: a few end-to-end journeys over
seeded data, with no model in the loop. Anything that can be proven in jsdom or
against a real Postgres belongs in the client or server suites instead.

## Preconditions

Every flow assumes a **freshly seeded database**:

- `acme/payments-api` is the **only** repo, so `/` redirects into it. Flows 02,
  04 and 05 follow that redirect and land on the wrong repo otherwise.
- PR **#482** "Add rate limiting to public API endpoints" is the only pull
  request, with one seeded review (`request changes`, score 61) carrying three
  findings: one `CRITICAL`, one `WARNING`, one `SUGGESTION`.
- The seeded review is linked to one of the seeded `agent_runs`, so the run
  timeline can show that run's findings.
- The three built-in agents exist.

`scripts/e2e.sh` guarantees all of this with an ephemeral Postgres; CI does the
same in `e2e-web.yml`.

Anything a flow asserts on seeded content is therefore a **contract with the
seed**: changing a seeded title, count or score means updating the flow in the
same commit.

## Coverage

| Flow | Journey | Pins |
|---|---|---|
| `01-app-boot` | cold start | the app boots, `/` redirects to a repo's PR list, the seeded PR row is visible |
| `02-repo-pulls-detail` | list → detail | the PR list renders (including the **FINDINGS** column header), clicking a row navigates to `/pulls/482`, the detail route loads the PR title |
| `03-agents` | agents screen | `/agents` lists the seeded reviewer agents |
| `04-pr-findings` | review results | the Agent runs tab activates (`?tab=findings`), the seeded run shows its verdict and finding count, the newest accordion is open by default so a FindingCard is visible without a click, and clicking the CRITICAL counter puts `severity=CRITICAL` in the URL while the critical finding survives the filter |
| `05-pr-diff` | diff viewer | the Files changed tab renders the seeded file in the diff viewer |
| `06-onboarding` | add repo | `/onboarding` renders the add-repository form (**no submit** — nothing here clones a repo) |
| `07-settings` | settings | `/settings/api-keys` and `/settings/models` render their sections |

Together these cover the main path a first-time user walks — boot, find a PR,
read its review, look at the diff — plus the two configuration screens that make
the rest possible.

## Deliberately not covered

| Not covered | Why |
|---|---|
| hover interactions (finding previews) | the runner's deterministic verbs are `open` / `wait` / `find … click`; there is no hover command. Hover behaviour is pinned in the client's jsdom tests, where it can also be asserted precisely |
| absence of an element | `wait --text` can only prove presence. Flows assert what survives plus the URL that caused it |
| running an actual review | it would need a model key, spend money, and make the suite non-deterministic. The review pipeline is covered by the server integration suite with a mock provider |
| writes of any kind (add repo, edit agent, delete run) | flows share one seeded database in filename order; a write in flow *n* would silently change the world flow *n+1* asserts on |
| visual / pixel regressions | out of scope; failure screenshots exist for debugging, not for comparison |
| error states and offline behaviour | asserted in the client suite where the API can be mocked |

## Rules a new flow must keep

1. **Read-only.** No flow may mutate seeded data or trigger a model call.
2. **Deterministic locators only** — `--url`, `--text`, `find role|text|label`.
   The AI `chat` command is banned.
3. **Self-contained entry.** Start from `open {BASE}/` and navigate in; never
   assume the page another flow left behind, even though the browser session is
   shared.
4. **Assert what a user reads**, not internal ids or class names.
5. **A clickable target needs an accessible name** — `find role button --name`
   matches the accessible name, so the UI must provide `aria-label`, not just a
   `title`.
