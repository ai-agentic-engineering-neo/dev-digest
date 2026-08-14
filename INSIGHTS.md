# DevDigest — insights

Durable findings recorded by the `engineering-insights` skill: things that are
true about this code but not visible in it. Append-only — correct a stale entry
with a dated note beneath it rather than editing it away.

This is the **root** file: it holds only findings that cross package boundaries.
Anything scoped to one package lives in that package's file —
[`client`](client/INSIGHTS.md) · [`server`](server/INSIGHTS.md) ·
[`reviewer-core`](reviewer-core/INSIGHTS.md) · [`e2e`](e2e/INSIGHTS.md).

Sections are fixed. Add to the one that fits; never invent a new heading.

## What Works

## What Doesn't Work

- **2026-07-29** — Editing `client/src/vendor/shared/` alone silently desyncs the client from the API: it is a hand-copy of the canonical `server/src/vendor/shared/`, there is no sync script, and it already lags in 5 files. Evidence: `diff -rq server/src/vendor/shared client/src/vendor/shared`.

  | File | Missing on the client side |
  |------|----------------------------|
  | `adapters.ts` | `sessionId` on the LLM call; `'openrouter'` in the provider union; `CommitFile` / `CommitFilesPayload` |
  | `contracts/eval-ci.ts` | the whole `AgentManifest` schema; the `Provider` / `CiFailOn` imports |
  | `contracts/knowledge.ts` | `'openrouter'` notes; expanded `CiFailOn` policy comments; the `agent_versions` config-snapshot block |
  | `contracts/productionize.ts` | `'openrouter'` in the provider enum |
  | `contracts/trace.ts` | comment wording only (harmless) |

  Every gap is OpenRouter- or CI-runner-related, so the client cannot currently express an OpenRouter-backed agent even though the API accepts one.

- **2026-07-29** — `.claude/skills/README.md` documents a `.cursor/skills → ../.claude/skills` symlink that does not exist, so Cursor gets no skills here. Evidence: `ls .cursor` → no such directory.

- **2026-08-05** — No package in this repo has ESLint — no config file, no `eslint` dependency, no `lint` script, no lint step in any of the five workflows — so the `// eslint-disable-next-line react-hooks/exhaustive-deps` comments in `client/src` suppress a rule that has never run, and nothing mechanically enforces import direction or hook deps. Evidence: `client/src/lib/hooks/reviews.ts:212`, `client/src/app/agents/[id]/_components/AgentEditor/_components/ConfigTab/ConfigTab.tsx:39`, `client/src/app/repos/[repoId]/pulls/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx:56`.
  - **2026-08-05** — Partly stale the same day: `server/` now has `eslint` + `typescript-eslint` and a `lint` script, but still no config file, so `pnpm lint` there fails rather than lints; the suppressed-rule finding above remains true of `client/`. Evidence: `server/package.json:11,45,50`; no `server/eslint.config.*`.
    - **2026-08-05** — Fully resolved for three of four packages: `server/`, `client/` and `reviewer-core/` each now have both a `lint` script and an `eslint.config.mjs`, and `cd server && pnpm lint` exits 0. The configs are **untracked on `refactor/architecture-plan-wave-0-3`**, so lint works locally and is still absent for anyone who has not pulled them; `e2e/` has neither. Evidence: `server/eslint.config.mjs`, `client/eslint.config.mjs`, `reviewer-core/eslint.config.mjs`.

- **2026-08-05** — The skills pipeline is complete on every layer except the one call that feeds it: `run-executor` builds its `reviewPullRequest` input without a `skills` key, so `parts.skills` is always undefined, the `## Skills / rules` section is never emitted and `PromptAssembly.skills` is always null — the trace drawer's skills block is dead UI, not a rendering bug. Evidence: `server/src/modules/reviews/run-executor.ts:189-205` (no `skills:`), `reviewer-core/src/prompt.ts:88-89,109`.

- **2026-08-05** — `client/messages/en/skills.json` promises a trust model the engine does not implement: four strings tell the user an imported skill is "wrapped as untrusted data" / "delimiter-wrapped", while `assemblePrompt` joins `parts.skills` verbatim into a trusted user section and only `wrapUntrusted()`s the diff/specs/repo-map — so shipping that copy as-is would state a security property the code does not provide. Evidence: `client/messages/en/skills.json:48,52,56,96` vs `reviewer-core/src/prompt.ts:89,109`.

## Codebase Patterns

- **2026-08-05** — Pre-staged-for-a-lesson goes well beyond the empty tables `server/INSIGHTS.md` lists: for skills, the DB tables, the `@devdigest/shared` contracts, the `## Skills / rules` prompt section, the trace-drawer block + its colour token, and the entire `messages/en/skills.json` i18n namespace all ship in the starter with no module and no screen behind them — search for existing scaffolding before writing any of it. Evidence: `server/src/vendor/shared/contracts/knowledge.ts:114-141`, `reviewer-core/src/prompt.ts:109`, `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/constants.ts:16`, `client/messages/en/skills.json`.

  - **2026-08-05** — Conventions was staged even further than skills — table, `ConventionCandidate` contract, `FEATURE_MODELS.conventions`, `repoIntel.getConventionSamples()`, the whole `messages/en/conventions.json` namespace, `activeKeyFor("/conventions")` AND the mock adapter's schema names all shipped with no module, so the build was assembly, not authoring. Evidence: `server/src/modules/repo-intel/service.ts:630`, `client/src/components/app-shell/helpers.ts:31`, `docs/specs/conventions.md` §2.

- **2026-08-05** — `POST /agents/:id/skills` is two endpoints in one body schema and picking the wrong shape silently destroys data: `{skills:[…]}` / `{skill_ids:[…]}` REPLACE the agent's whole ordered set (that is what `useSetAgentSkills` sends), while `{skill_id}` appends — so "also give this agent the new skill" must use the single-id form or the agent's other skills vanish. Evidence: `server/src/modules/agents/routes.ts:170-180`, `client/src/lib/hooks/skills.ts` (`useLinkAgentSkill` vs `useSetAgentSkills`).

- **2026-07-29** — `.gitignore` carries un-ignore rules for an `agent-runner/dist/` that does not exist yet; they are pre-staged for the Export-to-CI lesson (L06), not leftovers to clean up. Evidence: `.gitignore:3-6`, `reviewer-core/README.md:7-9`.

## Tool & Library Notes

- **2026-07-29** — Half this repo is pnpm and half is npm, so running `pnpm install` in `reviewer-core/` or `e2e/` would create a second competing lockfile — match the lockfile already in the directory, not the root README's pnpm prerequisite.

  | Package | Lockfile |
  |---------|----------|
  | `server/`, `client/` | `pnpm-lock.yaml` |
  | `reviewer-core/`, `e2e/` | `package-lock.json` |

- **2026-07-29** — `skills-lock.json` disagrees with `.claude/skills/` in both directions, so it cannot be read as an index of available skills; read the directory. Evidence: lock-only — `architecture-patterns`, `github-workflow-automation`; disk-only — `mermaid-diagram`, `react-best-practices`, `react-testing-library`, `security`.

## Recurring Errors & Fixes

## Session Notes

- **2026-07-29** — Wrote per-module `CLAUDE.md` files and swept the repo for drift while doing it; every entry here and in the per-module files came from that sweep. The `engineering-insights` skill was built in the same session.
- **2026-07-29** — Run Cost Badge lab re-added per-run cost (`agent_runs.cost_usd`, migration 0010) that commit `d45ab0d` had deliberately removed — the removal only disconnected persistence/UI, `reviewer-core` kept computing `ReviewOutcome.costUsd` the whole time, so the re-add was a one-field reconnect. Evidence: `reviewer-core/src/review/run.ts:216`.
- **2026-08-04** — `.claude/skills/react-frontend-architecture/` deliberately holds only `SOURCES.md` (curated research for a skill not yet written) — the missing `SKILL.md` is pending work, not a broken skill to clean up. Evidence: `.claude/skills/react-frontend-architecture/SOURCES.md:1-15`.
  - **2026-08-04** — `.claude/skills/onion-architecture/` now follows the same pattern: `SOURCES.md` holds the verified research plus the SKILL.md plan (§12) for the backend layering skill. Evidence: `.claude/skills/onion-architecture/SOURCES.md:1-10`.
    - **2026-08-05** — Resolved: the skill is written (`SKILL.md` v1.0.0 + `README.md` sources) and listed in the catalog; unlike the frontend skill, `SOURCES.md` was **kept** — it carries the per-tool layer map (§13) and the live-code drift the rules were written against (§14). Evidence: `.claude/skills/onion-architecture/SKILL.md:1-6`, `.claude/skills/README.md:9`.
  - **2026-08-04** — Resolved same day: renamed to `.claude/skills/frontend-ui-architecture/` and the skill was written (`SKILL.md` v1.0.0 + `README.md` sources); `SOURCES.md` was absorbed into those two files and deleted. Evidence: `.claude/skills/frontend-ui-architecture/SKILL.md:1-6`.
- **2026-08-05** — Second research pass on `.claude/skills/onion-architecture/SOURCES.md`: mapped every backend dependency to an onion layer and added the five areas the first pass missed (LLM SDKs as an ACL, jobs/queues, the SSE run bus, config/secrets, mechanical enforcement); the SKILL.md plan is now §15, and §12 carries a superseded banner.
- **2026-08-05** — Repo-wide architecture read against `frontend-ui-architecture`, the `onion-architecture` SOURCES research, and the React/Next/Fastify/Postgres skills; analysis only, no code changed. Findings landed as entries in this file and in `client` / `server` / `reviewer-core`.
- **2026-08-05** — Acted on that audit: mechanical enforcement (ESLint in all three packages, `dependency-cruiser` layer rules + `pnpm arch`, CI lint steps), the `pulls`/`settings` module promotions with `polling`/`workspace` moved onto shared container repositories, DB indexes + enum CHECK constraints (migrations 0011/0012), and the client's missing error boundaries. Still open from the same audit: no route declares `schema.response`, nothing runs in a transaction, and `client/src/vendor/shared/` still lags the canonical copy.

- **2026-08-05** — Spec for the Skills feature (storage, editor, agent binding, `.md`/`.zip` import, seeded Test Quality + API Contract reviewers) written to `docs/specs/skills.md`; investigation only, no code changed. The four entries above came from that read.
  - **2026-08-05** — Then implemented in full the same session: `modules/skills/`, `agent_skills.enabled` (migration 0013), the `/skills` page + agent Skills tab, `fflate`-based `.zip` import, and the `run-executor` wiring that finally makes the prompt block non-empty. The two entries under *What Doesn't Work* above are resolved by it; the trust-copy one was fixed by rewriting `client/messages/en/skills.json`.

- **2026-08-05** — Built the Conventions Extractor (spec + roadmap in `docs/specs/conventions.md`): `modules/conventions/`, migration 0015, the `/repos/[repoId]/conventions` page and the skill-draft modal. The design premise — a model proposes, code samples and code verifies — is the same grounding-gate shape `reviewer-core` already uses for findings.

## Open Questions

- **2026-08-05** — Is `repoIntel.getConventionSamples()` filtering tests out right for this feature? It reuses the review-context rank filter (`isJunkPath` drops `.test.`/`.spec.`), so testing conventions — some of the most useful house rules — are structurally invisible to the extractor. Evidence: `server/src/modules/repo-intel/service.ts:629-630,709-728`.

- **2026-07-29** — Is the client's vendored `@devdigest/shared` copy meant to be synced by a manual step someone knows about, or was it simply forgotten? Nothing in `scripts/` or CI touches it, and the drift is one-directional.
- **2026-07-29** — Are `architecture-patterns` and `github-workflow-automation` in `skills-lock.json` planned additions or removed skills whose lock entries were never cleaned?
