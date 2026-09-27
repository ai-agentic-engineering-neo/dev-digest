# Import fixture — `flaky-test-heuristics`

The skill imported during the Skills demo, kept as a folder rather than a
committed archive so the executable payload stays readable in review.

Build the archive when you need it:

```bash
cd specs/fixtures
zip -r /tmp/flaky-test-heuristics.zip flaky-test-heuristics
```

Then **Skills → Add Skill → Import from file or archive** and pick
`/tmp/flaky-test-heuristics.zip`. Expected preview:

- read: `flaky-test-heuristics/SKILL.md`
- not imported: `flaky-test-heuristics/scripts/install.sh` — *executable, never unpacked*,
  and `flaky-test-heuristics/README.md` — *extra markdown, not the skill core*
- the skill is saved **disabled**, with source `Imported`

Importing the bare `SKILL.md` works too — the archive exists to demonstrate what
happens to the parts that are not the skill.
