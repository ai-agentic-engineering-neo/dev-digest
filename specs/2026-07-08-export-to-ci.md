# Spec: Export to CI   |   Spec ID: SPEC-2026-07-08-export-to-ci   |   Status: draft
Supersedes: none

> This is "Worktree B" of a larger effort. It owns the `ci/` engine and its routes, the
> global **CI Runs** page, and the agent **CI** tab. It deliberately does **not** touch the
> multi-run review service or the PR feed (see Non-goals).

## Guiding principle — simplicity first (v1)

This is a **first, deliberately simple iteration**. We ship the smallest implementation that
satisfies the acceptance criteria and iterate later once we see what users actually need. The
planner and implementers must favour the simplest correct approach and resist gold-plating.

- **Two things are non-negotiable and must not be simplified away:** the security invariants
  (AC-15…AC-19, AC-21, AC-27 — least-privilege permissions, no fork-PR secret, no
  comment-triggered runs, no secrets in files, self-contained workflow, no public inbound
  ingest endpoint) and the `reviewer-core` invariants (mandatory `groundFindings()` gate,
  `wrapUntrusted()` + `INJECTION_GUARD`, deterministic verdict). These are the point of the
  feature.
- **Everything else takes its simplest correct form.** Robustness ACs (idempotency, degraded
  refresh, re-export update, duplicate/invalid-artifact handling) specify the *behaviour*, not a
  sophisticated mechanism — implement each with the plainest thing that holds (e.g. a natural
  unique key for idempotency, skip-on-error for a degraded refresh, force-update the branch for
  re-export). No new abstraction layers, no config surface, no generalization beyond GitHub
  Actions.
- **Reuse over rebuild.** Extend the existing `ci_installations` table and the existing
  `agent_runs` model; reuse the existing GitHub adapter and `Modal`/tab UI primitives. Add only
  the columns and one adapter capability the ACs strictly require.
- **Defer, don't pre-build.** Non-GHA targets stay file-download only; memory and project-context
  docs stay empty/out; no GitHub App, no webhooks, no marketplace action. When in doubt, leave it
  out and record it as a future iteration rather than building for a need we haven't confirmed.

## Problem & why

A tuned review agent that lives only in the DevDigest studio cannot help the team — it runs
on one person's machine, on demand. The moment it becomes useful is when it runs
**automatically on every pull request**, in the team's own CI, posting findings where the
real code review happens.

A "tuned agent" is technically just a configuration: model + system prompt + linked skills +
settings. **Export to CI** serializes that configuration into a portable **manifest**
(`.devdigest/agents/<slug>.yaml`) plus its skills, generates a self-contained CI workflow,
and opens a pull request in the target repository that installs everything. In CI, a bundled
**agent-runner** reads the *same* manifest, runs the *same* `reviewer-core` engine (grounding
gate included), and posts structured findings — one artifact, two environments, byte-for-byte
the same agent. Results flow back into DevDigest so a run that happened in GitHub is visible
in the studio.

This is a security-sensitive feature: in CI the agent reads an **untrusted diff** and has the
right to **write to a public PR** — the "lethal trifecta" (untrusted input + privileged
action + a way to exfiltrate) can assemble. The whole design is shaped by minimizing that:
least-privilege workflow permissions, no secrets for fork PRs, no comment-triggered actions,
and the export PR itself gets reviewed rather than merged blindly.

The repo already contains the *contract skeleton* for this feature (empty `ci_installations`
/ `ci_runs` tables; `AgentManifest`, `CiTarget`, `CiFile`, `CiExportInput`, `CiExport`,
`CiInstallation`, `CiRun`, `CiResultArtifact` Zod contracts in `@devdigest/shared`), but
**zero implementation** — no `ci/` module, no route, no runner, no YAML serialization. This
spec defines the behaviour that fills that skeleton.

## Goals / Non-goals

- Goal: From an **Add to CI** button on the agent's CI tab, open a four-step **Export Wizard**
  (Target → Preview → Configure → Install) that serializes the agent to a manifest, shows
  everything that will ship, lets the user configure triggers and result-posting, and installs
  it by opening a PR.
- Goal: Serialize a tuned agent into a manifest validated by the **same Zod schema** used by
  the studio and the runner — one contract, two consumers, no drift.
- Goal: Generate a **self-contained** GitHub Actions workflow that runs a **bundled**
  agent-runner shipped in the same PR — it must **not** depend on an external marketplace
  action.
- Goal: The wizard makes an **atomic commit to a `devdigest/ci` branch and opens a PR** — it
  never writes to the target's default branch directly.
- Goal: In CI, the agent-runner runs the same `reviewer-core` engine (assemble diff → wrap
  untrusted input → run → **grounding gate** → deterministic verdict from `ci_fail_on`),
  posts results per the configured "Post results as", and writes a `devdigest-result.json`
  artifact.
- Goal: Ingest the CI run result back into DevDigest so it appears on the global **CI Runs**
  page and the agent's **CI** tab (PR, repo, agent, verdict/status, findings count, cost,
  duration, link to the Actions job).
- Goal: Track per-repository **installations** on the agent's CI tab, with status and the
  installed **workflow version**, plus a re-export/update path ("Update CI config").
- Goal: Let a user set **"Fail CI on"** (never / critical / warning / any) on the agent's CI
  tab, and have that value control whether a CI run exits non-zero — enabling functional
  merge-blocking via GitHub branch protection, **without any GitHub App**.
- Goal: Enforce security invariants in the generated workflow: least-privilege permissions,
  secrets from GitHub Secrets only, **no secrets for fork PRs**, and **no comment-triggered
  runs**.

- Non-goal: Touching the multi-run review service, the local review executor, or the PR feed.
  Local runs keep `source='local'`; this feature is the first writer of a CI-sourced run.
- Non-goal: **Full flow for non-GitHub-Actions targets.** CircleCI, Jenkins, and Generic CLI
  are selectable and their config file is generated/previewable/downloadable ("Copy files as a
  zip"), but they do NOT get PR automation, installation tracking, Fail-CI-on wiring, or result
  ingestion in this worktree. The full flow (atomic `devdigest/ci` commit + PR, pull-based
  ingest, CI Runs history) applies **only** to GitHub Actions. (Decision: confirmed GHA-only
  full flow.)
- Non-goal: A GitHub **App** or any inbound webhook receiver. Merge-blocking is achieved via
  the run's exit code + the team's existing branch-protection required-status-check.
- Non-goal: Changing any `reviewer-core` invariant — `groundFindings()` stays a mandatory
  gate, `wrapUntrusted()` + `INJECTION_GUARD` stay paired, verdict/score stay
  deterministically computed from findings + `ci_fail_on` (not from the model's self-report).
- Non-goal: The wizard **verifying** that `OPENROUTER_API_KEY` is present in the repo's
  Secrets. The wizard surfaces expected secrets and their local readiness only; the user adds
  the secret by hand in GitHub. (Recorded because the source flow calls this out explicitly.)
- Non-goal: Automatically merging the export PR, or enabling branch protection on the user's
  behalf. Both are deliberate human steps.
- Non-goal: Populating `.devdigest/memory.jsonl` with real content. It ships **empty** in this
  feature ("memory arrives in homework").

## User stories

- US-1: As an agent author, I want an **Add to CI** button on the agent's CI tab that opens a
  four-step wizard, so I can deploy my tuned agent to a repository's CI.
- US-2: As an agent author, in **step 1 (Target)** I want to choose where to deploy (GitHub
  Actions recommended; CircleCI, Jenkins, Generic CLI), so the generated config matches my CI.
- US-3: As an agent author, in **step 2 (Preview)** I want to see everything that will ship
  (the manifest, the skills, the empty `memory.jsonl`, and an **editable** workflow file), so
  I can review it before it lands.
- US-4: As an agent author, in **step 3 (Configure)** I want to pick triggers
  (`pull_request: opened, synchronize`, optionally `reopened`) and how results are posted
  (GitHub review — recommended; PR comment; exit-code only), with a hint about how to block
  merges, so the run behaves the way my team wants.
- US-5: As an agent author, in **step 4 (Install)** I want to "Open a PR with these files" or,
  as a degraded path, "Copy files as a zip", so I can install even when PR automation isn't
  available.
- US-6: As a repository maintainer, I want the export to arrive as a **PR on a `devdigest/ci`
  branch** (never a direct push to main), so the config that reviews our code is itself
  reviewed like code.
- US-7: As a repository maintainer, I want to read the generated workflow with a security eye
  and confirm it uses least privilege, takes the key from Secrets, denies fork-PRs the secret,
  and never triggers on comments — so deploying the reviewer does not open an attack path.
- US-8: As a developer, I want a new PR to receive the agent's structured comments
  automatically within a couple of minutes, matching what a local run of the same diff
  produces, so the agent is genuinely useful on real PRs.
- US-9: As a team lead, I want to set **"Fail CI on"** to `critical` so a PR with a CRITICAL
  finding gets a REQUEST_CHANGES verdict and a non-zero exit, which — combined with branch
  protection — blocks the merge.
- US-10: As an agent author, I want the CI run that happened on GitHub to appear back in the
  studio's **CI Runs** page and my agent's **CI** tab (with PR, repo, verdict, findings, cost,
  duration, and a link to the Actions job), so I have one place to see all runs.
- US-11: As an agent author, I want to see per-repository **installations** with status and
  workflow version and an **Update CI config** action, so I can re-export after I tune the
  agent.

## Acceptance criteria (EARS)

**Export wizard**

- AC-1: WHEN the user activates **Add to CI** on an agent's CI tab, the system shall open a
  modal wizard whose steps are, in order, Target → Preview → Configure → Install.
  _(observable: modal renders the 4 labelled steps; step 1 is active)_
- AC-2: The wizard shall offer exactly four targets — GitHub Actions (marked recommended),
  CircleCI, Jenkins, Generic CLI — and default the selection to GitHub Actions.
  _(observable: four target cards; GHA pre-selected with a "recommended" badge)_
- AC-3: WHEN the user reaches **Preview**, the system shall list every artifact that will ship:
  the agent manifest (`.devdigest/agents/<slug>.yaml`), one file per linked skill
  (`.devdigest/skills/<slug>.md`), an empty `.devdigest/memory.jsonl`, and the generated
  workflow file, with the workflow file marked **editable**.
  _(observable: preview shows all four artifact categories; workflow contents are editable and
  persist into the install step)_
- AC-4: WHERE the target is GitHub Actions, the generated workflow file shall default to path
  `.github/workflows/devdigest-review.yml`.
  _(observable: preview shows that path for GHA)_
- AC-5: The system shall generate a manifest that validates against the shared `AgentManifest`
  Zod schema, carrying at least `name`, `provider`, `model`, `system_prompt`, `skills` (as
  slugs), `strategy`, and `ci_fail_on`, populated from the agent's current configuration.
  _(observable: emitted YAML parses and `AgentManifest.safeParse` succeeds; fields equal the
  agent's DB/DTO values)_
- AC-6: The system shall derive a stable, filesystem-safe **slug** for the agent and for each
  linked skill, used for the manifest filename and each skill filename, and the slug for a
  given agent shall be stable across re-exports.
  _(observable: same agent → same `<slug>.yaml` filename on repeat export; slug matches
  `^[a-z0-9][a-z0-9-]*$`)_
- AC-7: WHEN the user reaches **Configure**, the system shall let the user toggle triggers
  `pull_request: opened` and `synchronize` (both on by default) and `reopened` (off by
  default), and select "Post results as" from GitHub review (default, recommended), PR comment,
  or None (exit code only).
  _(observable: toggles and radio reflect defaults; selections flow into the generated
  workflow)_
- AC-8: The Configure step shall display the expected secrets — `OPENROUTER_API_KEY` (with its
  local readiness: set / not set) and `GITHUB_TOKEN` (auto-provided by Actions) — together with
  a hint that the user must add missing secrets to the repo before the workflow runs.
  _(observable: two secret rows with readiness badges; hint text present)_
- AC-9: The system shall NOT verify that `OPENROUTER_API_KEY` exists in the target repo's
  Secrets; it shall only report the studio-local readiness of that key.
  _(observable: no GitHub Secrets API call is made during export; readiness reflects the local
  SecretsProvider only)_

**Install / PR**

- AC-10: WHEN the user chooses "Open a PR" on the Install step for a GitHub Actions export, the
  system shall commit all shipped files as a single atomic commit to a branch named
  `devdigest/ci` in the target repository and open a pull request from that branch into the
  configured base branch, and shall never push to the base branch directly.
  _(observable: a PR from `devdigest/ci` → base exists; base branch has no new direct commit;
  all files present in one commit)_
- AC-11: IF an open `devdigest/ci` PR already exists for the target repository, THEN the system
  shall update that existing branch/PR rather than opening a duplicate.
  _(observable: re-export yields the same PR URL; no second open PR on `devdigest/ci`)_
- AC-12: WHEN a PR is opened (or updated) for a GitHub Actions export, the system shall record a
  per-repository **installation** (agent, repo, target type, installed-at, status, workflow
  version).
  _(observable: the installation appears on the agent CI tab with status and workflow version)_
- AC-13: WHERE the user chooses "Copy files as a zip" (degraded path), the system shall produce
  a downloadable archive of exactly the shipped files and shall NOT open a PR or create an
  installation.
  _(observable: zip downloaded; no PR; no installation record)_
- AC-14: IF the GitHub API call to commit files or open the PR fails, THEN the system shall
  surface the failure to the user without creating a partial installation record, and shall
  leave any pre-existing `devdigest/ci` PR unchanged where possible.
  _(observable: error shown; no new/partial installation row; idempotent retry succeeds)_

**Generated workflow — security**

- AC-15: The generated GitHub Actions workflow shall declare least-privilege permissions —
  exactly `contents: read` and `pull-requests: write` — and no broader scopes.
  _(observable: workflow `permissions:` block equals those two entries)_
- AC-16: The generated workflow shall reference the OpenRouter key only via
  `secrets.OPENROUTER_API_KEY` and shall never embed the key value in the workflow, the
  manifest, or any shipped file.
  _(observable: no secret literal in any shipped file; key referenced via `secrets.*` only)_
- AC-17: WHEN a workflow run is triggered by a pull request from a **fork**, the analysis shall
  run **without** the OpenRouter secret being exposed to it — either running key-less or not
  running the keyed analysis at all — so a fork PR can never read the secret.
  _(observable: on a fork PR, the secret is absent from the job that processes the untrusted
  diff; the keyed job does not run for forks)_
- AC-18: The generated workflow shall trigger only on the configured `pull_request` events and
  shall NOT trigger on issue/PR **comment** events; comment text shall never initiate a run.
  _(observable: workflow `on:` contains only pull_request events; no `issue_comment` /
  `pull_request_review_comment` trigger)_
- AC-19: The generated workflow shall be self-contained — it shall run the bundled agent-runner
  shipped in the same PR and shall NOT depend on an external/marketplace action reference for
  the review step.
  _(observable: the review step invokes the bundled runner; the placeholder
  `uses: devdigest/review-action@v1` does not appear in the emitted workflow unless the user
  edited it in)_

**Runner behaviour in CI**  _(Decision: the agent-runner's behavioural contract is owned by
this worktree. It is bundled into the exported PR — self-contained, no external marketplace
action — and consumes `reviewer-core` as raw TypeScript source, the same engine the studio
uses.)_

- AC-20: WHEN the workflow runs on a pull request, the agent-runner shall assemble the PR diff
  and load the manifest and skills from the checked-in `.devdigest/` files, validating the
  manifest against the shared `AgentManifest` schema before use.
  _(observable: run log shows manifest validated and diff assembled from the PR)_
- AC-21: Before any diff or PR body reaches the model prompt, the runner shall wrap it via the
  untrusted-input mechanism (`wrapUntrusted(...)` + `INJECTION_GUARD`), identical to a local
  run.
  _(observable: assembled prompt contains the `<untrusted source="diff">` / `pr-description`
  fences and the injection guard)_
- AC-22: The runner shall apply the mandatory grounding gate (`groundFindings()`) to model
  findings before posting; a run where all findings are dropped is a valid empty result, not an
  error.
  _(observable: dropped findings are logged with reasons; an all-dropped run reports zero
  findings and succeeds)_
- AC-23: The runner shall compute the GitHub review event and the blocker count
  **deterministically** from the findings' severities and the manifest's `ci_fail_on`, not from
  the model's self-reported verdict/score.
  _(observable: given a seeded finding set + `ci_fail_on`, the event/blocker count match the
  deterministic mapping regardless of the model's self-reported verdict)_
- AC-24: WHERE "Post results as" is GitHub review, the runner shall post a single GitHub review
  with the verdict; WHERE it is PR comment, it shall post a PR comment; WHERE it is None, it
  shall post nothing and communicate only via exit code.
  _(observable: the posted artifact type matches the configured option)_
- AC-25: IF the effective verdict is REQUEST_CHANGES (i.e. the `ci_fail_on` gate triggered),
  THEN the runner process shall exit non-zero; otherwise it shall exit zero.
  _(observable: exit code correlates with gate-triggered state)_
- AC-26: The runner shall write a `devdigest-result.json` artifact conforming to the shared
  `CiResultArtifact` schema (findings count, per-severity counts, cost, duration, agent,
  version, PR number).
  _(observable: uploaded artifact parses with `CiResultArtifact.safeParse` = success)_

**Ingest & studio surfaces**

- AC-27: WHEN the CI tab or CI Runs page is refreshed, the system shall **pull** available
  `devdigest-result.json` artifacts for the tracked GitHub Actions installations via the GitHub
  Actions API (list recent workflow runs → download the result artifact) and record each as a
  CI-sourced run. The system shall NOT expose a public inbound endpoint for CI to push results.
  _(observable: a completed GitHub run appears as a new run row after refresh; no inbound
  ingest route exists; artifacts are fetched via the GitHub API)_
- AC-28: An ingested CI run shall be persisted into the existing `agent_runs` model with
  `source='ci'`, carrying the agent linkage, status, findings count, cost, duration, score, and
  blockers, PLUS the CI-specific metadata the CI Runs page needs — the external PR number and
  repository and a link to the Actions job — even when the internal `pull_requests` linkage
  (`prId`) is null (a fork/external CI PR has no internal PR row).
  _(observable: the persisted run has `source='ci'`, populated CI metadata, and renders on the
  CI Runs page with prId null)_
- AC-29: The verdict/status of an ingested CI run shall be derived by the **same** computation
  used for local runs — from the run's blockers/score against the agent's `ci_fail_on`
  threshold — not re-derived by a CI-specific rule.
  _(observable: for a given findings/severity set + `ci_fail_on`, the CI run's verdict equals
  what the local-run computation yields)_
- AC-30: IF the same CI result (same installation + PR + Actions run identity) is ingested more
  than once, THEN the system shall not create a duplicate `agent_runs` row (ingest is
  idempotent).
  _(observable: repeated refresh of the same artifact yields exactly one run row)_
- AC-31: IF an ingested artifact is missing, expired, or fails `CiResultArtifact` schema
  validation, THEN the system shall skip it without creating a run row and without failing the
  whole refresh.
  _(observable: an invalid/missing/expired artifact is skipped; other valid artifacts still
  ingest; no crash)_
- AC-32: IF the GitHub Actions API is unavailable or rate-limited during a refresh, THEN the
  system shall report the refresh as degraded and leave previously-ingested runs intact, without
  creating partial or erroneous run rows.
  _(observable: on API failure the existing run list is preserved; a degraded/refresh-failed
  state is surfaced; no partial rows)_
- AC-33: The global **CI Runs** page shall list runs that arrived from GitHub (the
  `source='ci'` `agent_runs` rows), each showing PR, repository, agent, verdict/status, findings
  count, cost, duration, and a link to the Actions job.
  _(observable: the page renders those columns for CI-sourced runs)_
- AC-34: The agent **CI** tab shall show, per repository, the installation status and workflow
  version, the CI run history for that installation, and a **Fail CI on** selector.
  _(observable: tab renders installation list + run history + selector)_
- AC-35: WHEN the user changes **Fail CI on**, the system shall persist the new value on the
  agent's `ci_fail_on` field so subsequent exports and runs use it.
  _(observable: value persists via the agent update path; next exported manifest carries it)_

**Cross-environment parity**

- AC-36: The agent artifact exported to CI shall be byte-for-byte the manifest the runner
  consumes — the studio and the runner validate it against the same `AgentManifest` schema, so
  a diff reviewed locally and the same diff reviewed in CI produce the same findings for the
  same model output.
  _(observable: for a fixed diff and a stubbed/deterministic model, local run findings ==
  CI run findings after grounding)_

## Edge cases

- Fork PR (untrusted, no secret) → AC-17 (secret withheld from fork jobs).
- Comment on a PR → AC-18 (no comment trigger; run never starts from a comment).
- Missing `OPENROUTER_API_KEY` in the repo → the keyed job fails at runtime with a clear
  message; export does not pre-verify (AC-9). Accepted: no pre-flight verification; surfaced as
  a Configure-step hint (AC-8).
- Re-export / update of an existing installation → AC-11 (update existing `devdigest/ci` PR),
  AC-12 (installation reflects new workflow version).
- Duplicate `devdigest-result.json` ingest → AC-30 (idempotent).
- Invalid / malformed `devdigest-result.json` → AC-31 (skip, don't crash).
- Expired / garbage-collected Actions artifact when pulling → AC-31 (skip; treated like missing).
- GitHub Actions API unavailable or rate-limited during a refresh → AC-32 (degraded refresh; no
  partial rows; existing runs preserved).
- GitHub API failure mid-export (commit or PR open) → AC-14 (no partial installation; retryable).
- Concurrency: multiple PRs (or multiple `synchronize` pushes) trigger runs in parallel → each
  produces its own artifact keyed by PR/Actions-run identity; ingest keys on that identity
  (AC-28, AC-30).
- All findings dropped by grounding → AC-22 (valid empty result, run succeeds, verdict APPROVE).
- LLM/model call fails in CI → the run fails with a non-zero exit and an error status; no
  findings are posted, and nothing is posted to the PR (Q5, resolved: hard-fail). No synthetic
  "review skeleton" is produced (none exists in `reviewer-core` today; introducing one is out of
  scope). Accepted.
- Agent has zero linked skills → manifest ships with an empty `skills` list and no skill files;
  still a valid export (AC-5). Accepted.
- Agent or skill name collides on slugification (two names → same slug) → slug is **derived from
  the name** (Q6, resolved: no persisted slug column) and disambiguated deterministically
  (append `-2`, `-3`, …). Covered by AC-6 (stable, safe slug).
- Very large diff → the runner uses the same engine limits as a local run; map-reduce for large
  diffs is a known stub in the engine. Accepted: inherits existing engine behaviour, not
  changed here.
- Non-GHA target selected then "Open a PR" attempted → not offered; only file download is
  available for non-GHA targets (Non-goal). Accepted for this worktree.
- Installed workflow version drifts from the current studio version → the CI tab shows the
  installed version and offers "Update CI config" (AC-34, AC-11). Accepted.

## Non-functional

- Security — least privilege: the generated workflow's `permissions:` must be exactly
  `contents: read` + `pull-requests: write` (AC-15). No `write` scope beyond pull-requests.
- Security — secret handling: no secret value in any shipped file (AC-16); fork PRs never
  receive the OpenRouter secret (AC-17); comment events never trigger runs (AC-18). These three
  together are the concrete mitigation of the lethal trifecta (untrusted diff + PR-write
  privilege + potential exfiltration).
- Security — untrusted input: the diff and PR body are untrusted and must pass through
  `wrapUntrusted()` + `INJECTION_GUARD` before reaching the model in CI, identical to local
  runs (AC-21). See Untrusted inputs.
- Security — supply chain: the workflow is self-contained (bundled runner), avoiding an
  external marketplace-action dependency at the review step (AC-19).
- Security — ingest surface: results are **pulled** from the GitHub Actions API on refresh;
  the server exposes **no public inbound endpoint** for CI to push results (AC-27). This keeps
  the lethal-trifecta attack surface smaller — there is no externally-reachable, secret-bearing
  ingest route to abuse. Ingest validates the artifact against `CiResultArtifact` and treats it
  strictly as data (AC-31), never as commands.
- Latency: a review on a new PR should post results within ~2 minutes of the trigger under
  normal conditions (matching the source's "within a minute or two" expectation), model latency
  permitting. This is a **guideline, not a hard SLA** (Q8, resolved) — it depends on model and
  GitHub-runner latency outside our control, and no test gates on it.
- Determinism/parity: same manifest + same model output → same findings in CI and locally
  (AC-36).
- Idempotency: export (AC-11) and ingest (AC-30) are both idempotent under retry/refresh.
- Accessibility: the wizard modal must be keyboard-navigable and expose dialog semantics
  (`role="dialog"`, `aria-modal`), consistent with the existing `Modal` primitive; target
  WCAG 2.1 AA for the new wizard, CI tab, and CI Runs page.

## Cross-module interactions

Modules involved: **client** (CI tab, Export Wizard, CI Runs page), **server** (`ci/` module:
export route, installation + ingest, GitHub adapter reuse), **reviewer-core** (unchanged
engine, consumed by both studio and runner), and a **new agent-runner** consumer that runs in
CI. The data crossing the boundary is the `AgentManifest` (studio → repo → runner) and the
`CiResultArtifact` (runner → GitHub artifact → server ingest). Failure contracts: export
surfaces GitHub API failures without partial state (AC-14); ingest skips invalid/missing
artifacts without failing the refresh (AC-31).

```mermaid
sequenceDiagram
    actor User
    participant Client as Client (Wizard / CI tab)
    participant Server as Server (ci module)
    participant GH as GitHub
    participant Runner as agent-runner (in CI)
    participant Core as reviewer-core engine

    User->>Client: Add to CI → configure
    Client->>Server: POST export (CiExportInput)
    Server->>Server: serialize AgentManifest + skills + workflow
    Server->>GH: commit files to devdigest/ci + open PR
    GH-->>Server: pr_url
    Server-->>Client: CiExport (installation, files, pr_url)
    Note over User,GH: Human reviews PR (least-priv, no fork secret) then merges

    User->>GH: open a test PR
    GH->>Runner: trigger workflow (pull_request)
    Runner->>Runner: validate manifest, assemble diff
    Runner->>Core: wrapUntrusted(diff/body) → run → groundFindings()
    Core-->>Runner: findings
    Runner->>Runner: verdict + blockers from ci_fail_on (deterministic)
    Runner->>GH: post GitHub review (per Post-as); exit code
    Runner->>GH: upload devdigest-result.json artifact

    User->>Client: open CI Runs / CI tab (refresh)
    Client->>Server: refresh runs
    Server->>GH: fetch artifact (devdigest-result.json)
    Server->>Server: validate + ingest as run (source=ci, idempotent)
    Server-->>Client: CI runs list
```

## Contracts

Shapes only. Most already exist in `@devdigest/shared` (`contracts/eval-ci.ts`) — this spec
identifies the gaps to reconcile; field-level implementation is the planner's job.

- **AgentManifest** (studio writes, runner reads; one Zod schema for both): `name`,
  `provider`, `model`, `system_prompt`, `skills` (slugs), `strategy`, `ci_fail_on`. Exists.
  Note: `description`, `output_schema`, `repo_intel`, `attached_doc_paths` are intentionally
  dropped from the manifest today. Attached project-context docs do **not** ship in the manifest
  in this feature (Q7, resolved: out of scope) — like `memory.jsonl`, richer context arrives
  later; the Preview accordingly ships manifest + skills + empty memory only.
- **CiExportInput** (export request): `repo`, `target`, `action` (open_pr | files), `post_as`
  (github_review | pr_comment | none), `triggers`, `base`. Exists.
- **CiExport** (export response): `installation`, `files` (`CiFile[]` = path + contents +
  editable), `pr_url` (nullable). Exists.
- **CiInstallation**: `id`, `agent_id`, `repo`, `target_type`, `installed_at`. Exists — but
  **missing a `status` and a `workflow_version` field** that the CI tab (AC-12, AC-34)
  requires. Gap to add in both vendored copies (server + client) and the `ci_installations`
  table (which currently also lacks these two columns).
- **Persistence target for an ingested run — RESOLVED: `agent_runs` with `source='ci'`.**
  `agent_runs` (`server/src/db/schema/runs.ts`) already has the `source` enum `['local','ci']`
  plus `agentId`, `prId`, `provider`, `model`, `durationMs`, `tokensIn/Out`, `costUsd`,
  `status`, `error`, `findingsCount`, `score`, `blockers`, `grounding`. Observed contract gap:
  it has **no** column for the Actions job link, the external PR number, the repository, or the
  installation reference, and its `prId` FK points at the internal `pull_requests` table — which
  a fork/external CI PR will not have (so `prId` is null for CI runs). The ingested run row must
  therefore also carry that CI metadata (Actions job URL, external PR number + repo, installation
  link) — see AC-28. The verdict is computed by the same rule as local runs (AC-29).
- **`ci_runs` table / `CiRun` contract — superseded for the runs list.** Contract observation:
  the pre-existing `ci_runs` table and `CiRun`/`CiResultArtifact` `CiRun` shape are not the
  persistence path for the CI Runs list (that is `agent_runs`, above). `CiResultArtifact` is
  still used as the **on-disk artifact shape** the runner emits and the server validates on
  ingest. Whether `ci_runs` is dropped or repurposed is a migration decision left to the planner
  — this spec only records that it is not the runs-list backing store.
- **New / changed shared contracts must be edited in BOTH** `server/src/vendor/shared/` and
  `client/src/vendor/shared/` — the client resolves `@devdigest/shared` to its own local copy,
  and the two have already drifted historically. (Constraint, not a new shape.)

## Untrusted inputs

Yes — this feature is defined by untrusted input. In CI the runner reads the **PR diff** and
the **PR body/title**, both attacker-controllable (especially on fork PRs). These must be
wrapped with `wrapUntrusted(label, content)` (labelled `diff` / `pr-description`) and the
system prompt must carry `INJECTION_GUARD`, exactly as in a local run — the two are a pair and
neither may be removed (AC-21). **PR/issue comments are also untrusted and must never trigger a
run** (AC-18). The ingested `devdigest-result.json` is produced by DevDigest's own runner but
arrives via GitHub Actions artifacts, so it is validated against `CiResultArtifact` before use
and rejected on failure (AC-31); it must never be interpreted as commands. The manifest and
skill files checked into the repo are effectively repo content — the runner validates the
manifest against the shared schema before use (AC-20). The generated workflow's least-privilege
permissions and fork-secret withholding (AC-15, AC-17) are the containment for the write
privilege half of the trifecta.

## Resolved decisions

- **Q1 — persistence target: `agent_runs` with `source='ci'`** (not the separate `ci_runs`
  table). Reflected in AC-28/AC-29/AC-33 and Contracts.
- **Q2 — ingest mechanism: pull-based via the GitHub Actions API** on refresh; no public inbound
  endpoint (keeps the lethal-trifecta surface smaller). Reflected in AC-27/AC-31/AC-32 and
  Non-functional. Note for the planner: the current `GitHubClient` port does not yet list
  workflow runs / download artifacts, so the pull path needs a new adapter capability.
- **Q3 — non-GHA targets: file-download only.** Full flow is GitHub-Actions-only. Reflected in
  Non-goals and AC-13.
- **Q4 — agent-runner: owned by this worktree**, bundled in the exported PR, consuming
  `reviewer-core` as raw TS source. Reflected in AC-19…AC-26.
- **Q5 — model-failure behaviour: hard fail.** On an LLM/model failure the run exits non-zero
  with an error status and posts nothing; no synthetic review skeleton. Reflected in Edge cases.
- **Q6 — slug: derived from name** (no persisted `slug` column) with deterministic
  disambiguation on collision (`-2`, `-3`, …). Reflected in AC-6 and Edge cases.
- **Q7 — attached project-context docs: out of scope.** They do not ship in the manifest; the
  Preview ships manifest + skills + empty `memory.jsonl` only. Reflected in Contracts and Goals.
- **Q8 — latency: guideline, not a hard SLA.** "~2 minutes" is an expectation, not a gated
  threshold. Reflected in Non-functional.

## Open questions

None — all open questions (Q1–Q8) are resolved and recorded under **Resolved decisions**.
