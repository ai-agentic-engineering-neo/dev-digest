# Vague vs useful

The test for every entry: could an agent reading this cold, with no memory of
the session, act on it without asking a question?

| Vague (reject) | Useful (accept) |
|---|---|
| Promises can be tricky. | `Promise.all()` on the ingest pipeline times out past 30 items; use `Promise.allSettled()` in batches of 10. |
| Be careful with async state. | Checkout state always goes through the Zustand `cartStore.ts`; three components share the cart, so local state breaks it. |
| Webhooks need auth. | The webhook requires HMAC verification in the header, not the body. |
| Fixed a bug in the auth module. | `session.validate()` must run before any role check; role checks on an unvalidated session return `owner` for anonymous users. Evidence: `auth/guard.ts:validateThenAuthorize`. |
| Tests are important. | bats-core `run` captures the exit code but swallows stderr; use `2>&1` to capture both. |
| The DB layer has quirks. | Prisma Accelerate has a 5 MB response limit; use `select`, not `include`, on list queries. |

## Examples from this repository

| Vague (reject) | Useful (accept) |
|---|---|
| Migrations sometimes fail. | `relation "…" does not exist` on first API call means migrations never ran; they are not applied on boot. Fix: `cd server && pnpm db:migrate`. |
| Typecheck breaks sometimes. | `TS2307: Cannot find module 'openai'` in `server` means `reviewer-core/node_modules` is missing; run `npm ci` there first. Evidence: `server/tsconfig.json:24`. |
| The e2e tests are flaky locally. | Flows 02, 04, 05 follow the home redirect to the first repo and fail when the dev DB has more than the seeded repo. Use `npm run e2e:hermetic`. |
| Prompts should be clear. | Never describe the JSON shape or a severity scale in an agent prompt; the strict `json_schema` response format already enforces it and conflicting prose degrades the fields. Evidence: `reviewer-core/src/llm/openrouter.ts:75`. |

## Shapes that work

- Symptom → cause → fix, with the exact error string: `X fails with "…" because Y; do Z.`
- Rule with reason: `Always/Never X in <place> because Y.`
- Decision with rejected alternative: `Chose X over Y for <reason>; revisit if <condition>.`
- Quirk with scope: `<tool> does X (not Y as documented) when <condition>.`

## Shapes that fail

- Narrative: "Today I spent an hour on…"
- Story of the mistake instead of the rule that prevents it.
- Anything longer than two sentences. Split it or cut it.
- Ephemeral references: PR numbers, branch names, a teammate's name, a timestamp of a run.
