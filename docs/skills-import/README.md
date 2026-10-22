# Skills for the live import demo (L02)

`phantom-api-gate.zip` is imported through **Skills → Add Skill → From file** to walk
the import path. It follows the Anthropic skill layout: `SKILL.md` (frontmatter +
body) plus a `scripts/` folder. The importer reads only `SKILL.md`; the script is
listed as *skipped* in the preview and is never read or executed. The imported
skill is saved **disabled** until you read and enable it.

Rebuild the archive after editing the folder:

```sh
cd docs/skills-import && rm -f phantom-api-gate.zip && zip -r phantom-api-gate.zip phantom-api-gate
```
