# M2 — Conventions Extractor (server)

Status: built

## Problem

A team's house rules live only in its code. There is no way to find them, check
them against real files and hand them to a reviewer agent as a skill.

## Goals

- One extraction run per click: code picks the files, the `conventions` feature
  model is called once, and only candidates whose snippet exists in the cited
  file are stored.
- Each candidate can be accepted, rejected or have its rule edited.
- Accepted candidates become one skill of type `convention`, source `extracted`,
  through the skills service.

## Non-goals

- A scan-history table, background jobs or streaming progress (the call is
  synchronous; one model call is small).
- Several skills per run from the server (the client can post several drafts).

## Behaviour

1. `POST /repos/:id/conventions/extract`
   - 404 for an unknown repo; 400 `repo_not_cloned` without a clone path.
   - Samples: `repoIntel.getConventionSamples(repoId, 12)` (ranked, no tests,
     configs or migrations) plus up to 6 config files (`package.json`,
     `tsconfig.json`, eslint, prettier) at the root and in each sampled
     top-level package. Files are read with `readContainedFile`, cut to 6 000
     chars, 60 000 in total. No files → 400 `no_samples`.
   - One `completeStructured` call, schema `ConventionExtraction`, model from
     Settings → feature models → `conventions` (registry default otherwise).
     File contents go in `wrapUntrusted` fences.
   - Verification by code: the path must be one of the sampled files and the
     snippet must match a contiguous run of whitespace-normalised lines. Line
     numbers come from that match. Everything else is dropped before the DB.
   - Re-scan replaces pending and rejected rows and keeps accepted ones;
     candidates whose rule equals an accepted rule are skipped.
2. `GET /repos/:id/conventions` → `ConventionList` (highest confidence first,
   sample count and time of the last scan).
3. `PATCH /repos/:id/conventions/:conventionId` with `{ status?, rule? }`.
4. `POST /repos/:id/conventions/skill` with `ConventionSkillInput`: every id must
   be an accepted candidate of the repo (400 `convention_not_accepted`
   otherwise); saved with `type: convention`, `source: extracted` and
   `evidence_files` = the candidates' paths.

## Changes

- Module: `src/modules/conventions/` (new: constants, domain, ports, service,
  repository, routes, index); wired in `platform/container.ts`.
- Skills module: `create` accepts source `extracted` and `evidenceFiles`.
- Table `conventions`: migration 0016 adds `status`, `category`,
  `evidence_start_line`, `evidence_end_line`, `created_at`, index on `repo_id`.
  `accepted` stays and mirrors `status`.
- Contracts (both copies): `ConventionStatus`, `ConventionCandidate` (+ status,
  category, lines), `ConventionList`, `ConventionPatch`, `ConventionExtraction`,
  `ConventionSkillInput`.

## Acceptance criteria

- [x] A run calls the model once and stores only verified candidates.
- [x] Accepted candidates survive a re-scan without duplicates.
- [x] A skill is built from accepted candidates only, as `convention`/`extracted`.

## Tests

`test/conventions.test.ts` (unit, in-memory ports, `MockLLMProvider` with
`structuredBySchema.ConventionExtraction`): snippet matching, one call + drop
of a fabricated snippet, re-scan keeps accepted, skill only from accepted.

## Related specs

- [client/specs/M2-conventions.md](../../client/specs/M2-conventions.md)
- [M2-skills.md](M2-skills.md)
