# 02-tasks-skills-agent-binding.md

Source spec: [`02-spec-skills-agent-binding.md`](./02-spec-skills-agent-binding.md) (part 2 of 3). Depends on spec 01 (skills library). Spec 03 is not in this task list.

## Repository Standards Discovery

| Source File | Read | Standards Extracted | Conflicts |
|-------------|------|---------------------|-----------|
| `AGENTS.md` | yes | Colocated `_components/<Name>/`; tests beside source; `*.it.test.ts` = Postgres; Zod schema+type same name; snake_case REST; `feat:` commits; do-not-touch `vendor/`, applied migrations, lockfiles | none for this spec (NAV exception was spec 01 only) |
| `README.md` | yes | Studio = client `:3000` + server `:3001`; `./scripts/dev.sh` for local stack | none |
| `server/AGENTS.md` | yes | Module slice `routes.ts` → `service.ts` → `repository.ts`; shared contracts live in `server/src/vendor/shared`; `pnpm db:generate` for new migrations; hermetic vs `.it.test` | none |
| `client/AGENTS.md` | yes | Thin `page.tsx`; all API via `src/lib/hooks/*`; `pnpm test` mocks `fetch` | none |
| `reviewer-core/AGENTS.md` | yes | Engine stays ignorant of DB; `assemblePrompt` already accepts `skills?: string[]` and omits empty; do not change unless a bug is found | none |
| `TESTING.md` | yes | Behaviour at seams; one real Postgres integration per data-backed workflow; no coverage chasing | none |
| `.github/workflows/server-unit.yml`, `server-integration.yml`, `client.yml` | yes | CI: `pnpm typecheck` + hermetic vitest per package; integration job runs `*.it.test.ts` with Docker | none |
| `CONTRIBUTING.md` | not found | — | — |
| `.github/pull_request_template.md` | not found | — | — |
| `.pre-commit-config.yaml` | not found | — | — |
| `server/package.json`, `client/package.json` | yes | `typecheck`, `lint`, `test`; server `db:generate` / `db:migrate` | none |
| `server/eslint.config.js`, `client/eslint.config.mjs` | yes | ESLint per package (`pnpm lint`) | none |

**Assumptions (spec open questions, not blocking):**

1. Skills tab shows the **full workspace catalog** (`GET /skills`). Unlinked rows render unchecked. First checkbox or drag creates an `agent_skills` row. Unchecking sets `enabled: false` and **keeps** the row. Record a deviation in `client/INSIGHTS.md` only if the mockup is implemented as “linked only”.
2. Display token count for the trace skills block uses the existing `approxTokens` heuristic (`Math.ceil(text.length / 4)` in `server/src/adapters/tokenizer/index.ts`). Same formula on the client for display only — do not change billing `tokens_in`.
3. Drag-and-drop uses native HTML5 DnD (no new dependency). There is no existing sortable library in the client.
4. Existing `{ skill_ids }` / `{ skill_id }` POST shapes may remain as a compatibility path; the Skills tab **must** use the payload that stores `enabled`. Compatibility replace defaults `enabled: true`.
5. Do not implement spec 03 (import, seed catalog, Test Quality, `<untrusted>` wrapping of skill bodies).
6. “N of M enabled”: M = currently listed rows (after name filter); N = rows among those with **both** `skill_enabled` and link `enabled`. Unlinked rows count in M but never in N.

## Relevant Files

| File | Why It Is Relevant |
|------|--------------------|
| `server/src/vendor/shared/contracts/knowledge.ts` | SoT: extend `AgentSkillLink` with `enabled` + GET summary fields |
| `client/src/vendor/shared/contracts/knowledge.ts` | Required mirror of the shared contract (not a second design) |
| `server/src/db/schema/agents.ts` | Additive `enabled` on `agentSkills` |
| `server/src/db/migrations/` | New file from `pnpm db:generate` only — never edit applied SQL |
| `server/src/modules/agents/repository.ts` | Extend `linkedSkills` / `setSkills` / `linkSkill` for `enabled`; workspace skill-id check |
| `server/src/modules/agents/helpers.ts` | DTO map for GET links; dual-gate `enabledSkillBodies` (application layer) |
| `server/src/modules/agents/helpers.test.ts` | **New** — hermetic dual-gate + DTO tests |
| `server/src/modules/agents/service.ts` | `setSkills` accepts `{ skill_id, enabled }[]`; reject foreign workspace ids |
| `server/src/modules/agents/routes.ts` | `SetSkillsBody` gains `{ skills: [{ skill_id, enabled }] }` |
| `server/src/platform/errors.ts` | `NotFoundError` (missing agent) / `ValidationError` (bad `skill_id`) |
| `server/test/contracts.test.ts` | Contract: `AgentSkillLink.parse` fails without `enabled` |
| `server/test/agent-skills.it.test.ts` | **New** — Postgres GET/POST order, uncheck-keeps-row, foreign skill 422 |
| `server/test/agents-versions.it.test.ts` | Template for `startPg` / `seed` / `buildApp` / cross-workspace |
| `server/test/skills.it.test.ts` | Pattern for creating skills + other-workspace rows |
| `server/test/helpers/pg.ts` | Testcontainers Postgres fixture |
| `server/src/modules/reviews/run-executor.ts` | Load links, pass bodies into `reviewPullRequest`; keep `outcome.assembly` on success |
| `server/src/modules/reviews/service.ts` | Already injects `agentsRepo` into the executor — no second repo |
| `server/test/prompt-structured.test.ts` | Extend existing assembly tests; do not add a second `assemblePrompt` |
| `reviewer-core/src/prompt.ts` | Read-only unless a bug: joins `skills` under `## Skills / rules`, omits empty |
| `server/src/adapters/tokenizer/index.ts` | `approxTokens` — copy the `ceil(chars/4)` formula to the client display helper |
| `client/src/lib/hooks/agents.ts` | Add `useAgentSkills` / `useSetAgentSkills` (or a small `agent-skills.ts`) |
| `client/src/lib/hooks/skills.ts` | Reuse `useSkills` for the catalog |
| `client/src/lib/hooks/index.ts` | Re-export if a new hook file is added |
| `client/src/app/agents/[id]/page.tsx` | `VALID_TABS` currently `["config"]` — add `"skills"` |
| `client/src/app/agents/[id]/_components/AgentEditor/constants.ts` | `TABS` currently Config only — add Skills |
| `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.tsx` | Mount `SkillsTab` when `tab === "skills"` |
| `client/src/app/agents/[id]/_components/AgentEditor/AgentEditor.test.tsx` | Assert Config + Skills tabs; no Context/Evals/Stats/CI |
| `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/` | **New** — colocated tab (tsx, styles, helpers, constants, tests) |
| `client/src/app/agents/[id]/_components/AgentEditor/_components/ConfigTab/` | Colocation pattern to copy (not import across routes) |
| `client/src/app/skills/_components/SkillCard/constants.ts` | `TYPE_COLOR` map to copy into SkillsTab constants (do not import across routes) |
| `client/messages/en/agents.json` | `editor.tabs.skills` + `skills.enabledCount` / `orderHint` / `filterPlaceholder` already exist — reuse |
| `client/messages/en/runs.json` | `trace.prompt.skills` already exists; add a token-count string if the block shows one |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/PromptBlock/PromptBlock.tsx` | Show approximate token count on the skills block |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx` | Already skips skills when `null` — pass token count into skills `PromptBlock` only |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/helpers.ts` | Add `approxTokens` (same formula as server) |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/RunTraceDrawer.test.tsx` | Extend: skills block + token figure when `skills` set; absent when `null` |

### Notes
- Tests live beside source (`helpers.test.ts`, `SkillsTab.test.tsx`) except server integration (`server/test/*.it.test.ts`).
- Server: `pnpm typecheck`, `pnpm exec vitest run --exclude '**/*.it.test.ts'`, `pnpm exec vitest run .it.test`, `pnpm lint`.
- Client: `pnpm typecheck`, `pnpm test`, `pnpm lint`.
- Reuse `AgentsRepository` link helpers; do not add a second link table.
- Dual-gate filter stays in `agents/helpers.ts` (application). `reviewer-core` stays ignorant of the database.
- Do not log full skill bodies at `info`. Do not wrap skill bodies in `<untrusted>`.
- Do not implement spec 01 (skill CRUD/editor) or spec 03 (import / seed / Test Quality).
- Do not add Context / Evals / Stats / CI tabs. Do not edit applied migrations or `client/src/vendor/ui` (NAV exception was spec 01 only).

## Tasks

### [x] 1.0 Per-agent enable flag and link API

Add `agent_skills.enabled`, extend `AgentSkillLink`, and make `GET|POST /agents/:id/skills` return/replace ordered links with dual enablement. Uncheck keeps the row. Foreign-workspace `skill_id` is rejected. Dual-gate filter lives in the application layer, not in `reviewer-core`.

#### 1.0 Proof Artifact(s)
- CLI: `cd server && pnpm db:generate` appends a **new** migration adding `enabled boolean not null default true` on `agent_skills`. No existing file under `server/src/db/migrations/` is edited.
- Test: `cd server && pnpm exec vitest run test/contracts.test.ts` — `AgentSkillLink.parse` fails when `enabled` is omitted (other required fields present); succeeds with `enabled: true` plus the GET summary fields.
- Test: `cd server && pnpm exec vitest run test/agent-skills.it.test.ts` — `POST /agents/:id/skills` with `{ skills: [{ skill_id, enabled }] }` for three workspace skills; disable the middle one; `GET /agents/:id/skills` returns all three ordered by `order`, middle `enabled: false`, and summary fields (`skill_id`/`name`/`type`/`description`/`skill_enabled`); uncheck does not drop the row; `skill_id` from another workspace → 422; globally disabled skill remains in GET.
- CLI: `cd server && pnpm typecheck` passes after schema + contract + route changes.

#### 1.0 Tasks
- [x] 1.1 In `server/src/vendor/shared/contracts/knowledge.ts`, extend `AgentSkillLink` with required `enabled: z.boolean()` (per-agent) and GET summary fields: `name`, `type` (`SkillType`), `description`, `skill_enabled` (global `skills.enabled`). Keep `agent_id`, `skill_id`, `order`. Export matching `type`. Mirror the same edits in `client/src/vendor/shared/contracts/knowledge.ts`.
- [x] 1.2 Add `enabled: boolean('enabled').notNull().default(true)` on `agentSkills` in `server/src/db/schema/agents.ts`. Run `cd server && pnpm db:generate` (new SQL only). Extend `LinkedSkillRow` with `enabled: boolean` (link flag).
- [x] 1.3 In `helpers.ts`, map `LinkedSkillRow` → `AgentSkillLink` (`enabled` = link flag, `skill_enabled` = `skill.enabled`; do **not** put `body` on the GET DTO). `linkedSkills` join already has the skill row — select `agentSkills.enabled` as well; order by `agentSkills.order` ascending.
- [x] 1.4 Extend `setSkills(agentId, items: { skillId: string; enabled: boolean }[])`: wrap delete+insert in `this.db.transaction` (same class of bug as skills insert without a snapshot). Persist `order = index` and `enabled`. `linkSkill` upsert must not wipe `enabled` on an order-only update (default `true` on insert). Add `assertSkillsInWorkspace(workspaceId, skillIds)` (unknown or other-workspace ids fail).
- [x] 1.5 Service: `setSkillBindings(workspaceId, agentId, skills: { skill_id: string; enabled: boolean }[])` — 404 if agent missing; 422 `ValidationError` if any `skill_id` is not in this workspace. Routes: extend `SetSkillsBody` so `{ skills: [{ skill_id, enabled }] }` is the editor path; existing `{ skill_ids }` / `{ skill_id }` may remain and default `enabled: true`. GET still 404s across workspaces via `getContext` + agent lookup.
- [x] 1.6 Add `server/test/agent-skills.it.test.ts` (copy `startPg` / `seed` / `buildApp` from `agents-versions.it.test.ts`) implementing every case in 1.0 Proof Artifacts. Create three skills via `POST /skills`. Add `AgentSkillLink.parse` missing-`enabled` case to `server/test/contracts.test.ts`.

### [x] 2.0 Agent editor Skills tab

`/agents/:id?tab=skills` lists workspace skills with drag handle, per-agent checkbox, type badge, “N of M enabled”, name filter, and the order-matters copy. Pages stay thin; UI colocated under `AgentEditor/_components/SkillsTab/`; hooks in `client/src/lib/hooks/`. No Context / Evals / Stats / CI tabs.

#### 2.0 Proof Artifact(s)
- Test: `cd client && pnpm test` — colocated tests:
  - `SkillsTab.test.tsx` (mocked hooks): six catalog skills, three with **both** global and per-agent enabled, shows “3 of 6 enabled” (`agents.skills.enabledCount`); toggling a checkbox calls `POST /agents/:id/skills` with `{ skills: [...] }` including the updated `enabled` flag; unchecking leaves the row in the document; name filter hides non-matching rows.
  - `helpers.test.ts`: `mergeCatalogWithLinks` paints unlinked rows unchecked; dual-enabled count ignores global-off rows; `filterSkillRows` is name-only.
  - `AgentEditor.test.tsx`: Config and Skills tabs render; Context / Evals / Stats / CI are absent.
- URL: `http://localhost:3000/agents/<id>?tab=skills` reachable beside Config (`VALID_TABS` and `TABS` include `skills` only as the new key).
- Browser (after `./scripts/dev.sh`): open any agent (e.g. Security Reviewer), bind two skills, drag to reorder, reload — order and checkboxes persist. Globally disabled skill stays visible; its checkbox does not increment N until the library toggle is on.

#### 2.0 Tasks
- [x] 2.1 Add `useAgentSkills(agentId)` (`GET /agents/:id/skills`) and `useSetAgentSkills(agentId)` (`POST` `{ skills: [{ skill_id, enabled }] }`) in `client/src/lib/hooks/agents.ts` (or a small `agent-skills.ts` re-exported from `hooks/index.ts`). Query keys `["agent-skills", id]`. Invalidate on success. No `fetch` in components. Reuse `useSkills` for the catalog.
- [x] 2.2 Add `{ key: "skills", labelKey: "editor.tabs.skills", icon: "Sparkles" }` to `TABS`. `AgentEditor` renders `SkillsTab` when `tab === "skills"` (keep `key={agent.id}` remount). `page.tsx` `VALID_TABS` becomes `["config", "skills"]`. Do not add Context / Evals / Stats / CI.
- [x] 2.3 Add colocated `SkillsTab/` (`tsx`, `styles.ts`, `helpers.ts`, `constants.ts`, `index.ts`). Copy `TYPE_COLOR` locally (do not import from `/skills`). Merge catalog + links in a pure helper: unlinked = unchecked; linked keep `enabled` + `order`; leftover catalog after linked rows, stable by name. Header uses existing `agents.skills.enabledCount` / `orderHint` / `filterPlaceholder`. Filter by **name** only. Globally disabled rows stay visible.
- [x] 2.4 Checkbox on: if unlinked, append a link `{ skill_id, enabled: true }` and POST the full linked set. Checkbox off: set that link `enabled: false`, keep it in the POST list (do not unlink). Native HTML5 drag-and-drop: first drag of an unlinked row inserts it into the linked ordered set with `enabled: true`; drop writes `POST` with the new order. Unlinked-only rows are not sent.
- [x] 2.5 Write the RTL tests named in 2.0 Proof Artifacts (mock hooks like `AgentEditor.test.tsx`). Cover `mergeCatalogWithLinks` / `enabledCount` / `filterSkillRows` in `helpers.test.ts`. `cd client && pnpm test` green for the new files.

### [x] 3.0 Prompt assembly + trace skills block

`ReviewRunExecutor` loads linked skills, filters to `skills.enabled && agent_skills.enabled`, sorts by `order`, and passes **bodies only** as `skills: string[]` into `reviewPullRequest`. Empty filter → omit `skills` so `assembly.skills` is null and the Prompt assembly UI skips the block. Non-empty → distinct skills block with an approximate token count. Success path keeps real `outcome.assembly`; do not wrap bodies in `<untrusted>`.

#### 3.0 Proof Artifact(s)
- Test: `cd server && pnpm exec vitest run src/modules/agents/helpers.test.ts` — `enabledSkillBodies`: two enabled bodies + one disabled (global **or** per-agent) → only the two enabled bodies, in `order`; all disabled / empty → `[]`; return values are bodies, never descriptions.
- Test: `cd server && pnpm exec vitest run src/modules/reviews/helpers.test.ts` — `skillsPromptArg(['a'])` is `{ skills: ['a'] }`; `skillsPromptArg([])` is `{}` (key omitted).
- Test: `cd server && pnpm exec vitest run test/prompt-structured.test.ts` stays green. Extend it: `skills: ['body-a', 'body-b']` → `assembly.skills` contains both texts, user content has `## Skills / rules`, and the skills section is **not** wrapped in `<untrusted>`; omitted / `[]` / whitespace-only → `assembly.skills` is null.
- Test: `cd client && pnpm test` — `RunTraceDrawer.test.tsx` (or colocated `PromptBlock` test): when `prompt_assembly.skills` is a non-empty string, the Skills block is in the document with a **non-zero** token figure (`ceil(length/4)`); when `skills` is `null`, the Skills block is absent. Billing `tokens_in` / `tokens_out` stats are unchanged by this figure.
- Browser: run an agent with a skill enabled; open the run trace Prompt assembly section; skills block is visible with a non-zero token figure. Disable the skill (agent or library toggle), re-run; skills block is absent (or that body is omitted if others remain). Reordering two enabled skills changes their order in `assembly.skills`.

#### 3.0 Tasks
- [x] 3.1 Add pure `enabledSkillBodies(links)` in `server/src/modules/agents/helpers.ts`: keep rows where `skill.enabled && link.enabled`, sort by `order`, map to `skill.body`. Empty → `[]`. Cover every case in 3.0’s hermetic proof. Executor / service must call this helper — do not inline a second filter in `reviewer-core`.
- [x] 3.2 In `ReviewRunExecutor`, before `reviewPullRequest`, `this.agents.linkedSkills(agent.id)` → `enabledSkillBodies` → pass `skills: bodies` only when `bodies.length > 0` (omit the key when empty). Description is not passed. Keep success-path `prompt_assembly: outcome.assembly` (`run-executor.ts` ~273); do **not** persist `traceFromBuffer` on a succeeded run. Optional live-log line may say how many bodies were injected; never log full bodies at `info`.
- [x] 3.3 In `RunTraceDrawer/helpers.ts` add `approxTokens(text)` = `Math.ceil(text.length / 4)` (same as server). `TraceBody` passes that count into the skills `PromptBlock` only. `PromptBlock` renders the figure next to the label. Do not show it on other blocks. Do not change `stats.tokens_in` / billing math.
- [x] 3.4 Extend `server/test/prompt-structured.test.ts` as specified in 3.0 Proof Artifacts. Do not add a second assembly implementation. Do not change `INJECTION_GUARD` or untrusted wrapping of diffs/specs.
- [x] 3.5 Extend `RunTraceDrawer.test.tsx` (open the Prompt assembly section if it is collapsed) so the skills block + token figure assertions in 3.0 Proof Artifacts pass. Keep the existing smoke cases green.
- [x] 3.6 Glue check (keep it small — do not boot `executeRuns`): in `server/src/modules/reviews/helpers.ts` add `skillsPromptArg(bodies: string[]): { skills: string[] } | Record<string, never>` that returns `{ skills: bodies }` iff `bodies.length > 0`. Cover both branches in `helpers.test.ts`. `ReviewRunExecutor` must spread this onto `reviewPullRequest` so an empty list cannot become `skills: []` (assemblePrompt would still omit, but the executor contract is omit-when-empty).
