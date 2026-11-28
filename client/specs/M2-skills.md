# M2 · Skills for review agents (client)

Server side: `server/specs/M2-skills.md` (API, data, prompt placement).

## Screens
- **Sidebar:** new `SKILLS LAB` group — Skills (`g s`) above Agents.
- **`/skills`, `/skills/:id?tab=`** (master-detail like Agents):
  - Left: "Add Skill ▾" (Create new / Import file), search, `SkillCard`s — mono name,
    global enabled toggle, description, type badge, source (Manual / Imported in warn
    tint), `N agents · X% pull · Y% accept` ("—" without data).
  - Right (`SkillEditor`): header (name, type, `vN`) + tabs:
    - **Config** — name, directive description (hint: "the description is the
      skill's interface"), type, markdown body with a live token estimate, global
      Enabled, change note (shown only when the body changed), Save / Cancel / Delete.
    - **Preview** — the server-rendered `### Skill:` block as the agent receives it +
      tokens per prompt.
    - **Stats** — Used by, Pull frequency, Accept rate, Findings (30d), agents using it
      (Open → `/agents/:id?tab=skills`), findings-by-category donut (counts), and a
      "correlated, not causal" note.
    - **Versions** — history with notes, Current badge, Diff (LCS line diff modal),
      Restore (creates a new version).
  - No Evals tab / "Run on evals" (M6).
- **Import modal:** pick `.md`/`.zip` → preview (editable name/type/description,
  full rendered body, warnings, "Skipped (not read, not run)" list, trust warning)
  → Save disabled until "I reviewed this skill and trust it" is ticked.
- **Agent editor → Skills tab:** every workspace skill; linked ones first in prompt
  order; checkbox = in this agent's prompt; "off globally" marker; drag handle
  (native HTML5 DnD) + ↑/↓ buttons (keyboard); reordering disabled while filtering;
  "N of M enabled"; one batched Save. Agent cards show "N skills".
- **Run Trace:** the skills prompt block is labelled with its added tokens and
  followed by the per-skill list (position, name, version, imported tag, tokens).

## Notes
- `src/lib/hooks/skills.ts` + keys in `keys.ts`; uploads are base64 JSON (no
  `api.ts` change).
- Only `import type` from `@devdigest/shared` (see INSIGHTS); skill types for
  selects come from `SKILL_TYPES` in `src/components/skill-badges`.
- `Donut` gained `formatValue` (counts instead of `$`); `.dd-md` got heading/list
  styles.

## Acceptance
- [x] Card, import (trust gate), versions (diff/restore), stats (empty → "—"),
  agent Skills tab (order/enable/batch save/filter), trace skill list — component tests
- [x] `e2e/specs/08-skills.flow.json` — skills page → preview → versions → agent Skills tab
