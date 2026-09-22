# Skill examples

Sample skills for the **Import from file** path of the Skills screen
(server/specs/03-skills.md).

## `flaky-test-hunter/` — a skill archive

```
flaky-test-hunter/
├── SKILL.md              ← the skill: frontmatter (name, description, type) + body
├── scripts/detect.sh     ← executable: never read, never run
└── references/patterns.md← reference doc: listed, not imported
```

Zip the folder (keep the folder itself at the archive root):

```bash
cd docs/skills-examples
zip -r flaky-test-hunter.zip flaky-test-hunter
# or, without `zip`:  python3 -m zipfile -c flaky-test-hunter.zip flaky-test-hunter
```

Then in the app: **Skills → Add Skill → Import from file** → pick
`flaky-test-hunter.zip`. The preview shows:

- the name, description and type from the `SKILL.md` frontmatter and its body;
- `ignored_files`: `scripts/detect.sh` as **executable** and
  `references/patterns.md` as **reference doc** — nothing but `SKILL.md` is
  decoded, nothing is written to disk or executed;
- any sanitizer warnings (hidden HTML comments, zero-width / bidi characters).

Confirm to save it. An imported skill is always stored **disabled** (trust gate):
review the body, enable it, then link it to the **Test Quality Reviewer** in the
agent's Skills tab.

Same thing over the API:

```bash
curl -s localhost:3001/skills/import/preview -H 'content-type: application/json' \
  -d "{\"kind\":\"file\",\"filename\":\"flaky-test-hunter.zip\",\"content_base64\":\"$(base64 -w0 flaky-test-hunter.zip)\"}"
```
