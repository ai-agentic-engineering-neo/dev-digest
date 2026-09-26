# Skills (L02)

A skill is a named, typed block of Markdown that one or more agents link, in
order, and that the review prompt renders under `## Skills / rules` (one
`### <name>` section per skill). Skills are text only: no tools, no scripts,
no network. The database (`skills`, `skill_versions`, `agent_skills`) is the
source of truth; the seeded set lives in `server/src/db/seed-skills.ts`.

- Manage them at `/skills` (create, import, edit, enable, delete) and link them
  per agent on the agent editor's Skills tab (order = prompt order).
- Feature spec: `server/specs/skills.md` (API, versioning, import parsing) and
  `client/specs/skills.md` (pages, states, e2e).
- Prompt rules every skill body should respect: `../agent-prompts/README.md`.

## `examples/` — files for the import demo

| File | Shows |
|---|---|
| `test-naming-convention.md` | a single Markdown skill with frontmatter (`name`, `description`, `type`) |
| `async-test-hygiene.zip` | an archive: `SKILL.md` is the core; `scripts/check-await.sh` and `references/notes.md` are listed as ignored and never opened |
| `async-test-hygiene/` | the unzipped source of that archive |

Import either on `/skills` → Add Skill → Import from file. The preview shows the
derived name, description, type and body, the ignored entries, and a trust
note; nothing is saved until you confirm. Imported skills start **disabled**
and carry a "needs vetting" badge: a foreign skill is foreign instructions in
your agent's prompt, so read it before enabling it.
