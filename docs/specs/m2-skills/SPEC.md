# M2 · Skills — specification

Roadmap: **M2 — Skills in the product** (root `README.md` §Roadmap).
Packages: `server` (new module, executor wiring, contracts, seed), `client`
(Skills page with 4 tabs, agent **Skills** tab, nav). `reviewer-core`: **no change**.
Plan: [PLAN.md](PLAN.md).

Designs: agent **Skills** tab · skill **Preview** · skill **Stats** · skill
**Versions**. The skill **Config** tab has no screenshot. It follows the agent
Config tab. The designs also show an **Evals** tab and a **Run on evals**
button, and the Stats design shows metrics that need per-run skill tracking.
Both are deliberately **not built** in M2 (§3.4, §6).

## 1. Problem

An agent today is `model + system prompt`. Rules that several reviewers share,
such as "no secrets in diffs" or the PR quality rubric, have to be copy-pasted
into every agent's prompt and then kept in sync by hand. Nobody can see which
agents use a rule or how its wording changed over time.

Most of the plumbing exists but is not connected:

| Piece | Where | State |
|---|---|---|
| `skills`, `skill_versions` tables | `server/src/db/schema/skills.ts` | exist, empty, no module uses them |
| `agent_skills` link table (`order`) | `server/src/db/schema/agents.ts` | exists, cascades on both sides |
| `GET/POST /agents/:id/skills` | `server/src/modules/agents/routes.ts` | exist; `setSkills` does not check that the skill ids belong to the workspace and is not transactional |
| `Skill`, `SkillType`, `SkillSource`, `AgentSkillLink` contracts | `vendor/shared/contracts/knowledge.ts` (both copies) | exist |
| Prompt slot `skills?: string[]` → `## Skills / rules` | `reviewer-core/src/prompt.ts`, `review/run.ts` | exists, never filled |
| Run executor | `server/src/modules/reviews/run-executor.ts` | never loads skills |
| Per-agent run data: `agent_runs` (`agent_id`, `status`, `ran_at`), `findings` (`accepted_at`, `dismissed_at`) | `server/src/db/schema/runs.ts`, `reviews.ts` | exist: the source for the agent rows on the Stats tab |
| `Markdown`, `MetricCard`, `Tabs`, `Toggle`, `Checkbox` | `client/src/vendor/ui` | exist; `Markdown` renders no raw HTML |
| UI strings | `client/messages/en/skills.json`, `agents.json` → `skills.*` | partly exist (import strings are for a later milestone) |
| `/skills` sidebar key | `client/src/components/app-shell/helpers.ts` | mapped, but there is no nav item and no page |
| `AgentCard` `skillCount` prop | `client/src/app/agents/_components/AgentCard` | exists, never passed |

## 2. Goal

1. A **Skills** page shaped like the Agents page: a **grid of skill cards**
   (no list beside it). A card opens the skill at `/skills/:id`, a full-width
   page with tabs **Config · Preview · Stats · Versions**. The user creates,
   edits, enables/disables, deletes, previews, diffs and restores versions of
   skills, and sees which agents use them.
2. A **Skills** tab in the Agent Editor (agents design 2) where the user
   attaches workspace skills to an agent and orders them.
3. A review run puts the agent's attached, enabled skills into the prompt in
   that order, and the run trace shows which skill versions were used.

### What a skill is

A skill is **text only**:

| Field | Meaning |
|---|---|
| `name` | kebab-case slug (`secret-leakage-gate`), unique in the workspace |
| `description` | one line, shown on cards |
| `type` | `rubric · convention · security · custom`: badge colour and label, no effect on behaviour |
| `source` | `manual · extracted · community · imported_url`: provenance label on the card. This milestone only creates `manual`. |
| `body` | Markdown: the rule text that goes into the prompt |
| `enabled` | global switch (see §3) |
| `version` | read-only, bumped by the server on each body change |

A skill has **no** model, provider, tools, scripts, files, variables or
templating, and it cannot reference other skills. The body is inert text. The
server never parses or executes it. It is only copied into the prompt.

## 3. Decisions (agreed)

### 3.1 Lifecycle

| Topic | Decision |
|---|---|
| Creation | **Manual only.** "Add Skill ▾" is a dropdown (as designed): **Create from scratch** opens the create modal (name, description, type, body). Below a divider, *Import from file*, *Import from URL* and *Search community skills…* are listed as **disabled** items with a "soon" hint (existing `page.menu.*` strings). `source` is always `manual`, set by the server. |
| Reuse across agents | One skill row is shared by any number of agents through `agent_skills`. It is never copied. |
| Versioning | **Only a body change** creates a version: `skills.version + 1` and a `skill_versions` row `(version, body, message, created_at)`. The design: "Every save snapshots the body…". Editing name, description or type and toggling `enabled` change the row in place, with no version. |
| Version message | Optional **"What changed?"** input next to Save on the Config tab, max 120 chars. Empty → server writes `Edited body`. v1 → `Initial version`. Restore → `Restored from v{n}`. |
| Latest wins | Agents **always use the current** version. Agent versions are not bumped when a skill changes. |
| Restore | Versions tab → **Restore** on vN creates a **new** version (vCurrent+1) whose body equals vN's, with message `Restored from vN`. History is never rewritten. Confirm dialog first. |
| Diff | Versions tab → **Diff** on a row expands, **inline in that row**, a line diff of that version against the **previous** one (vN-1 → vN; green added, red removed, unchanged lines dimmed, scrolls when long). Every version except v1 has Diff, **the current one included**: on the current row it shows what the latest save changed. A second click collapses it. It is computed on the client; there is no diff library dependency. |
| Global enabled | `skills.enabled` is a **kill switch**. A disabled skill stays attached but is left out of **every** agent's prompt. The card toggle and the agent Skills tab (`disabled` badge) show it. |
| Delete | **Danger zone** at the bottom of the Config tab. Allowed **with confirmation**: the dialog lists the agents that use the skill ("Used by 3 agents: Security Reviewer, …"). Confirming deletes the skill; links and versions cascade. |
| Name | `^[a-z0-9]+(-[a-z0-9]+)*$`, 1–64 chars, unique per workspace (new unique index), because M6 Export to CI resolves `.devdigest/skills/<slug>.md`. A duplicate returns `409` → inline error. |
| Body size | 1–20 000 chars (Zod, both ends). Live `n / 20,000` counter. |

### 3.2 Agent Skills tab (agents design 2)

| Topic | Decision |
|---|---|
| List | Every workspace skill. Attached ones come first, in `order`; unattached ones follow, sorted by name. Counter: `{attached} of {total} enabled`. |
| Attach / detach | The checkbox appends the skill to the end or removes it. Each change **saves immediately** via `POST /agents/:id/skills { skill_ids }`, optimistic, with rollback + toast on error. |
| Reorder | Drag handle on attached rows (native HTML5 DnD, no new dependency) **plus** `Alt+↑/↓` on a focused row. Drag is disabled while the filter is non-empty. |
| Agent version | Changing the attached set or order **bumps the agent version** and snapshots `agent_versions` (`config.skills` already records the ordered ids; today it goes stale). |
| Workspace isolation | `400` if any id is not a skill in the agent's workspace (closes the current cross-tenant gap). Delete + insert run in one transaction. |

### 3.3 Prompt

| Topic | Decision |
|---|---|
| Placement | No engine change. reviewer-core renders `## Skills / rules` in the **user** message. The server passes one string per skill: `### {name}\n{body}`. With no enabled skills the section is omitted, so the prompt is byte-identical to today. |
| Trust | Bodies are user-authored in this workspace, so they are trusted-ish, like the system prompt, and **not** `wrapUntrusted`. Any future import must wrap untrusted sources and keep them disabled until vetted. |
| Reproducibility | No new table. The executor logs `Skills: secret-leakage-gate@v3, lethal-trifecta@v1` (or `Skills: none`) to the run log, and the assembled text goes into `prompt_assembly.skills`. Both are persisted in the existing `run_traces` document. |

### 3.4 Stats: only what the DB already has

Stats are computed from existing tables only (`skills`, `skill_versions`,
`agent_skills`, `agents`, `agent_runs`, `findings`). M2 adds **no** tracking of
which skill was in which run.

| Metric | Source | Shown as |
|---|---|---|
| **Used by** | `agent_skills` count for the skill; the enabled ones are counted separately | `3 agents` · sub-label `2 enabled` |
| **Versions** | `skill_versions` count | `5` |
| **Last edited** | `skills.updated_at` | relative ("2 days ago"), absolute date in the title |
| **Created** | `skills.created_at` | date |
| **Agents using this skill** | attached agents, each with its **own** last-30-day numbers from `agent_runs` + `findings`: completed runs, findings, accept rate = `accepted ÷ (accepted + dismissed)` (`—` when nothing decided), plus an **Open** link → `/agents/:id?tab=skills` | panel with one row per agent |

- The agent numbers are **the agent's**, not the skill's. The panel header says
  so: "Agent activity, last 30 days". Nothing is attributed to the skill.
- **Not built** (they need per-run skill tracking): Pull frequency, per-skill
  Accept rate, Findings (30d), Findings by category. The Stats design shows
  them; M2 leaves them out and does not render placeholders.
- Card footer = `{n} agents · v{version}` (design: `3 agents · 71% pull · 74%
  accept`, reduced to the data we have).
- Accept colour on agent rows: ≥ 60 % `--success`, 40–59 % `--warning`, < 40 %
  `--danger`, `—` muted.

### 3.5 Navigation, layout, seed

| Topic | Decision |
|---|---|
| Evals | **Not built.** No Evals tab, no Run on evals button. |
| Navigation | New sidebar group **SKILLS LAB**: *Skills* (`/skills`, `g s`) and *Agents* (moved from WORKSPACE, keeps `g a`), as designed. Other design items (Conventions, Eval Dashboard, …) are not added. |
| Routes | `/skills` (card grid) and `/skills/:id?tab=config\|preview\|stats\|versions` (default `config`; a card always opens Config). An invalid tab (including `evals`) falls back to `config`. |
| Layout | `/skills` mirrors `/agents`: title + subtitle, search, **Add Skill ▾**, then a responsive card grid (`repeat(auto-fill, minmax(280px, 1fr))`). `/skills/:id` is a single full-width column (back link `← All skills`, header, tabs): there is **no skill list beside the detail**. |
| Agent card | The `Agent` DTO gains `skill_count` (attached skills, disabled ones included) → "N skills" on agent cards. |
| Seed | `pnpm db:seed` adds the six skills from the designs, all `manual`, with realistic bodies (the `pr-quality-rubric` body is the one on the Preview design), and attaches three of them to Security Reviewer. Idempotent by `(workspace, name)`. |

### Consequences (accepted)

- Each checkbox click or drop in the agent Skills tab creates a new agent version.
- Editing a shared skill changes every agent that uses it, starting with the
  next run. The Config tab says so next to Save ("Used by N agents — changes
  apply to their next run").
- There is no answer yet to "does this skill help?". That needs per-run skill
  tracking, a later milestone (§6).

## 4. Data & API changes

### 4.1 DB (one migration via `pnpm db:generate`)

- `skills`: unique index `skills_workspace_name_uq (workspace_id, name)`;
  `updated_at timestamptz not null default now()`.
- `skill_versions`: `message text not null default ''`.
- No new tables.

### 4.2 Contracts (`server/src/vendor/shared` **and** `client/src/vendor/shared`, byte-identical)

```ts
// knowledge.ts
export const SkillName = z.string().min(1).max(64).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
export const SkillBody = z.string().min(1).max(20_000);

export const Skill = z.object({ /* existing fields */,
  created_at: z.string(),
  updated_at: z.string(),
  agent_count: z.number().int(),        // card footer, filled on list + get
});

export const CreateSkillInput = z.object({
  name: SkillName,
  description: z.string().max(200).default(''),
  type: SkillType.default('custom'),
  body: SkillBody,
  enabled: z.boolean().default(true),
});
export const UpdateSkillInput = CreateSkillInput.partial().extend({
  message: z.string().max(120).optional(),  // used only when body changes
});

export const SkillVersion = z.object({
  skill_id: z.string(), version: z.number().int(),
  body: z.string(), message: z.string(), created_at: z.string(),
});

export const SkillUsage = z.object({ agent_id: z.string(), agent_name: z.string() });

export const SkillAgentActivity = SkillUsage.extend({
  enabled: z.boolean(),
  runs_30d: z.number().int(),
  findings_30d: z.number().int(),
  accept_rate_30d: z.number().min(0).max(1).nullable(), // null = nothing decided
});

export const SkillStats = z.object({
  agent_count: z.number().int(),
  enabled_agent_count: z.number().int(),
  version_count: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
  agents: z.array(SkillAgentActivity),
});

// Agent gains:
skill_count: z.number().int().default(0),
```

### 4.3 API (new `server/src/modules/skills/`, all workspace-scoped)

| Method | Path | Body → Response | Errors |
|---|---|---|---|
| GET | `/skills` | → `Skill[]` (name asc, with `agent_count`) | |
| GET | `/skills/:id` | → `Skill` | 404 |
| POST | `/skills` | `CreateSkillInput` → `201 Skill` (v1 + snapshot `Initial version`) | 400, 409 |
| PUT | `/skills/:id` | `UpdateSkillInput` → `Skill` | 400, 404, 409 |
| DELETE | `/skills/:id` | → `{ ok: true }` | 404 |
| GET | `/skills/:id/agents` | → `SkillUsage[]` (delete dialog) | 404 |
| GET | `/skills/:id/stats` | → `SkillStats` | 404 |
| GET | `/skills/:id/versions` | → `SkillVersion[]` (newest first) | 404 |
| GET | `/skills/:id/versions/:version` | → `SkillVersion` | 404 |
| POST | `/skills/:id/versions/:version/restore` | → `Skill` (new version) | 404, 409 if `:version` is current |

`agent_count` on the list comes from one grouped count (no N+1). The 30-day
agent activity is one grouped query over `agent_runs` ⋈ `findings` for the
attached agent ids (`status = 'done'`, `ran_at ≥ now() − 30 days`).

Changed: `POST /agents/:id/skills` (ownership check, transaction, agent
version bump); `GET /agents`, `GET /agents/:id` return `skill_count`.

### 4.4 Run executor

Before `reviewPullRequest(...)`:

1. Load the agent's linked skills ordered by `agent_skills.order` and drop `enabled = false`.
2. `skills = rows.map(s => \`### ${s.name}\n${s.body}\`)`, passed only when non-empty.
3. Log `Skills: name@vN, …`.

`prompt_assembly.skills` in the trace is filled by reviewer-core. The Run Trace
drawer already renders it.

## 5. UI behaviour

### 5.1 `/skills`: card grid

- Header (as `/agents`): **Skills** + subtitle, search (name + description,
  case-insensitive, client-side) and **Add Skill ▾** (§3.1).
- Card (cf. `AgentCard`): type-coloured icon · name (mono) · enabled `Toggle`
  (saves immediately, dims the card when off) · description (1 line,
  ellipsis) · type badge · source label with icon (`Manual`, `Extracted`,
  `Community`, `Imported`) · divider · footer `{n} agents · v{version}`.
- Clicking a card (or its name link) → `/skills/:id?tab=config`. The toggle
  does not open the card.
- States: skeletons · `page.loadError` + retry · empty (`page.empty.*`, CTA → create modal).

### 5.2 `/skills/:id`: skill page

- `← All skills` back link above the header.
- Header: type icon · name · type badge · `⟲ v{version}` badge. No Run on
  evals button. Below it, `Tabs`: Config · Preview · Stats · Versions (`?tab=`).
- Not found → `detail.notFound.*`; load error → `detail.loadError` + retry.

### 5.3 Config tab (no design — mirrors the agent Config tab)

Enabled toggle (top right) · Name* · Description · Type (select) · Body
(mono textarea, `n / 20,000`) · hint `preview.bodyHint` · **What changed?**
(shown only when the body is dirty) · footer **Save skill** / **Cancel** +
"Used by N agents — changes apply to their next run". Save is disabled while
the form is pristine or invalid. Toast: `Skill saved (v{n})` or `Skill saved`
when there is no new version. 409 → inline error on Name. **Danger zone**:
Delete skill → dialog (§3.1).

### 5.4 Preview tab (design)

Title **Preview**, subtitle "Rendered as the reviewing agent receives it". The
current body is rendered with `<Markdown>` (GFM, no raw HTML) in a bordered
card. It shows the saved body, not unsaved Config edits. Long bodies scroll
inside the pane.

### 5.5 Stats tab (design, reduced per §3.4)

Row of four `MetricCard`s: **Used by** (`{n} agents`, sub `{m} enabled`) ·
**Versions** · **Last edited** · **Created**. Below it, the panel **Agents using
this skill**, header sub-label "Agent activity, last 30 days". One row per
agent: agent icon · name · `disabled` badge if off · `{runs} runs · {findings}
findings · {accept}% accept` · **Open**. Empty → "Not used by any agent" +
hint to attach it from an agent's Skills tab. Loading skeletons · error + retry.

### 5.6 Versions tab (design)

**Version history** + `{n} versions` badge + subtitle. One bordered card per
version, newest first: `v{n}` chip · message (`—` if empty) · date
(`YYYY-MM-DD`) · actions:

| Row | Actions |
|---|---|
| Current (latest) | `● Current` badge · **Diff** |
| Older, has a predecessor | **Diff** · **Restore** |
| v1 | **Restore** only (nothing to diff against); `Current` badge too when it is the only version |

**Diff** toggles an inline panel under the row header: the changes from the
previous version to this one (`aria-expanded` on the button). **Restore**:
confirm → POST → toast `Restored v{n} as v{new}` → list and header badge refresh.

### 5.7 Agent Editor → Skills tab (agents design 2)

As in §3.2. Header: `Skills` + counter badge · filter · hint
`skills.orderHint`. Row: drag handle (attached only) · checkbox · name ·
`disabled` badge if globally off · type badge. Empty workspace → empty state
with a link to `/skills`. The agent tabs Evals / Stats / CI stay out of scope.

## 6. Out of scope

- **Evals**: the skill Evals tab, the Run on evals button, the eval pipeline (M6).
- **Per-run skill tracking** and the metrics built on it: Pull frequency,
  per-skill Accept rate, Findings (30d), Findings by category.
- Import from file, URL or community catalogue; vetting of untrusted skills.
- Per-finding skill attribution; selective (relevance-based) skill loading.
- Pinning a skill version per agent.
- Agent Evals / Stats / CI tabs; agent-card run stats.
- Changes to reviewer-core or to prompt section order.
- Unsaved-changes guard when leaving the editor.

## 7. Acceptance criteria

1. Create `secret-leakage-gate` → card in the list, header `v1`, Versions shows `v1 · Initial version · Current`. Creating it again → 409, inline error.
2. Edit the body with message "Tighten" → `v2`; Versions lists v2 (Current) and v1. Editing only the description or toggling enabled keeps `v2`.
3. Versions: `v2` has `Current` + **Diff**; Diff expands inline and shows what v2 changed compared with v1. `v1` has only **Restore** (no Diff). Restore v1 → `v3` "Restored from v1", body equals v1; now v3 is Current and v2 has both Diff and Restore.
4. Preview renders the saved body as Markdown. A `<script>` in the body is shown as text, not executed.
5. Attach the skill to two agents in their Skills tabs → both agent cards show "N skills". The skill card shows `2 agents · v3`. Stats shows Used by 2 and both agents with their 30-day numbers matching a manual SQL count.
6. Reorder in the tab → reload → order kept. Agent version bumped once per change.
7. Run a review → the trace shows `## Skills / rules` in tab order, and the log shows `Skills: name@vN`.
8. Disable the skill globally → the next runs omit it. The agent tab shows `disabled`.
9. An agent with no (enabled) skills produces a prompt identical to today's.
10. Delete a used skill → the dialog lists the agents → confirm → it is gone from the list and the agent tabs.
11. Another workspace's skill id in `POST /agents/:id/skills` → 400. Every `/skills/:id*` of another workspace → 404.
12. There is no Evals tab and no Run on evals button; `?tab=evals` opens Config.
13. `scripts/check-contracts.sh`, server + client typecheck and tests pass.

## 8. Open questions (non-blocking; the defaults above apply unless changed)

1. **Body limit**: 20 000 chars per skill, no cap on the total. Should there be a total budget per agent?
2. **Agent version bump per click** in the Skills tab: acceptable, or bump behind a Save button?
3. **Config tab** has no design: is "mirrors the agent Config tab + Danger zone" right?
