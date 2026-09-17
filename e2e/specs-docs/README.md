# e2e/specs-docs — Flow Index

This directory holds prose specifications for each end-to-end test flow. Each `.flow.json` in `../specs/` has a corresponding `.md` spec here (named `NN-kebab-name.md` to match `../specs/NN-kebab-name.flow.json`, per e2e/CLAUDE.md line 16). Until individual specs are created, this index documents all flows in one place.

## 01-app-boot

**User journey:** Load the app root and verify the initial bootstrap completes.

**What it tests:**
- The client app loads and makes its first API call (to fetch repos).
- The root route (`/`) redirects to `/repos/<id>/pulls` when at least one repo exists.
- The PR list page heading ("Pull Requests") renders, proving the client + API + DB are all live.

**Key steps** (01-app-boot.flow.json, lines 4–9):
- `open {BASE}/` — load app root
- `wait --load networkidle` — initial data fetch settles
- `wait --url /pulls` — root redirects to a repo's PR route
- `wait --text "Pull Requests"` — list heading renders

**Why it matters:** This is a whole-stack smoke test, order-independent. It doesn't verify seeded PR specifics (that's 02); instead, it confirms the entire system is wired up and running.

---

## 02-repo-pulls-detail

**User journey:** Click a PR from the list and view its detail page.

**What it tests:**
- The PR list renders a seeded PR row (title: "Add rate limiting to public API endpoints", from seeded PR #482 in `acme/payments-api`).
- Clicking the row navigates to `/repos/<id>/pulls/482`.
- The detail page fetches and renders the PR title.

**Key steps** (02-repo-pulls-detail.flow.json, lines 4–12):
- Navigate to PR list, confirm seeded PR row is visible.
- Click the PR row via `find text "Add rate limiting..." click`.
- Wait for route `/pulls/482`.
- Confirm PR title renders on the detail page.

**Why it matters:** This verifies nested routing and per-PR data fetching work correctly. It exercises the refactored detail route and confirms the seeded demo repo (`acme/payments-api`, PR #482) is the first repo in the database — critical for flows 04 and 05.

---

## 03-agents

**User journey:** Load the agents page and view available reviewer agents.

**What it tests:**
- The `/agents` route loads.
- The API fetch for the agents list completes.
- A seeded agent (Security Reviewer) renders in an AgentCard.

**Key steps** (03-agents.flow.json, lines 4–8):
- Open `/agents`.
- Wait for route `/agents`.
- Wait for `networkidle` (agents fetch settles).
- Wait for text "Security Reviewer" (agent card visible).

**Why it matters:** This verifies the agents list route and AgentCard rendering work. It confirms seeded agents are in the database and the UI displays them correctly.

---

## 04-pr-findings

**User journey:** View a PR's review run, verdict, and findings cards.

**What it tests:**
- From PR #482, open the "Agent runs" tab (findings tab).
- The newest review run's accordion is open by default, revealing the VerdictBanner.
- The accordion header shows the verdict ("request changes") and finding count ("2 findings").
- The seeded FindingCard ("Hardcoded Stripe secret key in commit") is visible.

**Key steps** (04-pr-findings.flow.json, lines 4–15):
- Navigate to PR #482 detail page.
- Click the "Agent runs" tab button.
- Wait for URL fragment `tab=findings` (tab is active).
- Wait for verdict text "request changes".
- Wait for count text "2 findings".
- Wait for finding text "Hardcoded Stripe secret key in commit" (card visible without extra click).

**Why it matters:** **This is the primary flow exercising the findings/severity UI added in this session** (FindingsTab, ReviewRunAccordion, VerdictBanner, FindingsPanel, FindingCard, severity-pill refactoring). It verifies that:
- Findings render with their severity indicators.
- The verdict is correctly displayed.
- The accordion opens the newest run by default, exposing findings without user interaction.

This flow would catch regressions in FindingCard rendering, verdict severity display, or the default-open accordion behavior.

---

## 05-pr-diff

**User journey:** View the PR's diff in the Files changed tab.

**What it tests:**
- From PR #482, open the "Files changed" tab.
- The unified-diff viewer renders a seeded file path (`src/config.ts`).

**Key steps** (05-pr-diff.flow.json, lines 4–12):
- Navigate to PR #482 detail page.
- Click the "Files changed" tab button.
- Wait for URL fragment `tab=diff` (tab is active).
- Wait for text "src/config.ts" (file visible in diff viewer).

**Why it matters:** This verifies the refactored diff-viewer (DiffViewer → FileCard → CodeLine) renders seeded diff content correctly. It's a smoke test for the Files changed tab and diff rendering logic.

---

## 06-onboarding

**User journey:** Load the onboarding screen and view the add-repository form.

**What it tests:**
- The `/onboarding` route loads.
- The add-repository form renders with heading and Repository URL field.
- The form is extracted into AddRepoView and renders correctly.

**Key steps** (06-onboarding.flow.json, lines 4–8):
- Open `/onboarding`.
- Wait for route `/onboarding`.
- Wait for heading text "Add a repository".
- Wait for field label "Repository URL".

**Why it matters:** This verifies the onboarding route and AddRepoView are wired up and render correctly. It's read-only and does not submit the form (no real import or backend mutation).

---

## 07-settings

**User journey:** Load and view the Settings pages for API Keys and Feature Models.

**What it tests:**
- The `/settings/api-keys` route loads and the "API Keys" section renders.
- The `/settings/models` route loads and the "Feature Models" section renders.
- The refactored SettingsView (SettingsApiKeys, SettingsModels) renders both sections.

**Key steps** (07-settings.flow.json, lines 4–11):
- Open `/settings/api-keys`.
- Wait for route `/settings/api-keys`.
- Wait for `networkidle` (settings fetch settles).
- Wait for text "API Keys".
- Open `/settings/models`.
- Wait for route `/settings/models`.
- Wait for text "Feature Models".

**Why it matters:** This verifies the refactored settings pages and their sub-sections render correctly across two routes. It's a read-only smoke test for the SettingsView architecture.

---

## Coverage Summary

These 7 flows provide typological coverage of the key user journeys:
- **Bootstrap & routing** (01): whole-stack smoke test.
- **PR list & detail** (02): repo-level navigation and data fetching.
- **Agents & configuration** (03, 07, 06): listings, settings, and onboarding.
- **Findings & verdict** (04): **primary flow exercising the findings UI refactored in this session** — verdict severity, finding cards, accordion default-open behavior.
- **Diff viewer** (05): file-level content rendering.

Flow **04-pr-findings** is the critical flow for validating the findings/severity UI work: it verifies VerdictBanner rendering, FindingCard visibility, and the refactored FindingsPanel behavior.
