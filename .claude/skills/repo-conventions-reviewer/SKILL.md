---
name: repo-conventions-reviewer
description: "Detects a repository's unwritten coding conventions from its config files and top-ranked source files, writes each one down with a real file:line citation, and can check a diff against the accepted list. Every convention must be backed by code that actually exists — nothing is proposed on vibes."
when_to_use: "When onboarding to an unfamiliar repo and you want its house rules made explicit; when writing a CONTRIBUTING/CLAUDE.md convention section from scratch; when reviewing a diff and you want it checked against conventions the repo already follows elsewhere. NOT for enforcing conventions that are already written down somewhere (just read that doc) and NOT a linter replacement — this finds conventions a linter doesn't know about."
version: 1.0.0
user-invocable: true
---

# Repo Conventions Reviewer

Two modes: **extract** (find and document conventions) and **check** (verify a
diff against an accepted list). Default to extract unless the user is clearly
asking to review a specific change against known conventions.

## Extract mode

1. **Sample, don't guess.** Read the repo's config files if present
   (`.eslintrc*`, `.prettierrc*`, `tsconfig.json`, `pyproject.toml`, etc.) and
   a handful of the most-central source files — prefer files with many
   incoming imports/references over random or peripheral ones (a quick
   `grep -rl` for import counts, or just files under `src/` with the most
   other files depending on them, is good enough; don't build tooling for this).
   Do not use a model call to pick the sample — this step is mechanical.

2. **Propose candidates**, each with:
   - **category** — short label (naming, error-handling, structure, testing…)
   - **rule** — one imperative sentence a reviewer could act on
   - **evidence** — the exact file and line range the pattern was seen in,
     quoting the real code verbatim

   Favor rules specific enough that a new contributor couldn't have guessed
   them from general best practice — "this repo returns `Result<T, Error>`
   instead of throwing" is a good candidate; "use meaningful variable names"
   is not.

3. **Verify every candidate before presenting it.** Re-open the file you
   cited and confirm the quoted snippet is actually there, at the line range
   you claimed. Drop (don't soften — drop) any candidate you can't verify this
   way. This is the one non-negotiable step: a convention with fabricated or
   misattributed evidence is worse than no convention at all, because it reads
   as authoritative.

4. **Present the list** for the user to accept/reject each one individually —
   don't write anything to disk until they've said which ones to keep.

5. On confirmation, write the accepted conventions to wherever the user wants
   them recorded (a new `CONVENTIONS.md`, a section of `CLAUDE.md`, a project
   skill) — each entry keeps its file:line citation so a future reader can
   verify it themselves rather than trusting the document blindly.

## Check mode

Given a diff (working changes, a specific commit range, or a described
change) and a list of accepted conventions:

1. For each convention, check whether the diff violates it.
2. Report violations with the exact file:line in the DIFF (not the original
   evidence location) and which convention it breaks.
3. Say nothing about conventions the diff doesn't touch — this is a targeted
   check, not a full review.

## What this skill does not do

- It does not invent conventions with no code evidence — every rule traces to
  a real, re-verified file:line.
- It is not a substitute for a linter/formatter; conventions a tool already
  enforces mechanically aren't worth documenting here.
- It does not silently write files — extract mode always confirms the
  accepted set with the user first.
