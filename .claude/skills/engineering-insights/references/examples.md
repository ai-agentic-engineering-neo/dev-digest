# Examples — one ✗/✓ pair per section

Shape references, not entries to copy. Repo examples are quoted (shortened) from
entries already in this repo's `INSIGHTS.md` files, so they are recorded and
must not be added again. The ones marked *(illustrative)* come from the articles
the skill is based on and are not facts about DevDigest.

## What works

- ✗ "Batching helps with big jobs."
- ✓ *(illustrative, MindStudio)* "`Promise.all()` on the ingestion pipeline
  times out after ~30 items → use `Promise.allSettled()` in batches of 10."

## What doesn't work

- ✗ "The client types can be out of date."
- ✓ "`client/src/vendor/shared/` has drifted from the canonical server copy — 5
  files differ, the server is ahead in each, and there is no sync script."
  (`client/INSIGHTS.md`)

## Codebase patterns

- ✗ "Be careful with state."
- ✓ *(illustrative, MindStudio)* "Checkout state always goes through Zustand
  (`cartStore.ts`) because three components share the cart; local state breaks it."

## Tool & library notes

- ✗ "The ORM has some limits."
- ✓ *(illustrative, evoleinik)* "Prisma Accelerate caps responses at 5 MB → use
  `select`, not `include`."

## Recurring errors & fixes

- ✗ "The API sometimes fails to start."
- ✓ "Following the root README's manual steps crashes the API: `reviewer-core`
  deps are never installed, but the API resolves `openai`/`zod` from
  `reviewer-core/node_modules` → run `cd reviewer-core && npm ci`." (`INSIGHTS.md`)

## Doc drift

- ✗ "The README is a bit outdated."
- ✓ "README says two built-in reviewers and lists only OpenAI/Anthropic keys; the
  seed creates three agents, all on `openrouter`. Evidence: `README.md:73,113`,
  `server/src/db/seed.ts:12-13,22`." (`INSIGHTS.md`)

## Session notes

- ✗ "Worked on the server today, fixed some stuff."
- ✓ "- **YYYY-MM-DD** — <task in a few words>: +2 (Doc drift, Recurring errors & fixes)"

## Open questions

- ✗ "CI might be missing something."
- ✓ "`e2e-web.yml` and `server-integration.yml` have no `reviewer-core/**` path
  filter, yet the API they boot loads `reviewer-core` — an engine-only change
  skips both suites. Intentional?" (`INSIGHTS.md`)
