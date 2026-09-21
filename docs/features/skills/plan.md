# Skills — implementation plan

Status: approved 2026-09-21. Lesson `lesson_02`.

Reusable skills shared across agents: stored in the DB, edited in the UI, imported
from a file / archive / URL, linked to agents in an order that determines the order
of the blocks in the assembled prompt. A skill is **configuration text only** — it
never executes anything.

## What already existed before this work

| Layer | State |
|---|---|
| DB | `skills`, `skill_versions`, `agent_skills` already created in `0000_init.sql` |
| Contracts | `Skill`, `SkillType`, `SkillSource`, `AgentSkillLink` in `contracts/knowledge.ts` (both vendored copies) |
| Agent ↔ skill | `GET/POST /agents/:id/skills`, `linkedSkills()`, `setSkills()`, `skillIdsForAgent()` |
| Prompt | `assemblePrompt` already accepts `skills: string[]` → `## Skills / rules` + `trace.prompt_assembly.skills` |
| Trace UI | `RunTraceDrawer` already renders the skills block when non-null |
| i18n | `messages/en/skills.json` + `agents.skills.*` + `editor.tabs.skills` already written |
| Routing | `activeKeyFor` already maps `/skills` |

## What was missing

1. No `server/src/modules/skills/` — no CRUD at all.
2. `run-executor.ts` never passed `skills` to `reviewPullRequest` → skills never reached
   the prompt. **Critical path**: without this the control experiment is a no-op.
3. Client: no `/skills` route, no hooks, no Skills tab in the agent editor, no NAV entry.
4. No import flow.
5. No new agents / starter skills in the seed.
6. `pr-self-review` had its `PreToolUse` auto-invoke hook enabled.

## Decisions (answered by the product owner)

1. **Two new agents** — `Test Quality Reviewer` and `API Contract Reviewer`.
2. **Import = file + archive + URL** (no community catalog this lesson).
   URL import accepts markdown only; archives stay on the file path.
3. **Separate `enabled` flag on `agent_skills`** (not just link/unlink) — needs one
   new generated migration. A skill reaches the prompt when
   `skills.enabled && agent_skills.enabled`.
   Caveat: `AgentVersionConfig.skills` stays `string[]` of all linked ids — changing the
   shape would break parsing of already-written snapshots.
4. **Real drag-and-drop** reordering (native HTML5 DnD, no new dependency).
   Order is covered by a unit test on the pure `reorder()` helper plus an integration
   test on the set-skills route; the e2e flow does not drive DnD.

## Work packages

| # | Package | Content |
|---|---|---|
| W0 | server | `agent_skills.enabled` column + generated migration |
| W1 | server | `modules/skills/` — CRUD, version snapshots, import preview |
| W2 | server | **Inject linked skills into the review prompt** in `run-executor`, untrusted wrapping for non-manual sources, a Live Log line with the token count |
| W3 | server | URL import with an SSRF guard |
| W4 | client | `lib/hooks/skills.ts` |
| W5 | client | `/skills` page — card grid, side preview, editor modal, NAV entry |
| W6 | client | Import: `.md` / `.zip` (fflate, `SKILL.md` only, everything else listed as skipped) / URL → preview → confirm |
| W7 | client | Skills tab in the agent editor — per-agent `enabled`, DnD order, count badge |
| W8 | server | Seed: starter skills, 2 new agents with links, demo PRs for the control experiment |
| W9 | both | Tests (unit / `*.it.test.ts` / RTL / e2e) + disable the `PreToolUse` hook |

## Security notes

- **URL import** is a user-controlled outbound request: `http`/`https` only, DNS resolved
  and rejected on loopback / private / link-local / IPv4-mapped-IPv6 ranges,
  `redirect: "manual"`, `AbortSignal.timeout`, body size cap, content-type allowlist.
- **Archive import** reads a single `SKILL.md` entry. Every other entry — `scripts/`,
  `*.sh`, `*.js`, `bin/` — is listed in the preview as skipped and is never read,
  written to disk, or executed.
- **Imported skill bodies** are wrapped in `<untrusted source="skill:…">` when
  `source !== 'manual'`: someone else's skill is someone else's instructions inside your
  agent's prompt.
- Imported skills land `enabled: false` — they must be vetted before they can be enabled.

## Risks

- `server/src/vendor/shared` and `client/src/vendor/shared` are **hand-maintained copies**.
  Every contract edit has to be copied across by hand.
- `SkillSource` gains `imported_file`. The DB column is plain `text` with no check
  constraint, so this is a TypeScript-only change in both copies — no migration.
