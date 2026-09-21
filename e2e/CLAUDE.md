# e2e — deterministic browser flows (Vercel agent-browser, no LLM)

## Commands (npm)
../scripts/e2e.sh    # recommended: isolated seeded stack on :5433 / :3101 / :3100
npm test             # against a running stack — only if the DB holds ONLY the seeded repo
npm run typecheck
One-time: npm i -g agent-browser && agent-browser install

## Layout
run.ts                     runner: executes every specs/*.flow.json in one browser session
specs/NN-name.flow.json    one flow per file ({BASE} → E2E_BASE_URL)
lib/assert.ts              stdout assertions

## Rules
- Deterministic locators only: --url, --text, find role|text|label. NEVER the AI `chat` command.
- `wait --text` / `wait --url` are the assertions (non-zero exit fails the flow).
- Flows read seeded data only: repo acme/payments-api, PR #482, seeded agents. No model calls.
- New flow = next NN prefix; keep it read-only against the seed.

## Do not touch
- The seed data flows depend on (server/src/db/seed.ts) without updating the specs.

## Read when
- Spec format / preconditions → README.md · CI job → ../.github/workflows/e2e-web.yml
- Planning new flows → docs/ (specs/ holds only executable *.flow.json)
- Before any change → read INSIGHTS.md (engineering-insights skill)
