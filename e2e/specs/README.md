# specs — e2e flows

In `e2e/`, `specs/` holds the **executable flows** (`NN-kebab-name.flow.json`), not prose specs. `run.ts` picks up every
`*.flow.json` here in lexical order. This README is ignored by the runner (`run.ts:53 → loadFlows` filters on
`.flow.json`).

Each flow is read-only over seeded data (`server/src/db/seed.ts`). A step "asserts" by exiting non-zero on timeout
(`wait`) or no match (`find`). How to add one: [`../docs/writing-a-flow.md`](../docs/writing-a-flow.md).

| Flow | Purpose | Asserts (in order) | Fresh seed only? |
|---|---|---|---|
| [01-app-boot](01-app-boot.flow.json) | Whole-stack smoke: client + API + DB live | `/` → network idle → URL contains `/pulls` (redirect happens only when ≥1 repo) → text "Pull Requests" | no (any ≥1 repo) |
| [02-repo-pulls-detail](02-repo-pulls-detail.flow.json) | Nested routing + per-PR detail fetch | `/pulls` → PR title "Add rate limiting to public API endpoints" in list → click it → URL `/pulls/482` → network idle → title on detail page | **yes** (demo repo must be first) |
| [03-agents](03-agents.flow.json) | Agents list route + fetch | `/agents` → URL `/agents` → network idle → text "Security Reviewer" (AgentCard) | no |
| [04-pr-findings](04-pr-findings.flow.json) | Review run rendering: ReviewRunAccordion / VerdictBanner / FindingsPanel / FindingCard | open PR #482 → click button "Agent runs" → URL `tab=findings` → "request changes" → "2 findings" → "Hardcoded Stripe secret key in commit" (newest run open by default) | **yes** |
| [05-pr-diff](05-pr-diff.flow.json) | Diff viewer (DiffViewer → FileCard → CodeLine) | open PR #482 → click button "Files changed" → URL `tab=diff` → text "src/config.ts" | **yes** |
| [06-onboarding](06-onboarding.flow.json) | Onboarding form renders, no submit | `/onboarding` → URL → "Add a repository" → "Repository URL" | no |
| [07-settings](07-settings.flow.json) | Settings sections render | `/settings/api-keys` → network idle → "API Keys" → `/settings/models` → "Feature Models" | no |
| [08-skills](08-skills.flow.json) | Skills page + agent Skills tab (read-only) | `/skills` → search "untested-branches" → click → Preview / Stats / Versions → Test Quality Reviewer → button "Skills" → "4 of 9 enabled" | no |
| [09-pr-intent](09-pr-intent.flow.json) | PR Overview intent card empty state (no LLM; "Derive now" is not clicked) | open PR #482 → network idle → "No intent yet" → "Intent is derived before the first review." → "Derive now" → "Description" | **yes** |
| [10-smart-diff](10-smart-diff.flow.json) | Smart Diff groups + findings in the diff (no LLM; read-only) | open PR #482 → click button "Files changed" → URL `tab=diff` → core group description → tokens note "0 new tokens · built on 0 from last review" → "Hardcoded Stripe secret key in commit" → click button "Original order" → text "src/config.ts" | **yes** |

When you add a flow, add a row here and to the Coverage table in [`../README.md`](../README.md).
