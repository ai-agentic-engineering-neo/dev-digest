# 04 — Conventions extractor (server)

UI half: [`client/specs/04-conventions.md`](../../client/specs/04-conventions.md).
Course slot: **L02 — Conventions extractor** (README "What you build").
Status: **in progress** (2026-09-22).

## Goal

Find the house rules of a repo (naming, error handling, structure, …) and turn the
ones the user accepts into **one skill** (`source='extracted'`) linked to agents. The
model only *proposes* rules. Code picks what it reads and code checks every cited
line. A rule without verified evidence never reaches the user.

## User flow

1. Run an extraction on a repo (`Re-scan` later). It runs in the background, and the screen polls.
2. See every found rule: category, rule, evidence (`path:start-end` + the real
   lines), confidence, and the list of dropped candidates with the reason.
3. Accept / reject each rule (and undo). Edit the rule text or category.
4. **Create skill** from the accepted rules. This opens a draft (name, description,
   type, enabled, agents, Markdown body) that is fully editable. Save or cancel.

## Pipeline (`modules/conventions`, onion layout like `modules/skills`)

1. **Sample (code, no model).** Config files from the clone root and depth 1
   (`package.json`, `tsconfig*.json`, eslint/biome/prettier/editorconfig configs,
   `pyproject.toml`, `ruff.toml`, `.golangci.yml`, `rustfmt.toml`, and docs that state
   rules: `CONTRIBUTING.md`, `AGENTS.md`, `CLAUDE.md`), then the **top 12** source files
   from `repoIntel.getConventionSamples(repoId, 12)`. When the repo is not indexed
   (that call returns `[]`), a bounded walk of the clone picks source files spread
   across directories and skips tests, vendor and generated folders. Each file goes in
   **with line numbers** and is truncated (per-file and total char budgets, see
   `domain/constants.ts`).
2. **Propose (one structured call).** The model comes from Settings → Feature models
   → `conventions` (`resolveFeatureModel`). Schema `ConventionExtraction` =
   `{ candidates: { category, rule, confidence, evidence: { path, start_line, end_line, snippet }[1..3] }[≤15] }`.
   The prompt asks for **repo-specific** rules seen in several places, with verbatim
   evidence. Generic advice ("use meaningful names") is excluded. File contents are
   untrusted data (`wrapUntrusted`).
3. **Verify (code).** For each evidence item:
   - the path is normalized and must resolve **inside the clone** (no `..`, no
     absolute path, no symlink escape) and be a regular file → else `file_not_found`
   - the snippet must match the file. Lines are compared trimmed and blank lines
     are ignored. The snippet is looked for at the cited range first, then anywhere
     in the file. If it is found elsewhere, the evidence is **relocated** to the real
     lines and kept → else `snippet_mismatch` (`line_out_of_range` when the range is
     outside the file and the snippet is not found)
   - the stored snippet is always the **real file lines**, never the model's text
     (capped at `EVIDENCE_MAX_LINES`).
   A candidate with no verified evidence is dropped. Rules are de-duplicated by
   normalized text, against each other and against already accepted/rejected rules
   of the repo (`duplicate`).
4. **Persist.** In one transaction: delete the repo's `pending` rules that are not
   `edited`, insert the kept ones as `pending`, and finish the scan
   (`done`, counts, `dropped`, model, cost). Accepted, rejected and edited rules
   survive a re-scan, so a rejected rule never comes back.

A failure (no API key, provider error, timeout) marks the scan `failed` with a short
`error`. The job never rethrows, so the JobRunner does not retry and spend twice.

## API

| Method | Path | Result |
|---|---|---|
| GET | `/repos/:id/conventions` | `ConventionsState` = latest scan (or null) + all rules (accepted → pending → rejected, then confidence desc) |
| POST | `/repos/:id/conventions/extract` | 202 `ConventionScan` (`running`). 409 `scan_running` if one is running. 422 `not_cloned` without a clone. |
| PATCH | `/conventions/:id` | `Convention`. `UpdateConventionInput`; a rule/category change sets `edited=true`. |
| POST | `/repos/:id/conventions/skill` | 201 `CreateConventionSkillResult`. 409 `conflict` on a duplicate skill name. 422 `invalid_input` when an id is not an accepted rule of this repo. 422 `unknown_agent`. |

Every route reads the workspace from `getContext`. A repo or rule from another
workspace is a 404.

## Rules

1. **One running scan per repo.** Partial unique index on
   `convention_scans(repo_id) WHERE status='running'`. A `running` scan older than
   `SCAN_STALE_MS` (crash / restart) is marked `failed` before a new one starts.
2. **Skill from rules.** The skill is created through `SkillsService.create` with
   `source='extracted'`, `source_ref='conventions:<owner/name>'` and v1 message
   `Extracted from conventions of <owner/name>`. **Trust exception:** unlike imports,
   an extracted skill honours `enabled` (default true). Its text comes from the user's
   own repo and was reviewed and edited line by line in the modal before saving.
3. Agent ids are checked **before** the skill is created (`unknown_agent`). Linking goes
   through `AgentsService.linkSkill` (append, bumps the agent version, Rules §4 of 03).
4. The merged rules get `skill_id` = the new skill, so the UI can show "in skill X".
5. The draft body is built by the client from the accepted rules (deterministic
   template, no model). The server stores what the user saved.

## Migration

- `conventions`: + `scan_id` (→ `convention_scans` SET NULL), `category` (check),
  `status` (check, default `pending`), `evidence jsonb`, `edited`, `skill_id`
  (→ `skills` SET NULL), `created_at`, `updated_at`; `repo_id` NOT NULL; drop
  `evidence_path`, `evidence_snippet`, `accepted` (the table was never written).
- new `convention_scans(id, workspace_id, repo_id, status, sampled_files jsonb,
  proposed, kept, dropped jsonb, model, tokens_in, tokens_out, cost_usd, error,
  started_at, finished_at)`, index `(repo_id, started_at desc)`, partial unique running.

## Acceptance criteria

1. The extract route answers 202 at once. The scan ends `done` and the rules are listed as `pending`.
2. A candidate whose file does not exist, or whose snippet is in no file, is not
   stored. It shows up in `scan.dropped` with its reason.
3. A candidate with the right snippet but wrong line numbers is stored with the real lines.
4. An evidence path `../../etc/passwd` or `/etc/passwd` is dropped (`file_not_found`) and never read.
5. Re-scan keeps accepted, rejected and edited rules and replaces the other pending ones.
   A candidate equal to a rejected rule is dropped as `duplicate`.
6. A second extract while one is running → 409 `scan_running`.
7. PATCH rule text → `edited=true`. PATCH status → only the status changes.
8. Create skill from 2 accepted rules + 1 agent → skill v1 `source='extracted'`,
   enabled as sent, the agent links it at the end of its list, both rules have `skill_id`.
9. No LLM key → the scan is `failed` with an error message. Nothing else changes.
10. `LLM_PROVIDER_OVERRIDE=mock` gives a key-free extraction whose candidates cite the
    sampled files (plus one bogus candidate that the gate drops).

## Product ideas (not in this slice)

Ways to get **more** or **better** findings, roughly by value/cost:

- **Prevalence check in code.** The model also returns a search pattern per rule, and
  ripgrep counts conforming vs violating files in the whole repo ("seen in 41 files,
  3 violations"). Confidence comes from data, not from the model's guess, and
  violations become ready-made eval cases for the skill.
- **Mine review history.** Accepted findings and human PR comments that repeat
  ("we always…", "please use…") are the strongest signal of an unwritten rule.
  Cluster them and propose them as conventions with the PR links as evidence.
- **Diff-aware sampling.** Sample the files that change most often (git log) and
  recent PRs, not only the PageRank top. Conventions matter where people write code.
- **Two-step dialogue.** The model first picks files from the repo map
  (`ConventionFileSelection`), then extracts from them. It reads more of the repo for
  the same budget.
- **Many skills.** Group accepted rules by category and create one skill per group
  (`repo-naming`, `repo-error-handling`). Smaller skills are easier to toggle and their
  stats are clearer.
- **Rule → linter.** When a rule is mechanical (import order, `no .then()`), offer the
  eslint/biome/ast-grep rule instead of a prompt skill. It is cheaper and deterministic.
- **Drift alerts.** Re-scan on a schedule and flag new rules or rules whose
  prevalence drops. The skill stays in sync with the code.
- **Feedback loop.** Skill stats (pull % / accept %) per rule, so rules that only
  cause dismissed findings get pruned.
