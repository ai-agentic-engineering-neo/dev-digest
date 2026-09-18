# Task 1 Proofs – Extract, ground, persist, re-scan

## Task Summary
New `conventions` module samples clone configs plus top-12 ranked files (no model file-pick), calls the workspace `conventions` feature model, drops ungrounded / traversal candidates, and persists pending rows. Re-scan replaces pending only. GET returns candidates plus last-scan metadata.

## What This Task Proves
- Shared contracts parse `ConventionStatus`, extended `ConventionCandidate`, `ConventionList`, and `ConventionCompose`.
- A new Drizzle migration adds `status`, `category`, line range, `created_at`, `conventions_repo_idx`, and repo extract-metadata columns without editing applied SQL.
- Evidence gate keeps in-range snippets and drops missing/empty files, OOB lines, snippet mismatch, and `../etc/passwd`; `child_process` is unused.
- Re-scan dedupe blocks a new pending when any existing row shares `rule` + `evidence_path`.
- Integration: mock LLM + fixture file persists only the grounded pending row; accepted rows are not duplicated; empty samples and foreign repos do not 500/leak; `GET /skills` is unchanged.

## Evidence Summary
Hermetic helpers + contracts, `pnpm typecheck` / lint, hermetic vitest (185), and Testcontainers `conventions.it.test.ts` (3) all passed. Migration `0016_happy_doctor_faustus.sql` is additive.

## Artifact: New Drizzle migration

**What it proves:** Schema change is a new file only; `conventions.status` defaults to `pending`; `accepted` boolean stays; category, line range, `created_at`, repo index, and subtitle columns land on `repos`.
**Why it matters:** Applied migrations are immutable; reviewers must see an append-only SQL file.
**Command:** `cd server && pnpm run db:generate`
**Result summary:** drizzle-kit wrote `server/src/db/migrations/0016_happy_doctor_faustus.sql`. No existing `0000`–`0015` SQL was edited.

```
[✓] Your SQL migration file ➜ src/db/migrations/0016_happy_doctor_faustus.sql
```

```sql
ALTER TABLE "repos" ADD COLUMN "conventions_extracted_at" timestamp with time zone;
ALTER TABLE "repos" ADD COLUMN "conventions_sample_count" integer;
ALTER TABLE "conventions" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;
ALTER TABLE "conventions" ADD COLUMN "category" text;
ALTER TABLE "conventions" ADD COLUMN "evidence_start_line" integer;
ALTER TABLE "conventions" ADD COLUMN "evidence_end_line" integer;
ALTER TABLE "conventions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;
CREATE INDEX "conventions_repo_idx" ON "conventions" USING btree ("repo_id");
```

## Artifact: Grounding + re-scan helpers

**What it proves:** In-range snippet is kept; missing/empty file, OOB, mismatch, and `../etc/passwd` drop; `exec`/`execFile`/`spawn`/`fork` stay unused; duplicate rule+path is not inserted.
**Why it matters:** Model output is untrusted; the product value is the code-side existence gate, not the LLM wording.
**Command:** `cd server && pnpm exec vitest run src/modules/conventions/helpers.test.ts`
**Result summary:** 8 tests passed (keep, FLAG-2 empty text, OOB, mismatch, traversal, child_process spies, dedupe).

```
 ✓ src/modules/conventions/helpers.test.ts (8 tests) 3ms
```

## Artifact: Shared contracts

**What it proves:** `ConventionCandidate` parses `status`, `category`, line range; `accepted: true` with `status: 'accepted'`; `ConventionList` requires `items`; compose needs `convention_ids` min 1 plus skill name/description/body.
**Why it matters:** Client and server share one Zod SoT; a list-shaped GET is required for the subtitle.
**Command:** `cd server && pnpm exec vitest run test/contracts.test.ts`
**Result summary:** 14 tests passed (existing fixtures + new Convention describe).

```
 ✓ test/contracts.test.ts (14 tests) 9ms
```

## Artifact: Integration extract / GET / PATCH / 404 / empty samples

**What it proves:** Mock structured output with one grounded and one `../etc/passwd` candidate persists only the grounded pending row; GET includes `extracted_at` and `sample_file_count`; PATCH accepted then re-extract does not duplicate; ghost/other-workspace repo is 404; empty samples return 200; skill count unchanged.
**Why it matters:** Live LLM is not a CI gate; this is the seam that proves persist + tenancy + re-scan.
**Command:** `cd server && pnpm exec vitest run test/conventions.it.test.ts`
**Result summary:** 3 tests passed against Testcontainers Postgres + pgvector.

```
 ✓ test/conventions.it.test.ts (3 tests) 4369ms
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

## Artifact: Typecheck, lint, hermetic suite

**What it proves:** The new module typechecks; eslint is clean; existing hermetic tests still pass.
**Why it matters:** Parent-task quality gate before UI work.
**Command:** `cd server && pnpm typecheck && pnpm lint && pnpm exec vitest run --exclude '**/*.it.test.ts'`
**Result summary:** typecheck and lint exited 0; 25 files / 185 tests passed.

```
$ tsc --noEmit -p tsconfig.json
$ eslint .
 Test Files  25 passed (25)
      Tests  185 passed (185)
```

## Reviewer Conclusion
Task 1.0 is done: extract is a registered Fastify slice with a code-side evidence gate, pending-only re-scan, and persisted scan metadata. Compose-to-skill and the Conventions page are parent tasks 3.0 and 2.0.
