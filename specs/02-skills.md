# Skills — reusable review guidance

**Status:** agreed
**Packages touched:** server, client, seed (`reviewer-core`: no change)
**Designed from:** the feature requirements, the five UI mockups, and the current
`L02-lab` tree. Every decision below is argued from those three; §3 lists what the
codebase already provides and, where this design disagrees with it, says so.

---

## 1. Problem

An agent is one system prompt. Two reviewers that both need "our house rule on
async/await" each carry their own copy, and improving that rule means editing
every agent that embodies it. Nothing in the product is a unit of review guidance
that can be written once, versioned, vetted, and attached to several agents.

A **skill** is that unit: a name, a directive description, a type, and a markdown
body. It is **text and configuration only** — a skill never executes code, never
declares a tool, never reaches the filesystem or the network. Agents link skills;
the linked, enabled skills are appended to that agent's prompt in the order the
user chose. That last clause is the whole feature: a skill's only power is that
its text becomes instructions, which is also its only risk (§10).

## 2. Decisions

| # | Decision | Why | Rejected |
|---|---|---|---|
| D1 | `/skills` is a **list rail + tabbed editor** at `/skills/[id]` | matches the mockups and the agent editor the user already knows; a skill body is a document, and a document needs a full pane, not a drawer | card grid + side preview — reads well with six skills, cramps at thirty, and gives the markdown editor half a screen |
| D2 | The agent-tab checkbox is a **per-link enabled flag** | the mockup lists all six workspace skills with three ticked and drag handles on every row; that is only coherent if a row can be present-but-off, and it lets a user silence one skill for one agent without touching the others | checkbox = link/unlink — no migration, but then unticked rows have no order and "3 of 6 enabled" counts something the table cannot express |
| D3 | A **skill name is a slug**, unique per workspace | the mockups render names monospace (`pr-quality-rubric`), the prompt uses the name as its block header, and the seed has to be idempotent by something; `^[a-z0-9][a-z0-9-]{1,63}$` makes all three work | free-form display names — then two skills called "Tests" produce two identical prompt headers and nobody can tell the blocks apart in the trace |
| D4 | **Evals is a placeholder; Stats is real** | inventing pull/accept percentages in a product whose pitch is *grounded* findings would be self-defeating; §7.2 gives every tile a definition the data can satisfy | rendering the mockup's numbers as decoration |
| D5 | Runs record **which skills shaped them** (`agent_run_skills`) | it is what makes D4 possible, and it is the only way a trace can answer "was this skill in the prompt when this finding appeared" | deriving it from the agent version snapshot — a snapshot says what was linked, not what was sent, and it changes under you |
| D6 | Import is **server-side parse → preview → explicit save** | the preview must be produced by the same code that will store the result, and the choice of which file in an archive *is* the skill must not be made by the client | client-side parse + a plain create call — smaller, but then the server trusts a body the client assembled |
| D7 | **One new agent**, Test Quality Reviewer, with four skills | the requirement names it; one agent with four skills demonstrates ordering and per-link toggling better than two agents with two each | also seeding API Contract Reviewer |

## 3. What the current tree already gives us

This is a starter whose schema carries tables for every lesson, so part of the
feature's foundation is already in place. Checked, not assumed:

| Layer | Present | Where |
|---|---|---|
| DB | `skills`, `skill_versions` | `server/src/db/schema/skills.ts` |
| DB | `agent_skills(agent_id, skill_id, order)` | `server/src/db/schema/agents.ts:53-67` |
| DB | `findings.category`, `.accepted_at`, `.dismissed_at`, `reviews.run_id` | `server/src/db/schema/reviews.ts:20, 35-54` — this is what makes §7.2 computable |
| Contracts | `Skill`, `SkillType`, `SkillSource`, `AgentSkillLink` | `server/src/vendor/shared/contracts/knowledge.ts:114-199` |
| Agent API | `GET/POST /agents/:id/skills` | `server/src/modules/agents/routes.ts:145-166` |
| Agent data | `linkedSkills`, `skillIdsForAgent`, `linkSkill`, `unlinkSkill`, `setSkills` | `server/src/modules/agents/repository.ts:189-236` |
| Prompt | a `## Skills / rules` section fed by `PromptAssembly.skills` | `reviewer-core/src/prompt.ts:88-89, 109, 131` |
| Engine input | `ReviewInput.skills?: string[]` — **resolved bodies, not slugs** | `reviewer-core/src/review/run.ts:55-56, 132` |
| Trace UI | the run drawer renders that block in its own colour | `client/.../RunTraceDrawer/_components/TraceBody/TraceBody.tsx:79-81` |
| i18n | a `skills` namespace of ~70 keys | `client/messages/en/skills.json` |
| Routing | `activeKeyFor()` maps `/skills` → `"skills"` | `client/src/components/app-shell/helpers.ts:33` |
| Container | `container.agentsRepo`, `container.tokenizer` | `server/src/platform/container.ts:95, 128` |

**Where this design disagrees with what is there:**

- `skills.source` is `manual | imported_url | extracted | community`. A file
  upload is none of those, and labelling it `imported_url` would be a lie that
  every later lesson inherits. **Add `imported_file`** and use it; the mockup's
  badge already reads "Imported".
- `skills.name` has no uniqueness constraint and no shape. D3 adds both.
- `skill_versions` has no room for the "what changed" note the Versions mockup
  shows on every row. Add `message`.
- The i18n namespace was written against a **different trust model** (§10) and
  four of its strings are false under this design. They get rewritten.

**Not present, and therefore the work:** a `skills` server module; anything that
loads skills into a prompt; any record of which skills shaped a run; the `/skills`
UI; the agent editor's Skills tab; seed data.

## 4. Scope

**In** — CRUD and version history for skills, workspace-scoped, DB as the source
of truth · the `/skills` rail + editor (Config · Preview · Evals · Stats ·
Versions) · the agent editor's Skills tab (link, per-agent enable, reorder) ·
import from `.md` or `.zip` through a preview · prompt assembly from the enabled
skills, in order, with a token delta in the run log · seed for Test Quality
Reviewer and its four skills.

**Out** —

- Any execution surface. No tools, no scripts, no fs or network access, and no
  frontmatter key that implies one. A skill is a string; if a later lesson wants
  an executable skill, it is a different feature with a different threat model.
- URL import and the community catalog. The i18n file carries strings for both
  (`drawer.tabs.url`, `community.*`); they stay unused.
- The Evals tab and the header's **Run on evals** button (D4).
- **Per-finding** attribution. Stats attributes at the *run* level (§7.2); nothing
  in the pipeline can say which of four skills produced a given finding, and no
  label may imply otherwise.
- Prompt-size budgets. The token delta makes the cost visible; it does not cap it.
- Automatic extraction of skills from the repo (`source: 'extracted'` stays a
  value nothing writes yet).

## 5. Data model

### 5.1 Migration — generated, never hand-written

```
skills          + unique (workspace_id, name)          -- D3
                + index (workspace_id)
                  source enum += 'imported_file'        -- §3
skill_versions  + message text                          -- versions mockup
agent_skills    + enabled boolean not null default true -- D2
                + index (skill_id)                      -- reverse: "used by N agents"
agent_run_skills  run_id, skill_id, order  PK (run_id, skill_id)   -- D5
                + index (skill_id)
```

`cd server && pnpm db:generate && pnpm db:migrate`. **Nothing applies migrations
on boot**: a schema edit alone leaves TypeScript and Postgres disagreeing, and
the symptom is a runtime `column agent_skills.enabled does not exist`, not a
failed typecheck. Both tables are empty today, so the unique constraint and the
enum widening are free now and would not be later.

### 5.2 Versioning, and what reproducibility actually rests on

A change to `name`, `description`, `type` or `body` bumps `skills.version` and
inserts a `skill_versions` row carrying the body and the author's optional note
(≤200 chars, NULL when blank). Toggling `enabled` bumps nothing — a kill-switch
is not an edit. *Restore* writes the restored body **forward** as a new version
labelled "Restored from vN", so history is append-only and no eval result ever
points at a version whose text changed underneath it.

Editing a skill while a run is in flight is safe and needs no locking: bodies are
resolved once, at prompt assembly, and the run's trace stores the assembled text.
The version row is what lets you *find* that text again; the trace is what proves
it. `agent_run_skills` records the ids that took part, which is what Stats
aggregates over.

### 5.3 Agent version snapshots

`AgentVersionConfig.skills` stays `string[]` — the ordered ids of the links that
were **enabled** when the snapshot was taken. The shape must not change:
`agents/helpers.ts` parses old snapshots with `AgentVersionConfig.parse()`, which
throws on drift. Changing an agent's links bumps its config version; without that,
two runs both labelled "v3" can have used different skills, and the version number
stops meaning anything.

### 5.4 Deleting a skill

Hard delete, with a confirmation that names the agents currently linking it
(`agent_skills` and `agent_run_skills` cascade). Past runs keep their traces, so
what the model was actually told survives; what is lost is the skill's own stats.
Soft delete (`archived_at`) would preserve those, at the cost of a filter on every
read path and a UI for the archive — not worth it for a unit the user can
re-import from a file in ten seconds.

## 6. Contracts

`server/src/vendor/shared/contracts/knowledge.ts` is canonical; **hand-port the
delta to `client/src/vendor/shared/contracts/knowledge.ts` in the same commit** —
there is no sync script and the two copies have already drifted.

```ts
SkillSource       += 'imported_file'                                        // §3
AgentSkillLink    += enabled: z.boolean()                                   // D2
Skill             += token_estimate: z.number().int()                       // §8, Config tab

SkillSummary       = Skill.extend({ used_by: z.number().int() })
AgentSkillDetail   = Skill.extend({ order: z.number().int(), link_enabled: z.boolean() })
SkillVersion       = z.object({ skill_id, version, body,
                                message: z.string().nullish(), created_at })
SkillImportPreview = z.object({ name, description, type: SkillType, body,
                                source: SkillSource,
                                ignored_entries: z.array(z.string()),
                                warnings: z.array(z.string()) })
SkillStats         = z.object({                                             // D4, §7.2
  used_by: z.number().int(),
  agents: z.array(z.object({ id: z.string(), name: z.string() })),
  runs_with_skill: z.number().int(),
  runs_by_linked_agents: z.number().int(),
  pull_frequency: z.number().nullable(),   // null when the denominator is 0
  findings: z.number().int(),
  accepted: z.number().int(),
  settled: z.number().int(),               // accepted + dismissed
  accept_rate: z.number().nullable(),      // null when nothing is settled
  by_category: z.array(z.object({ category: z.string(), count: z.number().int() })),
  window_days: z.number().int(),
})
```

`server/src/db/rows.ts` gains `SkillRow` and `SkillVersionRow`
(`typeof t.skills.$inferSelect`); the module's pure helpers type against those.

## 7. Server — `src/modules/skills/`

A new module, registered with one import and one entry in `src/modules/index.ts`.
Layering follows the house shape: `routes.ts` (transport + zod) · `service.ts`
(business) · `repository.ts` (Drizzle) · `helpers.ts` (pure) · `constants.ts`.
**Routes must not import `db/schema`** — `pnpm arch` enforces it, and the
allowlist in `server/.dependency-cruiser.cjs` covers only pre-existing violators,
so copying the shape of a route that queries directly will fail the gate.

### 7.1 Routes

| Method | Path | Body / params | Returns |
|---|---|---|---|
| GET | `/skills` | — | `SkillSummary[]` |
| GET | `/skills/:id` | uuid | `Skill` |
| POST | `/skills` | `{name, description, type, body, source?, enabled?}` | `Skill` 201 · 409 on a duplicate name |
| PUT | `/skills/:id` | partial of the above `+ version_message?` | `Skill` |
| DELETE | `/skills/:id` | uuid | `{ok:true}` |
| GET | `/skills/:id/versions` | uuid | `SkillVersion[]`, newest first |
| GET | `/skills/:id/versions/:version` | uuid + int | `SkillVersion` |
| GET | `/skills/:id/stats` | uuid, `?days=30` | `SkillStats` |
| GET | `/skills/:id/agents` | uuid | `{id, name}[]` — the delete confirmation |
| POST | `/skills/import` | `{filename, content_b64}` | `SkillImportPreview` — **parses only, writes nothing** |

Every route resolves `workspaceId` through `getContext()` and scopes on it; a
cross-workspace id is a 404, not a 403, matching the rest of the API. The name
collision is the one case that is a 409 rather than a validation error — the
input is well-formed, the workspace just already has that skill.

### 7.2 Stats — one definition per tile, each one satisfiable

Everything is **run-level**, aggregated over `agent_run_skills ⋈ agent_runs ⋈
reviews ⋈ findings`, windowed on `agent_runs.ran_at` (default 30 days):

| Tile | Definition | Caveat |
|---|---|---|
| USED BY | `count(agent_skills where skill_id = ?)` | exact |
| AGENTS USING THIS SKILL | those agents, name + link to the agent editor | exact |
| PULL FREQUENCY | runs that included this skill ÷ runs by agents linked to it | exact — it measures how often the link was actually live |
| FINDINGS | findings from runs that included this skill | **run-level**; the label says "from runs that included this skill" |
| ACCEPT RATE | `accepted ÷ (accepted + dismissed)` over that same set | same caveat; a dismissed finding is a judgement, an untouched one is not |
| FINDINGS BY CATEGORY | `group by findings.category` over that same set, as **counts** | the mockup's `$52.00` is placeholder noise; a category is not money |

A skill linked to nothing, or linked but never run, renders `—` in every derived
tile — never `0%`, which would read as "tried and useless" rather than "no data".

### 7.3 Changes on the agents side

- `GET /agents/:id/skills` returns `AgentSkillDetail[]` — joined and ordered. The
  tab needs name, type and description; a bare link list would force an N+1.
- `POST /agents/:id/skills` accepts `{ skills: [{skill_id, enabled}] }` as the
  whole ordered set. The existing `skill_ids` / `skill_id` forms keep working.
- `AgentsRepository`: `setSkills` carries the flag, `linkedSkills` returns it, and
  `enabledSkillsForPrompt(agentId)` returns `{id, name, body}` in link order where
  `agent_skills.enabled AND skills.enabled`.
- `setSkills` / `linkSkill` / `unlinkSkill` snapshot the agent version (§5.3).

### 7.4 Import — parse in memory, return a preview, persist nothing

The client base64-encodes the file into a JSON body. A skill is a small text
document, so this keeps the route a plain zod-validated body with no multipart
plugin; the 33% encoding overhead is irrelevant against a 512 KB cap.

```
.md    frontmatter: a leading '---' block of flat `key: value` lines, BOM-tolerant.
       No YAML dependency — a skill's frontmatter is scalars by construction, and
       a nested mapping is skipped rather than guessed at.
         name        <- frontmatter.name ?? first '# ' heading ?? filename stem
         description <- frontmatter.description ?? first paragraph (<=200 chars)
         type        <- frontmatter.type when it parses as SkillType, else 'custom'
         body        <- the markdown with the frontmatter stripped
       The derived name is slugified (D3) and, if it collides, suffixed -2, -3 …
       in the preview, so confirming never 409s.

.zip   unzip in memory with `fflate` (`pnpm add`, in server/ — npm there would
       create a competing lockfile). Chosen over adm-zip/unzipper because it is
       sync, dependency-free, and has no extract-to-disk API at all: the "never
       writes to disk" property is structural, not a rule someone has to follow.
         core: SKILL.md, else README.md, else the shallowest single *.md;
               ties break on path depth then alphabetically, so the same archive
               always yields the same skill
         every other member -> ignored_entries[], listed in the preview
         members that look executable (.sh .js .ts .py .ps1 .exe .so, …)
               -> warnings[], shown as "not imported, never run"
```

Caps, enforced before parsing completes: ≤512 KB decoded upload, ≤200 members,
≤2 MB total uncompressed, ≤256 KB for the chosen markdown. Members are read into
memory only, and **no member path is ever resolved against a directory**, so
zip-slip has no surface — the only thing that leaves the function is text. An
archive with no markdown member is a 422 that lists what it did contain.

### 7.5 Prompt assembly — `src/modules/reviews/run-executor.ts`

In `runOneAgent`, immediately before `reviewPullRequest`:

```ts
const skills = await this.agents.enabledSkillsForPrompt(agent.id);
const blocks = skills.map((s) => `### ${s.name}\n${s.body}`);
runLog.info(`skills: ${skills.length} attached (+~${tokens} tokens)`);
await this.reviewRepo.recordRunSkills(runId, skills.map((s) => s.id));   // D5
…
...(blocks.length ? { skills: blocks } : {}),
```

- `this.agents` is the already-injected `Container['agentsRepo']` — the sanctioned
  path; `reviews` may not import another module's folder
  (`no-cross-module-internals`).
- Omitting the key when there are no skills keeps the prompt **byte-identical**
  for every agent that has none. That is what makes the control experiment a
  clean A/B rather than two different prompts.
- The `### <name>` header is added here, not in `reviewer-core`: the engine takes
  resolved strings, and a CI runner resolving the same names off a filesystem
  later must produce the same bytes.
- The token delta comes from `container.tokenizer` (js-tiktoken, already wired),
  so the logged number is the real cost, not an estimate.
- **No trace work is required.** The executor already persists `outcome.assembly`,
  `assemblePrompt` puts the joined block into `PromptAssembly.skills`, and the
  drawer already renders it. Passing skills makes the block appear; disabling one
  makes it disappear.

## 8. Client

```
src/app/skills/page.tsx                     rail + "select a skill" prompt
src/app/skills/[id]/page.tsx                rail + editor; active tab in ?tab=
src/app/skills/{constants,helpers,styles}.ts    (+ helpers.test.ts)
src/app/skills/_components/SkillsRail/          search · Add Skill · cards
  └── _components/{SkillRailCard, NewSkillModal, ImportSkillDrawer}/
src/app/skills/_components/SkillEditor/         header + tab shell
  └── _components/{ConfigTab, PreviewTab, EvalsTab, StatsTab, VersionsTab}/
src/lib/hooks/skills.ts                     useSkills · useSkill · useCreateSkill ·
                                            useUpdateSkill · useDeleteSkill ·
                                            useImportSkillPreview · useSkillVersions ·
                                            useSkillStats · useSkillAgents ·
                                            useAgentSkills · useSetAgentSkills
src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/
```

**Config** — name (slug-validated inline, D3) · description · type · markdown body
with line numbers, an `unsaved` badge, and the token count **from the server**
(`token_estimate`), so the number on screen is the number the prompt will cost
rather than a `chars / 4` guess the client invents. Under the description sits the
hint that makes the field mean something: *"The skill's interface — write it as a
directive, saying when the skill applies."* Save → toast `Saved (v{version})`, so
the version bump is visible. The `Enabled` switch patches that field alone, which
is what keeps it from writing a version.

**Preview** — the body rendered exactly as the reviewing agent receives it.

**Evals** — a placeholder naming the lesson it arrives with; **Run on evals** in
the header renders disabled with the same tooltip (D4).

**Stats** — the four tiles, the agents list and the category donut of §7.2, each
labelled with what it measures, and `—` wherever a denominator is zero.

**Versions** — `Version history · N versions`, the subtitle *"Every save snapshots
the body so eval runs stay reproducible against the exact text they scored"*, rows
of `vN · message · date` with a `Current` badge on the newest and `Diff` /
`Restore` on the rest. Diff is a client-side LCS line diff — no new dependency.

**Agent Skills tab** — header `Skills` + `{enabled} of {total} enabled`, a filter,
the order hint, then rows of `[drag handle] [checkbox] [name] [type chip]`. The
checkbox toggles the per-agent flag and the row stays put (D2); reorder is native
HTML5 `draggable` **plus ↑/↓ buttons**, because drag is unreachable from a
keyboard and from tests, and no DnD dependency exists in this client. Both actions
POST the full ordered array, optimistic on the query cache, invalidated on settle.
A skill whose global `enabled` is false renders struck-through and cannot be
switched on from here — the kill-switch outranks the link.
`AgentEditor/constants.ts` `TABS` and `VALID_TABS` in `agents/[id]/page.tsx`
(today `["config"]`) each gain `"skills"`.

**Navigation — the one sanctioned vendor edit.** `client/src/vendor/ui/` is
"treat as a library", but `nav.ts` is a data registry rather than component code,
and `activeKeyFor()` already expects `/skills`. Add a `SKILLS LAB` section holding
`Skills` and `Agents` (moving `agents` out of `WORKSPACE`, as the mockups show)
plus a `g s` entry in `SHORTCUTS`, and call the vendor edit out in the PR body.

House rules that bite here: double quotes, no `.js` on relative imports, no
`fetch` inside a component (hooks only), thin pages, and
`@testing-library/user-event` is **not installed** — tests use `fireEvent`.

## 9. Seed and the control experiment (D7)

`server/src/db/seed.ts` is idempotent by name; the slug constraint of D3 makes
that safe for skills too. One new agent, four skills:

| Skill | type | What it says |
|---|---|---|
| `test-coverage-nudge` | custom | every new branch needs an assertion that fails without it |
| `corner-case-checklist` | rubric | empty · null · boundary · concurrency · error path |
| `mocking-smells` | convention | a mock that encodes the implementation instead of the contract |
| `flake-signals` | convention | time, ordering, shared state, or network inside a unit test |

**Test Quality Reviewer** — uncovered branches, missing corner cases,
over-mocking, flake signals. Its prompt is drafted in
`docs/agent-prompts/test-quality-reviewer.md`, beside the three that exist. The
agent seeds **disabled**, so a fresh clone's review runs are unchanged until the
lesson switches it on.

The experiment: one PR whose test covers only the happy path. Skills off → the
agent passes it. Skills on → it flags the uncovered branch and the boundary case.
Open the run trace → prompt assembly → the `## Skills / rules` block and its token
delta are visible, and the run log line names the count. At least one seeded skill
is **replaced through the import flow on camera**, so the whole path is shown even
though the seed keeps it reproducible from a fresh clone.

## 10. Trust, and the copy that has to change

An imported skill's text becomes instructions inside your agent's prompt. That is
not a flaw to be engineered away — it is what a skill *is*. Wrapping bodies in
"treat as untrusted data" delimiters would make the feature inert while sounding
safer, which is worse than doing nothing. The defences that actually work here are
product-shaped: import always goes through a preview, the source is badged on the
card and in the editor, executable members of an archive are listed as *not
imported and never run*, and nothing is enabled by the act of importing it.

Four strings in `client/messages/en/skills.json` were written against the opposite
model and are false under this design — `file.bodyHint`, `file.success`,
`url.hint` and `preview.untrustedNotice` all claim the body is wrapped or stored
as data. Rewrite them honestly: *"An imported skill's text becomes instructions in
your agent's prompt. Read it before you enable it."* Keep `listItem.needsVetting`
and `preview.untrustedBadge` — a badge is exactly the right warning.

New keys: `listItem.source.imported_file`, `import.ignored` ("Not imported
({count})"), `import.executableWarning`, the description-field directive hint, the
Stats tile labels with their run-level caveat, the Versions subtitle, and a reword
of `page.menu.fromFile` to "Import from file (.md or .zip)".

This is also the point the video makes out loud: *someone else's skill is someone
else's instructions inside your agent's prompt.*

## 11. Testing

| Lane | What | Where |
|---|---|---|
| server unit | frontmatter parsing (present · absent · malformed · BOM), slugification and collision suffixing, archive core selection, ignored + executable classification, every size cap, the version-bump predicate | `server/test/skills-helpers.test.ts` |
| server it | CRUD + workspace scoping; 409 on a duplicate name; version bump on a body edit vs none on a toggle; link set / reorder / per-agent enable; delete cascades; a link change bumps the agent version | `server/test/skills.it.test.ts` |
| server it | the prompt carries exactly the `link.enabled && skill.enabled` bodies in link order; zero skills → assembly byte-identical to today; `agent_run_skills` matches the block | `server/test/skills-prompt.it.test.ts` |
| server it | stats: the pull-frequency denominator, accept rate over settled findings only, `null` when nothing is settled, the category rollup, the window bound | `server/test/skills-stats.it.test.ts` |
| client | rail card render + toggle; the import drawer shows a preview, lists ignored entries, and **does not create anything before confirmation**; save surfaces the new version; Versions diff and restore | colocated `*.test.tsx` |
| client | SkillsTab: the count chip, the checkbox toggle, and ↑/↓ reorder issuing one ordered POST | colocated `*.test.tsx` |

`*.it.test.ts` is what selects the Docker lane; a DB test without the suffix runs
in the unit lane and fails. Integration tests self-skip without Docker and still
report green, so check the test count, not the exit code.

## 12. Work breakdown

| Wave | Deliverable |
|---|---|
| 1 | Schema + generated migration + contracts (**both vendor copies**) + `db/rows.ts` |
| 2 | `skills` module: CRUD, versions, slug rules; registry entry |
| 3 | Import parsing + `POST /skills/import` + `fflate` |
| 4 | Agents side: per-link enabled, detail DTO, agent version bump |
| 5 | Prompt assembly + token log + `agent_run_skills` |
| 6 | `GET /skills/:id/stats` |
| 7 | `/skills` rail + editor shell + Config + Preview + hooks |
| 8 | Versions tab (diff, restore) and Stats tab; Evals placeholder |
| 9 | Import drawer + the copy changes of §10 |
| 10 | Agent Skills tab + nav entry + shortcut |
| 11 | Seed agent, four skills, prompt doc |
| 12 | Tests across every lane |

Waves 1–6 are backend and land independently of 7–10. After wave 1, applying it is
a manual third step: `pnpm db:generate`, `pnpm db:migrate`, then `pnpm db:seed`.

## 13. Acceptance criteria

1. A skill is created and edited in the UI; a body edit bumps the version and
   writes a `skill_versions` row, while a pure enable/disable toggle does neither.
2. Versions lists that history with the author's note, diffs two versions, and
   restores an old body forward as a new one.
3. Test Quality Reviewer exists with its four skills linked, ordered, and
   individually switchable from its Skills tab.
4. Stats shows real numbers under labels that say what they measure, and `—`
   rather than `0%` wherever a denominator is zero.
5. An enabled skill appears in the run trace as its own `## Skills / rules` block
   with its `### name` header and a logged token delta; disabling it removes the
   block and leaves the rest of the prompt unchanged.
6. Import went through a preview: an archive's non-markdown members were listed as
   ignored, nothing was written to disk or executed, and the skill was persisted
   only after confirmation.
7. Control experiment: a happy-path-only test PR is passed with skills off, and
   flags the uncovered branch and the boundary case with skills on — reproducible
   from a fresh clone plus `pnpm db:seed`.
8. `pr-self-review` still exists with auto-invoke off, is invokable by hand, and
   pulls in both frontend and backend skills.

## 14. Risks

- **Contract mirror drift** — the client copy of `@devdigest/shared` already lags;
  skipping the hand-port makes the Skills page compile against a stale `Skill`.
- **Migration not applied** — a schema edit without `db:generate` + `db:migrate`
  fails only at runtime, on a column that does not exist.
- **Stats overclaiming** — the tiles are run-level. If any label implies a finding
  came from a particular skill, the feature is lying; the caveat wording is part
  of the deliverable, not decoration.
- **No transactions anywhere in this server** — `setSkills` is delete-then-insert,
  so a crash between the two empties an agent's skill list. Pre-existing condition,
  named here, not fixed here.
- **`AgentVersionConfig.parse` throws on drift** — the snapshot's `skills` field
  keeps its shape (§5.3).
- **Prompt-size blowout** — four 2 KB skills plus repo-intel context can crowd the
  diff out of the window. The token delta makes it visible; no budget ships.
