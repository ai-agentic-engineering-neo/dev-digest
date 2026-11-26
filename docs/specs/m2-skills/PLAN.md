# M2 · Skills — implementation plan

Spec: [SPEC.md](SPEC.md). Packages: `server`, `client`. `reviewer-core` is
read-only for this milestone.

Before starting, read `server/AGENTS.md` + `server/INSIGHTS.md`,
`client/AGENTS.md` + `client/INSIGHTS.md`, `TESTING.md`. Skills to apply:
`onion-architecture`, `drizzle-orm-patterns`, `postgresql-table-design`, `zod`
(server); `frontend-architecture`, `next-best-practices`,
`react-best-practices`, `react-testing-library` (client). Branch:
`lecture-NN/task-N`.

Each task ends green: `pnpm typecheck` + unit tests in the touched package,
`scripts/check-contracts.sh` when contracts change.

---

## Server

### Task 1 — Migration

- `db/schema/skills.ts`: `updatedAt`, unique `(workspaceId, name)`,
  `skillVersions.message`. No new tables.
- `pnpm db:generate` → new `0011_*.sql`. Never edit applied migrations.
- Check: `pnpm db:migrate` on a fresh DB and on a seeded one.

### Task 2 — Contracts (both copies)

- `knowledge.ts`: `SkillName`, `SkillBody`, `SkillVersion`, `SkillUsage`,
  `SkillAgentActivity`, `SkillStats`, `CreateSkillInput`, `UpdateSkillInput`;
  `Skill.created_at`, `Skill.updated_at`, `Skill.agent_count`; `Agent.skill_count`.
- Export from `index.ts`; copy byte-identical to `client/src/vendor/shared`.
- Check: `scripts/check-contracts.sh`.

### Task 3 — `skills` module: CRUD + versions

Mirror `modules/agents/` (lite layout, explicit DI in `routes.ts`):

- `repository.ts`: `list`, `getById`, `insert` (+ v1 snapshot), `update`
  (snapshot only on body change, set `updatedAt`), `deleteById`,
  `agentsUsing`, `listVersions`, `getVersion`, `restore`. Every
  write + snapshot pair runs in **one transaction**. Map `23505` → `ConflictError`.
- `helpers.ts`: `toSkillDto`, `toSkillVersionDto`, `isBodyChange`,
  `versionMessage({ kind, message, from })`, all pure.
- `service.ts`, `routes.ts`: SPEC §4.3 rows except `/stats`. Register in `modules/index.ts`.
- Tests: `helpers.test.ts`; `skills.it.test.ts`: CRUD, body vs non-body edit,
  default messages, restore creates new version, restore current → 409, 409 name,
  cross-workspace 404, delete cascades links + versions.

### Task 4 — Agent side of the link

- `agents/service.setSkills` / `linkSkill`: workspace ownership check (400),
  transaction, agent version bump + snapshot.
- `list` / `getById`: `skill_count` via one grouped count.
- Tests: it-tests for 400, version bump, `skill_count`.

### Task 5 — Run executor

- Narrow port in the reviews module: `loadPromptSkills(agentId)` → ordered
  enabled `{ name, version, body }[]` (implemented over `agent_skills`
  ⋈ `skills`; no import of the agents service).
- Pass `skills` when non-empty and log `Skills: …`. Nothing new is persisted.
- Tests: executor unit test with mock LLM (`adapters/mocks.ts`): order kept,
  disabled omitted, no skills → prompt identical to the current snapshot.

### Task 6 — Stats (existing data only)

- `skills/repository.ts`: `agentCounts(workspaceId)` (one grouped count →
  `agent_count` on list/get), `versionCount(skillId)`, and
  `agentActivity(agentIds, since)`, one grouped query over `agent_runs` ⋈
  `findings` (`status = 'done'`, last 30 days) → runs, findings,
  accepted, dismissed per agent.
- `helpers.ts`: `rate(num, den)` → `null` on `den = 0`.
- `GET /skills/:id/stats` → `SkillStats`.
- Tests: it-test with seeded runs/findings: per-agent numbers, accept rate
  ignoring undecided, 30-day cut-off, failed runs excluded, skill with no agents.

### Task 7 — Seed

- Six skills from the designs (all `manual`, real bodies, `pr-quality-rubric`
  = Preview design text). Three attached to Security Reviewer. Idempotent.

---

## Client

### Task 8 — Data layer

- `lib/hooks/keys.ts`: `skills()`, `skill(id)`, `skillUsage(id)`,
  `skillStats(id)`, `skillVersions(id)`, `agentSkills(agentId)`.
- `lib/hooks/skills.ts`: `useSkills`, `useSkill`, `useSkillStats`,
  `useSkillVersions`, `useCreateSkill`, `useUpdateSkill`, `useDeleteSkill`,
  `useRestoreSkillVersion`. Invalidate `skills`, `skill`, `skillVersions`,
  `agents`, `agentSkills` where relevant.
- `lib/hooks/agents.ts`: `useAgentSkills`, `useSetAgentSkills` (optimistic + rollback).
- `keys.test.ts` updated.

### Task 9 — Nav + routes

- `vendor/ui/nav.ts`: SKILLS LAB group (Skills `g s`, Agents), shortcut row.
  Check `/showcase` still mounts.
- `app/skills/page.tsx`, `app/skills/[id]/page.tsx`: thin server routes with
  `generateMetadata` (`messages/en/meta.json`).

### Task 10 — Shared master-detail layout

- Extract the list + pane shell inlined in `AgentEditorView` into
  `src/components/list-detail/` (CSS vars only). Switch `AgentEditorView` to it
  with **no behaviour change**; agent tests stay green. (Skills no longer uses
  it after the layout change to a card grid; only the Agent Editor does.)

### Task 11 — Skills list + shell

`app/skills/_components/`:
- `SkillsView` (card grid mirroring `AgentsListView`; **no** `ListDetail`),
  `SkillCard` (cf. `AgentCard`; type icon/badge, source label,
  footer `{n} agents · v{version}`), `AddSkillMenu`, `CreateSkillModal`
  (cf. `CreateAgentModal`), `SkillDetail` (header + `Tabs` Config /
  Preview / Stats / Versions + `?tab=`, `evals` falls back to `config`),
  `SkillTypeBadge`.
- `helpers.ts`: `filterSkills`, `formatRate` (`—` on null), `acceptTone`
  (thresholds SPEC §3.4).
- Tests per folder: states, search, toggle, card footer, disabled menu
  items, invalid tab fallback.

### Task 12 — Config + Preview tabs

- `ConfigTab` (form, "What changed?" when body dirty, used-by note, 409 inline,
  `DeleteSkillDialog` with usage list), `PreviewTab` (`<Markdown>`).
- `helpers.ts`: `validateSkillForm`.
- Tests: validation, save with/without body change, message sent only on body
  change, delete dialog with/without agents, preview does not render raw HTML.

### Task 13 — Stats tab

- `StatsTab`: 4 `MetricCard`s (Used by + enabled sub-label, Versions, Last
  edited, Created), panel "Agents using this skill" with the agent's 30-day
  runs / findings / accept % and Open links, empty/error states. No donut,
  no pull/accept tiles.
- Tests: rendering from a `SkillStats` fixture, `—` for null accept, empty state.

### Task 14 — Versions tab

- `VersionsTab`, `VersionRow` (per-row inline **Diff** vs the previous version;
  Diff on every version but v1, Restore on every non-current one),
  `VersionDiff`, restore confirm.
- `helpers.ts`: `lineDiff(a, b)` (LCS over lines → `{ kind: 'add'|'del'|'same', text }[]`), pure.
- Tests: `lineDiff` cases (empty, identical, insert, delete, replace),
  Current row has no buttons, restore flow calls the API and refreshes.

### Task 15 — Agent Editor Skills tab

- `AgentEditor/_components/SkillsTab/` per SPEC §3.2 / §5.8.
  `helpers.ts`: `orderRows`, `toggle`, `move`, all pure and unit-tested.
- Add the tab to `TABS` + `VALID_TABS`. Pass `skillCount` to `AgentCard` (list + editor).
- Tests: attach/detach order, keyboard reorder, drag disabled while filtering,
  `disabled` badge, rollback on error.

---

## Task 16 — Verification & wrap-up

- `./scripts/dev.sh`, then walk through SPEC §7 1–12 by hand against the designs.
- e2e: one deterministic flow (create → attach → run with mock → trace + Stats)
  if `e2e/AGENTS.md` allows a mock LLM path; otherwise note it.
- Update `server/README.md` §API map and `client/README.md` §UI route map.
- `engineering-insights` wrap-up per touched package. Run `pr-self-review` before pushing.

## Size & risk

| Area | Size | Risk |
|---|---|---|
| Server 1–7 | M | executor touches every run (guarded by the "same prompt" test); agent-activity SQL (it-tests with fixtures) |
| Client 8–15 | M–L | 4 tabs + agent tab; DnD accessibility; layout extraction touches the agents screen |
| Contracts | S | two copies; CI catches drift |

Suggested PR split: **(A)** server 1–7 · **(B)** client 8–12 + 15 · **(C)** client 13–14.
