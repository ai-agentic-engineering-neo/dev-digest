# Task 1.0 Proofs – Import parser, SKILL.md core only

## Task Summary

Skill import parses markdown or a zip/`.skill` archive in memory and returns `{ name, description, body }`. Bundled `scripts/` are ignored. Zip-slip, oversize, and unknown extensions throw `SkillImportError` with `statusCode: 400`. Nothing is persisted.

## What This Task Proves

- Frontmatter `name` / `description` become the preview DTO; the remainder is `body`. Without frontmatter, the first ATX heading is the name and description stays empty.
- A zip with `SKILL.md` plus `scripts/pwn.sh` yields only the markdown core. `child_process` (`exec` / `execFile` / `spawn` / `fork`) and `fs.writeFile` / `writeFileSync` stay unused.
- Nested `skill-name/SKILL.md` parses when root `SKILL.md` is absent; root wins when both exist.
- Zip-slip (`../etc/passwd`), archives over 2 MiB, markdown over 1 MiB, and non-`.md`/`.zip`/`.skill` names fail with HTTP-400 semantics.
- `GET /skills` is not called. No applied migration is edited. Unzip uses `fflate` (in-process); no `exec`/`spawn`.

## Evidence Summary

Seven hermetic tests in `import.test.ts`, plus server `tsc` and eslint on the new files. The hermetic server suite stays green (170 tests). Persist/preview HTTP is parent task 2.0.

## Artifact: Frontmatter and heading fallback

**What it proves:** YAML `name`/`description` map to the DTO; body excludes the frontmatter fence. Missing frontmatter uses the first `#` heading and leaves description empty.
**Why it matters:** Preview must not invent a description (confirm stays blocked until the author fills it — task 2.0).
**Command:** `cd server && pnpm exec vitest run src/modules/skills/import.test.ts`

```
 ✓ src/modules/skills/import.test.ts (7 tests) 9ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

**Artifact path:** `docs/skill-fixtures/flaky-tests/SKILL.md`

## Artifact: Zip ignores scripts and never shells or writes

**What it proves:** `parseImportedSkill('flaky-tests.skill', zip(SKILL.md + scripts/pwn.sh))` returns the markdown core; `pwned` is absent from `body`; mocked `child_process` and `fs.write*` are unused.
**Why it matters:** Imported archives are untrusted. The product must not execute or write bundled files (OWASP A08 / spec Unit 1).
**Command:** same as above (`extracts SKILL.md from a zip that also has scripts/pwn.sh…`)

`fflate.unzipSync` does not expose symlink metadata, so the symlink branch is not asserted; path traversal is.

## Artifact: Zip-slip, size cap, and type reject with status 400

**What it proves:** `../etc/passwd` inside a zip, a 2 MiB+ archive, a 1 MiB+ markdown file, and `payload.exe` all throw `SkillImportError` with `statusCode === 400`.
**Why it matters:** Routes in 2.0 map this to HTTP 400, not `ValidationError` 422.
**Command:** same file, cases `rejects zip-slip paths…` and `rejects oversize archives…`

## Artifact: Typecheck, lint, hermetic suite, no persistence

**What it proves:** Parser typechecks; eslint is clean; the rest of the hermetic server suite still passes; no `GET /skills` in these tests; `server/src/db/migrations/` untouched.
**Why it matters:** 1.0 is a pure extract. Database work is 2.0+.
**Command:** `cd server && pnpm exec tsc --noEmit -p tsconfig.json` · `pnpm exec eslint src/modules/skills/import.ts src/modules/skills/import.test.ts src/modules/skills/constants.ts` · `pnpm exec vitest run --exclude '**/*.it.test.ts'`

```
eslint exit: 0
tsc exit: 0
 Test Files  24 passed (24)
      Tests  170 passed (170)
```

`fflate@0.8.3` added via `cd server && pnpm add fflate` (lockfile regenerated, not hand-edited).

## Reviewer Conclusion

The import parser is hermetic, refuses to run or write archive contents, and fails closed on zip-slip / size / type. Preview persist and the Skills Lab UI are still task 2.0.
