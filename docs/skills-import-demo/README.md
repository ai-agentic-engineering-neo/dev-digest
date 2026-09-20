# Import demo archive

Material for demonstrating the Skills import path end to end.

`SKILL.md` is a real, usable skill. `scripts/postinstall.sh` is there to prove the
boundary: the importer reads the Markdown, lists the script as **not imported**,
and never opens or runs it.

Build the archive:

```bash
cd docs/skills-import-demo && zip -qr ../../skill-import-demo.zip SKILL.md scripts
```

Then import it on `/skills` → **Add Skill → Import from file**. It lands
disabled — read the body, then enable it.
