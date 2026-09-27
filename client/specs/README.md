# Specs — client

One file per unit of work: what we intend to build, written **before** we build it.

- Name a spec `<feature-slug>.md`. Keep it while the work is open; when it lands,
  either delete it or fold what it taught into `../docs/`.
- Suggested sections: **Goal · Non-goals · Behaviour and acceptance criteria ·
  Affected files · Open questions**.
- A spec states intent, not implementation steps, and is never a changelog.
- Read the spec before the first edit, not after. If the code contradicts the spec,
  stop and resolve the contradiction — do not silently follow the code.
- Link a spec from `../CLAUDE.md` only while it is the active piece of work.

## Open specs

- [`findings-severity-ui.md`](findings-severity-ui.md) — severity counters on every
  findings surface, and the per-run severity filter.
- [`skills-ui.md`](skills-ui.md) — the `/skills` two-pane editor, the import drawer
  and the agent's Skills tab.
