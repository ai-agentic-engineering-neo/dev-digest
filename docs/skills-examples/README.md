# Skill examples

Sample skills for the M2 **Import** flow (Skills → Add Skill → Import file).

| File | What it shows |
|---|---|
| `flaky-test-smells.zip` | A skill archive: `SKILL.md` + a `scripts/install.sh`. The preview shows the script under **Skipped (not read, not run)**; only `SKILL.md` becomes the skill. Link it to **Test Quality Reviewer** afterwards. |
| `flaky-test-smells/` | The unpacked source of the archive, for reading. |

Rebuild the archive after editing:

```sh
cd docs/skills-examples && rm -f flaky-test-smells.zip && zip -r flaky-test-smells.zip flaky-test-smells
```

**Trust:** an imported skill is someone else's instructions placed in your
agent's system prompt. Read the whole body in the preview before ticking
"I reviewed this skill and trust it".
