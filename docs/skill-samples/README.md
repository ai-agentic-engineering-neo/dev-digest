# Skill samples

Third-party-style skills for demoing **Skills → Add Skill → Import from file**.

`deprecation-policy/` is a Claude-style skill folder: `SKILL.md` (frontmatter +
body), a `references/` markdown file, and a `scripts/` shell script. Zip the folder and
import it:

```powershell
Compress-Archive -Path docs/skill-samples/deprecation-policy -DestinationPath $env:TEMP/deprecation-policy.zip -Force
```

The import preview should show:

- `SKILL.md` and `references/deprecation-headers.md` as **used** (the reference is appended
  to the body under `## Reference: …`);
- `scripts/find-deprecated.sh` as **ignored** (executable — never run or read);
- a warning that the `allowed-tools` frontmatter key is ignored (skills are text only);
- the trust notice — an imported skill is someone else's instructions in your agent's
  prompt, so it is stored with source `community` and wrapped as `<untrusted>` in the prompt.

Then link it to **API Contract Reviewer** in the agent's Skills tab — it completes the
API contract set: `breaking-change`, `response-schema`, `semver-discipline` (seeded) +
`deprecation-policy` (imported).
