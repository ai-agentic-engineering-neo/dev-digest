# Writing a flow

A checklist for adding `specs/NN-name.flow.json`. Format and runner mechanics: [how-flows-work.md](how-flows-work.md).
Naming: [`../CLAUDE.md`](../CLAUDE.md) § Naming conventions. Existing flows: [`../specs/README.md`](../specs/README.md).

## 1. Pick what to assert, using seeded data only
Every flow must pass on a freshly seeded DB with **no** LLM call and **no** mutation. Seeded rows you can rely on
come from `server/src/db/seed.ts:31 → seed`:

| Seeded fact | Where it comes from | Used by |
|---|---|---|
| Repo `acme/payments-api` is the only repo → `/` redirects to its `/repos/<uuid>/pulls` | `seed.ts:80`, `client/src/app/page.tsx:15-19` | 01, 02, 04, 05 |
| PR #482 "Add rate limiting to public API endpoints" | `seed.ts:101-115` | 02, 04, 05 |
| PR file `src/config.ts` | `seed.ts:123` | 05 |
| A review: verdict `request_changes`, 2 findings incl. "Hardcoded Stripe secret key in commit" | `seed.ts:137-158` | 04 |
| Agents General / Security / Performance Reviewer | `seed.ts:183-207` | 03 |

Repo and PR ids are uuids generated at seed time. Reach a PR by navigating (open `/` → wait `/pulls` → click the
title). Don't hard-code `/repos/<uuid>`. The PR URL uses the **number** (`/pulls/482`), so `wait --url /pulls/482` is
stable.

## 2. Write the steps
```jsonc
{
  "name": "Agents list renders the seeded reviewer agents",
  "description": "What it exercises + preconditions (fresh seed, which components).",
  "steps": [
    { "cmd": ["open", "{BASE}/agents"],           "label": "load the agents page" },
    { "cmd": ["wait", "--url", "/agents"],        "label": "agents route reached" },
    { "cmd": ["wait", "--load", "networkidle"],   "label": "agents fetch settles" },
    { "cmd": ["wait", "--text", "Security Reviewer"], "label": "seeded agent card is visible" }
  ]
}
```

Rules (all taken from existing flows):
- **Start with `open {BASE}/…`**. The browser session is shared, so the page left by the previous flow is unknown.
- After `open` or a click: `wait --url` for the route, then `wait --load networkidle` before asserting fetched data.
- Assert with `wait --text "<visible text>"`. Click with `find text "<text>" click` or
  `find role button click --name "<accessible name>"`. Never use `chat` or CSS/XPath selectors.
- Tab switches change the URL: assert with `wait --url tab=<key>`. The PR detail tab keys are `overview` / `findings`
  / `diff`, and the button labels are "Overview" / "Agent runs" / "Files changed"
  (`client/src/app/repos/[repoId]/pulls/[number]/_components/PrDetailHeader/PrDetailHeader.tsx:116-118`).
- Every step gets a `label` (lowercase phrase of the expectation). It is what shows up in logs and in the CI summary.
- Never submit forms or press buttons that start a review, clone, or settings write (`06-onboarding` checks only that
  the form renders).

## 3. Where visible text comes from (update the flow when it changes)

| Text kind | Source | Example in flows |
|---|---|---|
| next-intl message | `client/messages/en/<ns>.json` | "Pull Requests" (`prReview.json` `title`), "API Keys", "Feature Models" (`settings.json`) |
| Hard-coded JSX literal | the component itself | "Add a repository", "Repository URL" (`AddRepoView.tsx:77,94`), tab labels |
| Seed data | `server/src/db/seed.ts` | PR title, finding title, agent names, `src/config.ts` |
| Derived UI string | component logic | "2 findings", "request changes" in the run accordion |

Before renaming any of these, grep `e2e/specs/` for the string.

## 4. Run it
- Recommended: `npm run e2e:hermetic` (isolated, freshly seeded stack on :5433 / :3101 / :3100).
- Against your own stack: `npm test`. This fails 02/04/05 if your DB has other repos.
- On failure, look at `test-results/<NN-name>-fail.png` (written only for a thrown step) and the first line of
  agent-browser's error in the console.
- CI runs the same flows in `.github/workflows/e2e-web.yml`.

## 5. Register it
- Add a row to [`../specs/README.md`](../specs/README.md) and to the Coverage table in [`../README.md`](../README.md).
