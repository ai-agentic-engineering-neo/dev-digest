# 02-spec-skills-agent-binding.md

Part 2 of 3. Depends on [01 skills library](../01-spec-skills/01-spec-skills.md). Follow-on: [03 import and Test Quality](../03-spec-skills-import-and-test-quality/03-spec-skills-import-and-test-quality.md).

## Introduction/Overview

Skills are only useful if an agent can attach them, turn each one on or off, and put them in a stable order. The link table `agent_skills` and `GET|POST /agents/:id/skills` already exist, but the agent editor has no Skills tab, links have no `enabled` flag, and `ReviewRunExecutor` passes `skills: null` into the review engine. This spec wires attachment, dual enablement, prompt order, and the run-trace skills block.

## Goals

- On an agent’s Skills tab, a user can see workspace skills, enable/disable each for **that** agent, and drag to reorder.
- Only skills with **both** `skills.enabled` and `agent_skills.enabled` are injected, in `order`.
- A run trace’s prompt-assembly section shows a distinct skills block when any skill was injected, and omits it when none were.
- Disabled (global or per-agent) skills do not appear in that block.

## User Stories

- **As an agent author**, I want to attach the same skill to several agents so I do not paste the same markdown into each system prompt.
- **As an agent author**, I want to disable a skill on one agent without deleting it or disabling it for others.
- **As an agent author**, I want earlier rows in the list to appear earlier in the assembled prompt, so I control priority.
- **As someone debugging a review**, I want to open the run trace and see the skills block (and its token contribution) so I can tell what the model was told.

## Demoable Units of Work

### Unit 1: Per-agent enable flag and link API

**Purpose:** Match the mockup’s “3 of 6 enabled” checkboxes without unlinking a skill when it is unchecked.

**Functional Requirements:**
- The system shall add `enabled boolean not null default true` to `agent_skills` via a new Drizzle migration (no edits to old migration files).
- The system shall extend `AgentSkillLink` in `@devdigest/shared` with `enabled: boolean`.
- `GET /agents/:id/skills` shall return links joined to skill summary fields needed by the tab (id, name, type, description, global `enabled`, link `enabled`, `order`), ordered by `order`.
- `POST /agents/:id/skills` shall accept the full ordered set: `{ skills: [{ skill_id, enabled }] }` (or an equivalent single payload). The service replaces that agent’s links in that order. The existing `{ skill_ids }` / `{ skill_id }` shapes may remain as a compatibility path but the editor shall use the payload that carries `enabled`.
- A skill with `skills.enabled = false` remains listable on the tab but cannot contribute to a prompt (see Unit 3) even if the per-agent checkbox is on.
- Unchecking a row sets `agent_skills.enabled = false` and **keeps** the row and its `order`.

**Proof Artifacts:**
- Integration test: set three links, disable the middle one, `GET` returns all three with the middle `enabled: false` and stable order.
- Contract test: `AgentSkillLink` parse fails without `enabled`.

---

### Unit 2: Agent editor Skills tab

**Purpose:** Let a user bind, toggle, and reorder without leaving the agent they are editing.

**Functional Requirements:**
- The user shall see a **Skills** tab on `/agents/:id` (`?tab=skills`), beside Config. Context / Evals / Stats / CI tabs stay absent.
- The tab shall list workspace skills (from `GET /skills`) with: drag handle, per-agent checkbox, name, type badge, and the copy “Order matters — earlier skills appear earlier in the assembled prompt.”
- A header count shall read “N of M enabled” where M is rows shown and N is rows with **both** global and per-agent enabled.
- The user shall filter the list by name. Drag-and-drop writes the new order through `POST /agents/:id/skills`.
- Globally disabled skills stay visible (so they can be turned back on in the library) but their checkbox does not inject them until the library toggle is on.
- Client hooks for agent skill links live in `client/src/lib/hooks/` (extend `agents.ts` or a small `agent-skills.ts`). Pages stay thin; tab UI is colocated under `AgentEditor/_components/SkillsTab/`.

**Proof Artifacts:**
- Component test: rendering six mocked skills with three per-agent enabled shows “3 of 6 enabled”; toggling a checkbox calls POST with the updated `enabled` flag; unchecking does not remove the row from the list.
- Browser: open Security Reviewer (or any agent), bind two skills, reorder, reload — order and checkboxes persist.

---

### Unit 3: Prompt assembly + trace block

**Purpose:** Make enabled skills actually reach the model, in order, and make that visible on the run.

**Functional Requirements:**
- Before `reviewPullRequest`, `ReviewRunExecutor` shall load that agent’s linked skills, filter to `skills.enabled && agent_skills.enabled`, sort by `order`, and pass `body` strings as `skills: string[]`. Description is **not** passed.
- `assemblePrompt` already joins those strings under `## Skills / rules` and records `assembly.skills`. The executor shall persist that `assembly` on the run trace (today the success path should already store `outcome.assembly`; the failure helper that hard-codes `skills: null` must not wipe a real assembly when a run succeeded).
- When the filtered list is empty, `skills` is omitted and `assembly.skills` is null — the Prompt assembly UI already skips a null block (`TraceBody` renders `PromptBlock` only when `trace.prompt_assembly.skills != null`).
- When non-empty, the user shall see a distinct skills block in the trace Prompt assembly section. The block shall show an approximate token count for that section (one shared estimator; exact tokenizer is not required).
- Live log may mention how many skill bodies were injected (e.g. “skills: 3 enabled”) — optional, not a substitute for the trace block.
- Injected skill bodies are **instructions**, not wrapped in `<untrusted>` (current `assemblePrompt` behaviour). Trust warnings for imports are spec 03.

**Proof Artifacts:**
- Hermetic test: agent with two enabled bodies and one disabled → `assemblePrompt` / executor input contains only the two enabled, in order; `assembly.skills` contains their text and not the disabled body.
- Hermetic test: all disabled → `assembly.skills` is null.
- Existing `server/test/prompt-structured.test.ts` remains green; extend it rather than adding a second assembly implementation.
- Browser: run an agent with a skill enabled, open the run trace, see the skills block and a non-zero token figure for it; disable the skill, re-run, block absent.

## Non-Goals (Out of Scope)

1. **Creating/editing skill bodies** — spec 01.
2. **Import, seed catalog, Test Quality Reviewer, fixture PRs** — spec 03.
3. **Wrapping skill text in `<untrusted>`.** Enabled skills are prompt instructions.
4. **Evals / Stats / CI tabs** on the agent editor.
5. **Changing `INJECTION_GUARD` or the untrusted wrapping of diffs/specs.**

## Design Considerations

Use the Agent Editor → Skills mockup: checkbox rows, type badges, drag handles, “N of M enabled”, filter field. One mockup includes a Context tab on the agent; this spec does **not** add it.

## Repository Standards

- Reuse `AgentsRepository` link helpers (`linkedSkills`, `setSkills`, `linkSkill`). Extend them for `enabled`; do not add a second link table.
- Shared contract changes go through `server/src/vendor/shared` then the client mirror.
- `reviewer-core` already accepts `skills?: string[]`. Prefer passing bodies from the executor over changing `assemblePrompt` unless a bug is found.
- Client: colocate `SkillsTab` next to `ConfigTab`. Tests beside the component.

## Technical Considerations

- `POST /agents/:id/skills` today takes `skill_ids` **or** `skill_id`. A breaking change is acceptable inside this product (single studio client) if tests and the new tab are updated together; do not leave the tab on a payload that cannot store `enabled`.
- Dual-gate filter belongs in the **application** layer (agents or reviews service), not in `reviewer-core`. The engine stays ignorant of the database.
- Trace token count for the skills section is display-only. Do not change billing `tokens_in` math.
- `client/src/vendor/ui` is still do-not-touch except the NAV exception already granted in spec 01.

## Security Considerations

- Link endpoints stay workspace-scoped (agent lookup already 404s across workspaces). Reject `skill_id` values that are not in the same workspace.
- Skill bodies become model instructions. Spec 03 handles import vetting; this spec must not inject globally disabled skills.
- Do not log full skill bodies at `info` in production logs if they might contain secrets; the persisted trace already stores `assembly.skills` for the user who ran the review.

## Success Metrics

1. Enabling a skill on an agent and running a review shows that skill’s body under Prompt assembly → skills.
2. Disabling it (either toggle) and re-running hides the block (or omits that body if others remain).
3. Reordering two enabled skills changes their order in `assembly.skills`.

## Open Questions

1. Whether unlinked skills (no `agent_skills` row) appear on the tab as unchecked, or only linked rows appear. Default for implementation: **show the full workspace catalog**; first check or drag creates a link row. Record a deviation in INSIGHTS if the mockup is implemented as “linked only”.
