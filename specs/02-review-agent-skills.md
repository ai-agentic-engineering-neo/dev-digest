# Skills for review agents

**Status:** specified, not implemented. Written before the code (L02).
**Revision 2** — rewritten against the updated Skill Editor designs (master-detail
rail + five-tab editor, per-skill usage stats, versions).

## Context

An agent today is `provider + model + system_prompt`. Every rule it applies has
to live inside that one prompt, which means rules cannot be shared: teaching
the Security Reviewer about the lethal trifecta and teaching a Test Quality
Reviewer the same thing are two copy-pastes of the same paragraph, and they
drift the moment one is edited.

A **skill** is that paragraph, extracted: a named, reusable, markdown block of
reviewer instructions that any number of agents can link, order, and toggle.
Nothing more — a skill has no code, no tools, no execution. It is text that
gets concatenated into the prompt.

### What already exists

Substantially more than a greenfield feature. Verified in the tree today:

| Layer | Already there | File |
|---|---|---|
| Schema | `skills`, `skill_versions`, `agent_skills` tables | [server/src/db/schema/skills.ts](../server/src/db/schema/skills.ts), [agents.ts](../server/src/db/schema/agents.ts), DDL in [0000_init.sql](../server/src/db/migrations/0000_init.sql) |
| Schema | `eval_cases.ownerKind` is already `'skill' \| 'agent'` | [db/schema/eval.ts](../server/src/db/schema/eval.ts) |
| Schema | `findings.acceptedAt` / `dismissedAt` + `POST /findings/:id/accept\|dismiss` | [db/schema/reviews.ts](../server/src/db/schema/reviews.ts), [reviews/findings.ts](../server/src/modules/reviews/findings.ts) |
| Contracts | `Skill`, `SkillType`, `SkillSource`, `AgentSkillLink` | [knowledge.ts:114-199](../server/src/vendor/shared/contracts/knowledge.ts#L114-L199) |
| Repository | `linkedSkills`, `skillIdsForAgent`, `linkSkill`, `unlinkSkill`, `setSkills` | [agents/repository.ts:189-230](../server/src/modules/agents/repository.ts#L189-L230) |
| Routes | `GET`/`POST /agents/:id/skills` | [agents/routes.ts](../server/src/modules/agents/routes.ts) |
| Prompt | `PromptParts.skills` → `## Skills / rules` section; `PromptAssembly.skills` | [reviewer-core/src/prompt.ts](../reviewer-core/src/prompt.ts) |
| Trace UI | `skills` prompt block, already conditional + colour-coded | [TraceBody.tsx:76-78](../client/src/app/repos/%5BrepoId%5D/pulls/%5Bnumber%5D/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx#L76-L78) |
| Adapters | `Tokenizer` (js-tiktoken `cl100k_base`, heuristic fallback) | [adapters/tokenizer/index.ts](../server/src/adapters/tokenizer/index.ts) |
| UI kit | `Donut`, `MetricCard`, `BarRow`, `Toggle`, `Badge`, `Markdown`, `Drawer`, `Tabs` | [vendor/ui](../client/src/vendor/ui/) |
| Copy | full `skills` namespace; `agents.editor.tabs.skills`, `agents.skills.*` | [client/messages/en/skills.json](../client/messages/en/skills.json), [agents.json](../client/messages/en/agents.json) |
| Nav | `/skills` → `"skills"` nav key, label in `shell.json` | [app-shell/helpers.ts:33](../client/src/components/app-shell/helpers.ts#L33) |

### The load-bearing gap

**`run-executor.ts` never passes `skills` to `reviewPullRequest`.** Look at the
call site in [run-executor.ts](../server/src/modules/reviews/run-executor.ts) —
`systemPrompt`, `model`, `diff`, `llm`, `strategy`, `callers`, `repoMap`,
`prDescription`, `task` are threaded; `skills` is not. So `PromptAssembly.skills`
is `null` on every run that has ever executed, and the trace's skills block has
never rendered. Linking a skill to an agent today changes nothing about the
review. **That one wire is the feature.** Everything else is CRUD, UI, and
measurement around it.

Missing beyond that: a `skills` server module, import, the `/skills` page, the
agent-editor Skills tab, and any record of which skills a run actually used.

## Scope

**In:**

1. `skills` server module — CRUD over the existing table, workspace-scoped.
2. Skills page (`/skills`) — master-detail: skill rail + five-tab Skill Editor.
3. Skill Editor tabs — **Config**, **Preview**, **Evals** (empty state),
   **Stats**, **Versions**.
4. Agent editor **Skills** tab — attach, toggle, reorder.
5. Prompt wiring — enabled skills, in link order, into the review prompt, the
   trace, and the run log.
6. `run_skills` — a per-run record of which skills were injected and what each
   one cost in tokens. This is what makes the Stats tab real rather than decorative.
7. Import — markdown file or `.zip`, preview-then-confirm, no execution.
8. One new agent: **Test Quality Reviewer**, with 4 linked skills.
9. Seed + e2e flow so the control experiment reproduces from a clean DB.

**Out of scope:**

- **Eval execution.** The Evals tab renders with an empty state and the
  `Run on evals` button is disabled — see *Evals tab* below. The eval pipeline
  is L06 per the [README roadmap](../README.md).
- Import from URL and the community catalog. The copy for both already sits in
  `skills.json` (`drawer.tabs.url`, the whole `community.*` block) — pre-written
  for a later lesson. The Add menu ships **Create** + **Import from file** only.
- Skill evidence extraction (`skills.evidence_files` stays `null`; that column
  belongs to the Conventions extractor).
- Per-repo or per-PR skill scoping. Skills are workspace-global.
- Dynamic skill selection. Every enabled skill is injected on every run; the
  description is not yet a routing signal (see *Pull frequency*).
- Any skill that executes anything. Explicitly and permanently out — see
  *Trust model*.

## Approach

### Decisions taken up front

| Decision | Choice | Consequence |
|---|---|---|
| Per-agent on/off | New `agent_skills.enabled` column | Unchecking preserves `order` — re-enabling does not send the skill to the bottom. |
| Body resolution | Float to latest | A run assembles the **current** body. Saving a changed body bumps `skills.version` and archives the previous body into `skill_versions`. `agent_versions.configJson.skills` keeps storing ids only. |
| Stats data | New `run_skills` table, run-level attribution | Exact `USED BY`, `PULL FREQUENCY` and token cost; findings metrics are run-level and **labelled as such**. |
| Pull frequency | Historical: % of runs by linked agents in which the skill was actually injected | Meaningful because skills get toggled over time; no change to prompt behaviour. |
| Preview tab | The exact block as injected, plus its token count | Answers "what does this skill actually add" before a run is ever executed. |
| Evals | Tab + button rendered, both inert | Design fidelity at zero scope; `eval_cases.ownerKind='skill'` already awaits L06. |
| Seed | 8 skills + 1 agent seeded; 1 skill imported live | A clean `./scripts/dev.sh` reproduces the control experiment; the import path is still exercised on camera. |

### Two gates, one rule

A skill body reaches the prompt **iff both** flags are true:

```
skills.enabled          -- workspace gate: vetted and active
agent_skills.enabled    -- per-agent gate: this reviewer uses it
```

`skills.enabled` is the vetting gate and the toggle on each rail card. An
imported skill lands `enabled = false` and shows the `listItem.needsVetting`
badge (copy already written) until the user reads it and flips the switch.
`agent_skills.enabled` is the per-agent checkbox in the agent editor. Two flags,
no third `vetted` column.

### Trust model — the part to say out loud on video

The existing copy in `skills.json` is wrong and must be fixed:

> `file.bodyHint`: "Pasted content is wrapped as untrusted data — never executed
> as instructions."

It is not, and it must not be. `assemblePrompt` puts skills into
`## Skills / rules` **outside** the `<untrusted>` delimiters, deliberately — and
the `INJECTION_GUARD` it appends to every system prompt says to ignore
instructions found inside `<untrusted>` blocks. So wrapping a skill as untrusted
would instruct the model to ignore it. **A skill is instructions by definition;
you cannot both wrap it as data and expect it to steer the review.**

Which means the honest framing, and the one the video should use:

> Importing someone else's skill puts someone else's instructions into your
> agent's prompt, at the same trust level as your own system prompt. There is no
> sandbox for text. The only protection is that you read it first.

The product enforces exactly that, and nothing more:

- import **previews** the body and saves only on explicit confirm;
- imported skills land **disabled**, carrying a `needs vetting` badge;
- the archive path reads **one** `SKILL.md` and ignores every other entry —
  scripts, hooks, binaries are never extracted, never parsed, never run;
- there is no field anywhere on a skill that names a command, a tool, a URL, or
  a file to load.

Copy fix: `file.bodyHint` → "This becomes part of the agent's prompt as
instructions, at the same trust level as your system prompt. Read it before you
enable it."

---

## Server

New module `server/src/modules/skills/`, mirroring the agents module's shape
(routes → service → repository; the container owns construction). Per
[onion-architecture](../.claude/skills/onion-architecture/SKILL.md): routes are
adapters, the service takes the repository by constructor injection, the
repository speaks `Skill`/rows and never leaks Drizzle upward.

```
server/src/modules/skills/
  routes.ts       Fastify plugin, Zod schemas, workspace-scoped via getContext
  service.ts      SkillsService — CRUD, version bump, import parse, stats
  repository.ts   SkillsRepository — skills, skill_versions, run_skills, stats queries
  helpers.ts      toSkillDto, parseSkillMarkdown, extractSkillFromZip, renderSkillBlock
  constants.ts    MAX_BODY_BYTES, MAX_UPLOAD_BYTES, ARCHIVE_ENTRY_LIMIT, STATS_WINDOW_DAYS
```

Register in [modules/index.ts](../server/src/modules/index.ts) (one import, one
entry). Add a lazy `get skillsRepo()` to
[platform/container.ts](../server/src/platform/container.ts) alongside
`_agentsRepo` / `_reviewRepo`.

### Migration 0011 — the whole schema change

Both changes ship as one migration; neither has ever been released.

```sql
ALTER TABLE "agent_skills"
  ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;

CREATE UNIQUE INDEX "skills_ws_name_uq" ON "skills" ("workspace_id", "name");

CREATE TABLE "run_skills" (
  "run_id"   uuid NOT NULL REFERENCES "agent_runs"("id") ON DELETE CASCADE,
  "skill_id" uuid NOT NULL REFERENCES "skills"("id")     ON DELETE CASCADE,
  "order"    integer NOT NULL,
  "tokens"   integer NOT NULL,
  CONSTRAINT "run_skills_pk" PRIMARY KEY ("run_id", "skill_id")
);
CREATE INDEX "run_skills_skill_idx" ON "run_skills" ("skill_id");
```

Existing links stay enabled, so nothing already attached changes behaviour.
Generate with `pnpm db:generate`, apply with `pnpm db:migrate` — migrations do
**not** run on boot.

**On the unique index.** The design renders skill names as lowercase mono
(`pr-quality-rubric`) and the body editor labels the file
`pr-quality-rubric.md`. That is a slug, not free text. Validate
`^[a-z0-9][a-z0-9-]*$`, max 64 chars, unique per workspace — which also gives
import something stable to collide against ("a skill named `lethal-trifecta`
already exists — replace, or import as a copy?").

**On `run_skills`.** One row per skill actually injected into one run's prompt,
written by the run executor at assembly time. `tokens` is the real
`container.tokenizer.count()` of that rendered block, not an estimate. This
table is the only new source of truth in the feature, and it is what turns four
decorative stat tiles into measured ones.

### Routes

```
GET    /skills                       list (workspace-scoped, + rail stats)
GET    /skills/:id                   one skill
POST   /skills                       create                → 201
PUT    /skills/:id                   update (body change → version bump)
DELETE /skills/:id                   delete (agent_skills / run_skills cascade)
GET    /skills/:id/versions          history, newest first
GET    /skills/:id/versions/:version one snapshot (Versions tab body view)
GET    /skills/:id/preview           rendered prompt block + token count
GET    /skills/:id/stats             Stats tab payload
POST   /skills/tokens                { body } → { tokens }   (live editor counter)
POST   /skills/import                { filename, content_b64 } → preview, NOT saved
```

Plus one addition on the agent side so the Skills tab can toggle without
unlinking:

```
PUT    /agents/:id/skills/:skillId   { enabled?, order? }
```

`POST /agents/:id/skills` keeps its current set/reorder + link-one behaviour.

**`POST /skills/import` is parse-only.** It returns a `SkillImportPreview`; the
client then calls `POST /skills` with the confirmed fields. Nothing touches the
DB until the user clicks Import in the preview. That is the whole
"save only after confirmation" requirement, expressed as two endpoints.

It takes a **JSON body** (`{ filename, content_b64 }`), not multipart. The
repo's routes are schema-first — "every route declares zod `params`/`body`"
([server/CLAUDE.md](../server/CLAUDE.md)) — and a multipart stream cannot be
zod-validated the same way, so `@fastify/multipart` would carve an exception
into the one convention every other route follows. Upload sizes here are
capped at 1 MB of markdown; base64 costs ~33% on a payload that small and buys
back a fully typed route. Reading the archive needs one new dependency —
`fflate` (pure JS, no natives, sync `unzipSync`), consistent with the tokenizer
adapter's "pure-JS, no natives" choice.

**`POST /skills/tokens`** backs the `166 tokens` counter in the body editor.
It must be the *same* tokenizer the run executor uses to fill `run_skills.tokens`,
or the editor and the Stats tab will disagree about the same skill. Note that
[adapters/tokenizer/index.ts](../server/src/adapters/tokenizer/index.ts) is
currently documented as "ONLY under modules/repo-intel" — this feature widens
that scope; update the comment when you do.

### Version bump on save

`SkillsService.update` writes the *previous* body into `skill_versions` at the
current version, then increments `skills.version`. Only when `body` actually
changed — renaming a skill or editing its description does not mint a version.
This mirrors `AgentsRepository.recordVersion`, backs the `v5` chip in the editor
header, and keeps `preview.bodyHint` ("Saving a changed body creates a new
immutable version") honest.

### Import parsing

`helpers.ts`, pure functions, unit-tested without a DB:

- `.md` → parse optional YAML frontmatter (`name`, `description`) using the
  Claude-Code `SKILL.md` convention this repo already follows in
  [.claude/skills/](../.claude/skills/) and [skills-lock.json](../skills-lock.json).
  No frontmatter → `name` from the first `#` heading (slugified),
  `description` from the first paragraph. Body = everything after frontmatter.
- `.zip` → enumerate entries, take the **first** matching
  `SKILL.md` | `*/SKILL.md` | `skills/*/SKILL.md`, parse it as above, **discard
  every other entry**. More than one match → return all candidate paths and let
  the user pick; still only one is read.
- Refuse: entries above `ARCHIVE_ENTRY_LIMIT` (zip-bomb guard), absolute or
  `..` paths, upload above `MAX_UPLOAD_BYTES` (1 MB), body above
  `MAX_BODY_BYTES` (64 KB).
- `source` = `imported_url` for both file paths. `SkillSource` has no
  `imported_file` member; adding one changes a DB enum and both vendor copies —
  not worth a migration for a label, and the UI already renders it as
  "Imported" via `listItem.source.imported_url`.
- `enabled: false`, always.

`type` is not inferred. The import preview defaults it to `custom` and the user
picks — guessing a security classification from a stranger's markdown is exactly
the wrong instinct.

### Stats queries

All in `SkillsRepository`. `GET /skills/:id/stats` returns one payload; the rail
list gets a cheaper subset (`agents`, `pullPct`, `acceptPct`) in one grouped
query so the list is not N+1.

```
USED BY        count(distinct agent_id) from agent_skills
               where skill_id = ? and enabled = true

PULL FREQUENCY denominator = agent_runs (status='done') of agents currently
                             linked to this skill
               numerator   = of those, runs with a run_skills row for it
               -> 71%   label: "of runs by agents linked to this skill"

FINDINGS (30D) findings joined via reviews.run_id -> run_skills.run_id,
               agent_runs.ran_at >= now() - 30 days

ACCEPT RATE    accepted / (accepted + dismissed) over that same finding set
               -- findings nobody has judged are EXCLUDED from both sides,
               -- otherwise a fresh workspace reads a misleading 0%

BY CATEGORY    the same finding set, grouped by findings.category, as COUNTS

TOKENS / RUN   avg(run_skills.tokens) -- shown in the Preview tab header
```

**Findings attribution is run-level, and the UI says so.** A run that injected
four skills attributes all of its findings to each of the four. That over-counts
and we are not going to pretend otherwise: the panel is titled
**"Findings in runs using this skill"**, not "findings caused by this skill".
Precise per-finding attribution needs the model to name the skill in each
finding — a `Review` schema change with real compliance risk — and belongs to a
later lesson.

**The mockup's donut is wrong.** `FINDINGS BY CATEGORY` shows `security $52.00`,
`bug $20.00`, `perf $16.00`, `style $12.00`. Those are finding *counts* rendered
through a currency formatter. Render them as counts (`security 52`). Do not add
a `formatCost` call here — `specs/01` established that formatter for money, and
money is not what this measures.

### Contracts

Add to `contracts/knowledge.ts`, then **hand-port to
`client/src/vendor/shared/`**. The two copies are independent and already
drifted; divergence type-checks clean, so this is the step that silently breaks.

```ts
export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
  enabled: z.boolean().default(true),          // NEW
});

export const SkillImportPreview = z.object({   // NEW
  name: z.string(),
  description: z.string(),
  body: z.string(),
  source_path: z.string().nullish(),           // which entry in the archive
  ignored_entries: z.number().int(),           // "N other files were not read"
  candidates: z.array(z.string()).nullish(),   // >1 SKILL.md found
});

export const SkillPreview = z.object({         // NEW — Preview tab
  block: z.string(),                           // exactly what gets injected
  tokens: z.number().int(),
});

export const SkillStats = z.object({           // NEW — Stats tab
  used_by: z.number().int(),
  agents: z.array(z.object({ id: z.string(), name: z.string() })),
  pull_pct: z.number().nullable(),             // null = no runs yet, renders "—"
  accept_pct: z.number().nullable(),           // null = nothing judged yet
  findings_30d: z.number().int(),
  by_category: z.array(z.object({ category: z.string(), count: z.number().int() })),
  avg_tokens: z.number().int().nullable(),
});
```

`Skill` itself needs no change.

### Prompt wiring — the one change that matters

In `runOneAgent`, before the `reviewPullRequest` call:

```ts
// Resolve the agent's enabled skills, in link order, into prompt blocks.
// Both gates must pass: active in the workspace AND enabled on this agent.
const linked = await runLog.step(
  'Loading skills',
  () => this.agents.enabledSkills(agent.id),
  { kind: 'tool' },
);
const blocks = linked.map(renderSkillBlock);
if (linked.length > 0) {
  runLog.info(`Loaded ${linked.length} skill(s): ${linked.map((s) => s.name).join(', ')}`);
}
```

then `...(blocks.length > 0 ? { skills: blocks } : {})` on the
`reviewPullRequest` input. Omit-when-empty, matching how `callers` / `repoMap` /
`prDescription` are already threaded — a skill-less agent's prompt stays
byte-identical to today's.

Immediately after, record what was injected:

```ts
// One row per injected skill: the Stats tab's only source of truth. Tokenized
// with the SAME counter the editor uses, so the two never disagree.
await this.repo.recordRunSkills(
  runId,
  linked.map((s, i) => ({
    skillId: s.id,
    order: i,
    tokens: this.container.tokenizer.count(blocks[i]!),
  })),
);
```

Best-effort: a failure here must not fail the review. Wrap it the way the other
observability writes are wrapped.

`renderSkillBlock(skill)` formats one block. Plain concatenation is not enough —
with `skills.join('\n\n')` four skills read as one undifferentiated wall:

```
### Skill: test-coverage-nudge (custom)
Every new branch introduced by the diff must have a test that exercises it…
```

The name in the heading is what makes the log assertion legible, what the model
cites back, and what the Preview tab shows verbatim. **`renderSkillBlock` lives
in `modules/skills/helpers.ts` and is imported by both the run executor and the
preview route** — if the two ever render differently, the Preview tab is lying.

`AgentsRepository` gains one method next to `linkedSkills`:

```ts
/** Skills that will actually reach the prompt: linked AND enabled on both
 *  gates, in `order` ascending. */
async enabledSkills(agentId: string): Promise<{ id; name; type; body }[]>
```

Same `innerJoin` as `linkedSkills` plus
`and(eq(agentSkills.enabled, true), eq(skills.enabled, true))`.

### The description is the interface

A skill's `description` is what tells a reader when the skill applies, so it is
written imperatively — "Flag any test that asserts only the happy path", not
"This skill is about test coverage". The editor states this under the field.

For v1 the description is **not** injected — only bodies are, and every enabled
skill is injected on every run. It is written imperatively from day one because
the moment skill *selection* becomes dynamic, the description is the routing
signal. That is also why `PULL FREQUENCY` is defined historically (below) rather
than as a live selection rate.

---

## Client

Two surfaces, both following
[frontend-ui-architecture](../.claude/skills/frontend-ui-architecture/SKILL.md):
thin route files, colocated `_components/`, `constants.ts` / `helpers.ts` /
`styles.ts` per folder, `"use client"` at the view, not the route.

### `/skills` — master-detail

The updated design is **not** a card grid with a preview aside. It is the same
two-pane shape as `/agents/[id]`: a scrolling rail of skill cards on the left, a
full editor on the right, with the selected skill in the URL.

```
client/src/app/skills/
  page.tsx                          thin: metadata + <SkillsView/>
  [id]/page.tsx                     thin: metadata + <SkillsView selectedId/>
  _components/SkillsView/           two-pane layout, rail + editor
    _components/SkillRailCard/      one rail card
    _components/AddSkillMenu/       Dropdown: Create / Import from file
    _components/ImportSkillDrawer/  file picker → preview → confirm
    _components/SkillEditor/        tabs bar + panel routing (?tab=)
      _components/ConfigTab/
      _components/PreviewTab/
      _components/EvalsTab/
      _components/StatsTab/
      _components/VersionsTab/
      _components/MarkdownEditor/   textarea + gutter + highlight overlay
client/src/lib/hooks/skills.ts      queries + mutations
```

Selection lives in the route (`/skills/:id`), tab state in `?tab=` — exactly the
convention [AgentEditor](../client/src/app/agents/%5Bid%5D/_components/AgentEditor/AgentEditor.tsx)
already uses ("Tab state still lives in `?tab=` for forward-compatibility").

**Rail card** — icon, mono name, `Toggle` (workspace `enabled`), truncated
description, then two badges (`type`, `source`) and a stats footer:

```
3 agents  ·  71% pull  ·  74% accept
```

`AgentCard` is the template; the footer is the new part and is fed by the list
endpoint's grouped stats, not by a request per card. When a skill has no runs
yet, the footer collapses to `3 agents` rather than printing `0% pull` — an
unused skill and a rejected skill must not look the same.

**Editor header** — icon, mono name, `type` badge, `v5` version chip,
`▷ Run on evals` (disabled), and the tab bar
`Config · Preview · Evals · Stats · Versions`.

### Config tab

Name (slug-validated, inline error on collision), Description with the
"this is the skill's interface" hint, Type select, and the body editor.

`Enabled` toggle sits top-right of the panel, mirroring
[ConfigTab](../client/src/app/agents/%5Bid%5D/_components/AgentEditor/_components/ConfigTab/) —
and it is the same `skills.enabled` gate as the rail toggle, so flipping one
must update the other (shared React Query cache entry, not two states).

**The body editor is the one non-trivial UI build in this feature.** The design
shows a filename chip (`pr-quality-rubric.md`, derived from the slug), an
`unsaved` badge, a live `166 tokens` counter, line numbers, and markdown syntax
colouring. There is **no editor dependency in the client today** — no CodeMirror,
no Monaco ([client/package.json](../client/package.json)).

Build it as a `<textarea>` layered over a syntax-highlighted `<pre>` with a
shared line-number gutter — the standard overlay technique, ~120 lines, no new
dependency, and markdown needs only four token rules (ATX heading, bold, list
bullet, fenced code). If the overlay's scroll sync or caret alignment turns
fiddly, the fallback is a plain textarea plus gutter with no colouring; adding
CodeMirror 6 for one field is not worth ~200 KB in a local-first studio.

The token counter calls `POST /skills/tokens`, debounced ~400 ms, and shows the
last settled value while in flight. It is a real tokenizer count, not
`chars / 4`, because the same number reappears in Preview, in `run_skills`, and
in the Stats tab.

### Preview tab

Shows **exactly what the run executor will inject** — the output of the shared
`renderSkillBlock`, monospaced, with the token count in the panel header:

```
PREVIEW                                    166 tokens

### Skill: pr-quality-rubric (rubric)
# PR Quality Rubric

Evaluate the pull request against the following dimensions…
```

Fed by `GET /skills/:id/preview`. This is the requirement "see the skills block
and the tokens it adds", answered *before* a review is ever run — and it is why
`renderSkillBlock` must be one function shared by both call sites.

### Evals tab

Renders the panel with an `EmptyState`: skill eval cases arrive in L06. The
`Run on evals` button in the header is `disabled` with a tooltip saying the same.
`eval_cases.ownerKind` already accepts `'skill'`, so nothing about this tab needs
re-designing when L06 lands — only filling in.

Do not wire `eval_cases` CRUD now. A half-built eval surface is worse than an
honest placeholder.

### Stats tab

Four `MetricCard` tiles across the top, then two panels:

| Tile | Source | When empty |
|---|---|---|
| `USED BY` | `agent_skills` count | `0 agents` |
| `PULL FREQUENCY` | `run_skills` ÷ linked agents' runs | `—` |
| `ACCEPT RATE` | accepted ÷ (accepted + dismissed) | `—` |
| `FINDINGS (30D)` | run-level attribution, 30-day window | `0` |

`ACCEPT RATE` carries the small ring gauge from the mockup — that is
`CircularScore`, already in `primitives/`.

**AGENTS USING THIS SKILL** — rows from `stats.agents`, each linking to
`/agents/:id?tab=skills`. The design's `Open` affordance goes straight to the
tab where the link can be toggled, which is the action a user actually wants
from that row.

**FINDINGS IN RUNS USING THIS SKILL** (the design's "findings by category") —
a `Donut` over `by_category`, rendered as counts. Note the retitle: it states
the attribution honestly, and it is the one place a viewer might otherwise
believe the number is causal.

Every tile renders `—` on `null` rather than `0`. `specs/01` established that
rule for cost and it holds for the same reason: *unmeasured* and *measured
zero* are different facts, and a fresh workspace must not look like a failing one.

### Versions tab

A list from `GET /skills/:id/versions`, newest first: version number, timestamp,
body size delta. Selecting one shows that body read-only beside the current one.

`POST /skills/:id/restore` (`{ version }` in the body; added as a follow-up
to the initial v1 scope, which shipped without it) does not rewind history —
it goes through the same archive-then-bump path as a normal body edit, just
sourced from an old version instead of the editor, so "restore v1" while at
v2 produces v3. The Versions tab exposes this as a "Restore" button next to
the selected version's pane.

### Agent editor Skills tab

Add to [AgentEditor/constants.ts](../client/src/app/agents/%5Bid%5D/_components/AgentEditor/constants.ts):

```ts
{ key: "skills", labelKey: "editor.tabs.skills", icon: "Sparkles" },
```

and a `_components/SkillsTab/` beside `ConfigTab/`. It lists **every** workspace
skill (not only linked ones), matching the mockup's "3 of 6 enabled" over six
draggable rows. Checkbox → `PUT /agents/:id/skills/:skillId { enabled }`.
Drag → `POST /agents/:id/skills { skill_ids: [...] }` with the full ordered set.
A row never linked before is inserted on first check.

Copy exists (`agents.skills.title`, `enabledCount`, `filterPlaceholder`,
`orderHint`) — but `orderHint` currently reads "Toggle to attach" where the
mockup says "Drag to reorder". Update it to cover both:
`"Order matters — earlier skills appear earlier in the assembled prompt. Drag to reorder."`

### Trace drawer

`PromptBlock` gains an estimated size in its header (`~412 tok`) for **all seven**
blocks, computed client-side in `RunTraceDrawer/helpers.ts`. The tilde is
deliberate: this one is `Math.ceil(len/4)`, unlike the skill editor's counter,
because adding a per-block server round-trip to the trace drawer is not worth it.
The authoritative per-skill number lives in `run_skills` and surfaces in the
Stats tab; the authoritative run-level number is the `tokens_in` delta the run
timeline already shows.

### Files touched

**server** — `db/schema/agents.ts` (+1 column) · `db/schema/runs.ts` (+`run_skills`)
· `db/migrations/0011_*.sql` (new) · `modules/skills/*` (new, 5 files) ·
`modules/index.ts` (+2 lines) · `platform/container.ts` (+1 getter) ·
`adapters/tokenizer/index.ts` (scope comment) ·
`modules/agents/{repository,service,routes}.ts` (enabled flag + `enabledSkills`) ·
`modules/reviews/{run-executor.ts,repository/}` (**the wire** + `recordRunSkills`)
· `vendor/shared/contracts/knowledge.ts` · `db/seed.ts`

**client** — `app/skills/*` (new, ~12 files) · `lib/hooks/skills.ts` (new) ·
`app/agents/[id]/_components/AgentEditor/{constants.ts,AgentEditor.tsx}` ·
`.../AgentEditor/_components/SkillsTab/*` (new) ·
`.../RunTraceDrawer/{helpers.ts,_components/PromptBlock/PromptBlock.tsx}` ·
`messages/en/skills.json` (copy fix + new tab/stats keys) ·
`messages/en/agents.json` (`orderHint`) · `vendor/shared/contracts/knowledge.ts`
(**hand-port**)

**reviewer-core** — none. `PromptParts.skills` already exists and does the
right thing.

### Build order

Each step leaves the tree green.

1. Migration `0011` + contracts in both vendor copies.
2. `skills` module: repository → service → routes (CRUD + versions only).
3. **The wire** — `enabledSkills` + `renderSkillBlock` + `run-executor.ts` +
   `recordRunSkills`. Seed two skills by hand, run a review, confirm the block
   appears in the trace and `run_skills` has two rows. *The feature is real at
   the end of this step.*
4. `/skills` shell: rail + Config tab + `MarkdownEditor` + token endpoint.
5. Preview and Versions tabs (both read straight off step 2/3 work).
6. Agent editor Skills tab.
7. Stats queries + Stats tab. Evals tab placeholder.
8. Import: parse helpers (unit-tested first) → route → drawer.
9. Seed catalogue + Test Quality Reviewer.
10. e2e flow + trace token estimates.

Steps 7 and 8 are the two that can be cut under time pressure without breaking
anything before them — Stats degrades to `—` everywhere, and skills can still be
authored by hand.

---

## Seed and the new agent

[server/src/db/seed.ts](../server/src/db/seed.ts) currently leaves `skills`
empty. Add a catalogue of 8, and one agent.

**Catalogue — mockup parity (5).** These are the skills the design screenshots
show, so seeding them makes the rail and the Security Reviewer's Skills tab
reproduce the mockups (6 rows, 3 checked):

| Skill | Type | Source | On Security Reviewer |
|---|---|---|---|
| `pr-quality-rubric` | rubric | manual | ✅ |
| `no-then-chains` | convention | extracted | ☐ |
| `secret-leakage-gate` | security | community | ✅ |
| `lethal-trifecta` | security | community | ✅ |
| `phantom-api-gate` | security | imported (disabled) | ☐ |

**Catalogue — Test Quality Reviewer's own (3 seeded + 1 imported):**

| Skill | Type | Origin |
|---|---|---|
| `test-coverage-nudge` | custom | seeded — flags branches the diff adds but no test exercises |
| `corner-case-checklist` | custom | seeded — boundaries, empty/null, off-by-one, error paths |
| `mock-discipline` | convention | seeded — over-mocking, mocked-under-test, time/order flakiness |
| `api-contract-guard` | security | **imported live** — route signature / status / field-shape breaking changes |

**New agent — Test Quality Reviewer**, seeded with the first three linked and
enabled. The fourth is attached on camera after the import, giving the tab a
`4 of 9 enabled` state.

> **Assumption, flag it if wrong.** The requirements list an *API Contract*
> control experiment, and earlier framing implied a second agent. Per your
> clarification this is **one** agent with four skills, so `api-contract-guard`
> hangs off Test Quality Reviewer. That is a slightly odd fit by name, but it
> makes the point sharper than a second agent would: the *same* agent, *same*
> model, *same* system prompt catches a breaking route change only because a
> skill was attached. If you would rather the API-contract experiment run
> elsewhere, the alternative is to drop it and run both control PRs through the
> test-quality skills — one line of this spec changes, nothing structural.

The agent's system prompt stays deliberately thin, so the skills are visibly
doing the work:

```
You review the *tests* in a pull request, not the production code.
Return at most 5 findings, ranked by severity. Cite exact file:line.
```

**Seeding stats.** A fresh DB has no runs, so every rail card reads `N agents`
with no percentages and every Stats tile reads `—`. That is correct and should
be shown before the control experiment, so the numbers visibly *arrive* when the
runs happen. Do not fabricate run history in the seed to make the mockup's `71%`
appear — the tiles being empty on a clean install is a feature of the demo, not
a defect.

---

## Verification

### Automated

- `cd server && pnpm test`
  - `skills-import.test.ts` (new, pure): frontmatter parsed; heading fallback
    when absent; zip yields the `SKILL.md` body and reports `ignored_entries`;
    a zip containing `install.sh` never reads it; `..`/absolute paths rejected;
    oversize rejected.
  - `skills.it.test.ts` (new, testcontainers): CRUD; slug validation and the
    workspace-unique collision; body edit bumps `version` 1→2 and writes
    `skill_versions`; a rename does not; delete cascades `agent_skills` **and**
    `run_skills`.
  - `prompt-skills.test.ts` (new): given two enabled and one disabled linked
    skill, the assembled prompt contains both enabled bodies **in link order**
    and not the disabled one; `PromptAssembly.skills` is non-null; an agent with
    zero enabled skills produces `skills: null` and a prompt byte-identical to
    the pre-feature baseline.
  - `skills-preview.test.ts` (new): `GET /skills/:id/preview` returns a block
    **character-for-character identical** to what the run executor injects for
    the same skill. This is the test that keeps the Preview tab honest.
  - `skills-stats.it.test.ts` (new): with two runs recorded, one of which
    injected the skill, `pull_pct` is 50; a skill with no runs returns `null`,
    not `0`; accept rate ignores unjudged findings.
  - `routes-smoke.test.ts` — extended with the new routes.
- `cd client && pnpm test` — `SkillRailCard` (footer collapses without runs),
  `MarkdownEditor` (gutter line count, unsaved badge), `SkillsTab` (checkbox
  count, reorder payload), `StatsTab` (`—` on null, counts not currency in the
  donut legend), `ImportSkillDrawer` (preview shown, nothing POSTed until
  confirm), `PromptBlock` token estimate.
- `pnpm typecheck` in both packages. Then **diff the two `vendor/shared` copies
  by hand** — nothing else catches drift.
- `./scripts/e2e.sh` — new flow `08-skills.flow.json`: `/skills` renders the
  seeded catalogue; selecting `pr-quality-rubric` reaches `/skills/:id`; the
  Test Quality Reviewer's Skills tab shows `4 of 9`.

### The control experiment

Two PRs, one agent, run twice each. Uncheck all four skills → run → recheck →
run. Same model, same system prompt, same diff; the only variable is the skills
block.

| PR | Without skills | With skills |
|---|---|---|
| Test with only a happy-path assertion on a function that has an error branch | passes, no finding | flags the uncovered branch **and** a boundary case |
| Route handler whose response field is renamed / made optional | passes, no finding | flags the breaking contract change |

Then, in order:

1. Run trace → **Prompt assembly** → the `skills` block is present, lists four
   `### Skill:` headings, carries a `~N tok` estimate; the Live Log shows
   `Loaded 4 skill(s): test-coverage-nudge, corner-case-checklist, …`.
2. Run timeline → `tokens_in` is higher on the with-skills run. That delta is
   the honest cost of the feature.
3. `/skills/test-coverage-nudge?tab=stats` → `PULL FREQUENCY` is now **50%**
   (two runs by a linked agent, one of them injected it) and `USED BY` reads
   `1 agent`. The metric moving from `—` to a number *because you toggled a
   checkbox* is the clearest possible demonstration of what `run_skills` records.

Keep both runs side by side in the timeline — the delta *is* the demo.

### Manual checklist

1. `cd server && pnpm db:migrate` — **not applied on boot**.
2. `./scripts/dev.sh` → `/skills` shows the seeded rail; every card reads
   `N agents` with no percentages; every Stats tile reads `—`.
3. Select a skill → Config. Edit the body; the `unsaved` badge appears, the
   token counter moves, the `v5` chip does not. Save → version chip increments,
   Versions tab gains a row.
4. Preview tab shows the block with `### Skill:` header and the same token count
   as the editor.
5. Create a skill in the UI. Try to name it `pr-quality-rubric` → inline
   collision error. Try `PR Rubric` → slug validation error.
6. Add ▾ → Import from file → drop a `.zip` containing `SKILL.md` **and** an
   `install.sh`. The preview shows only the markdown and says N other entries
   were not read. Cancel → nothing saved. Re-import → confirm → the skill lands
   **disabled** with a `needs vetting` badge.
7. Enable it, attach it to Test Quality Reviewer as the 4th skill.
8. Run a review; the trace shows all four. Uncheck one; run again; that skill's
   heading is gone from the block and the other three keep their order.
9. Disable a skill at the workspace level; it disappears from every agent's
   prompt while staying checked on the agent — both gates work independently.
10. Evals tab renders its empty state; `Run on evals` is disabled with a tooltip.

### Pre-existing acceptance items (already true, re-verify on video)

- `pr-self-review` exists as a repo skill with auto-invoke off
  ([.claude/skills/pr-self-review/](../.claude/skills/pr-self-review/)) —
  invoke it manually and show it routing both frontend and backend skills to the
  files each governs. This is the Claude Code skill layer, not the product
  feature; the two are worth contrasting explicitly on camera, since this spec
  builds the *product's* version of the same idea.

## Before you finish

Append to [server/LEARNINGS.md](../server/LEARNINGS.md) and
[client/LEARNINGS.md](../client/LEARNINGS.md) — the two-gate rule, the
"skills are trusted instructions, not untrusted data" reasoning, and the
run-level attribution caveat are exactly the things a future session will
otherwise get backwards.
