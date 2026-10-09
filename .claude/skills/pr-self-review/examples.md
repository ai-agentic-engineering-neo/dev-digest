# Examples

Worked runs for [SKILL.md](SKILL.md). Paths are real files in this repo.

---

## 1. A clean pass

The output is one line. Resist summarising everything that was checked and found
fine — verbosity on success is what trains people to stop reading.

```
PASS — 0 blocking, 2 medium.

  medium  client/src/app/_components/HomeView/HomeView.tsx:19
          useEffect redirect fires on every repos change; harmless but
          router.replace in render-adjacent effect is worth a comment
  medium  client/src/app/agents/[id]/_components/AgentEditorView/AgentEditorView.tsx:29
          setTab rebuilds URLSearchParams on every call — fine at this size

  skills applied: frontend-ui-architecture, react-best-practices
  checks: client typecheck ✓  client tests ✓ (13 files, 50 tests)
```

Note what is absent: no "reviewed 45 files", no list of skills considered and
rejected, no restatement of the rubric.

---

## 2. A blocked run

```
BLOCKED — 2 blocking findings. Do not open this PR.

  gate  server/src/modules/settings/routes.ts:31
        routes-are-adapters — new edge src/modules/settings/routes.ts → src/db/schema.ts
        `pnpm arch` fails: this violation is not in the baseline.

  gate  client/src/lib/api.ts:14
        Hardcoded token in an added line (`ghp_…`). Rotate it before anything else —
        it is already in your reflog even if you amend the commit.

  advisory: 3 high, 5 medium (showing 4 of 8)

  high    server/src/modules/reviews/service.ts:88
          New public method with no test; reviews/ has colocated *.test.ts
  high    client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx:28
          key={i} over a file list that reorders when filtered
  medium  client/src/app/onboarding/_components/AddRepoView/AddRepoView.tsx:41
          console.log left in an added line
  medium  server/src/modules/settings/routes.ts:12
          16 inline style objects — hoist to styles.ts (…and 4 more)

  skills applied: onion-architecture, react-best-practices, frontend-ui-architecture, security
  skipped (budget): zod, typescript-expert, next-best-practices
  suppressed: 1 — client/src/lib/theme.tsx:22 "SSR guard, intentional"

  Fix the two gate findings and re-run. Everything under `advisory` is your call.
```

The verdict is carried by `pnpm arch` and the secret scan. The three HIGH
findings are real and worth fixing — and they do not block, on purpose.

---

## 3. Findings that are worth reporting, and ones that are not

### GOOD — names the file, the line, and what actually breaks

> `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx:28` —
> `<FileCard key={i} file={f} />` over a list the filter bar reorders. Filtering
> to "changed only" remaps indices, so React reuses the wrong `FileCard` and any
> open inline comment composer jumps to a different file.

Concrete failure: an input (filter change), a state (open composer), a wrong
output (composer attached to the wrong file).

### GOOD — a regression against known debt

> `server/src/modules/repos/routes.ts:44` — adds a second
> `routes-are-adapters` violation. This class was at 4 and baselined; the diff
> makes it 5. Baselined debt is not a licence to add more.

### BAD — no failure scenario

> ❌ "Consider extracting this logic into a helper for better readability."

A suggestion, not a finding. MEDIUM at most, and usually just noise.

### BAD — pre-existing, not caused by this diff

> ❌ `server/src/modules/settings/routes.ts:29` — route queries the DB directly.

If that line is untouched by the diff, **do not report it**. It is in the
baseline (`db-only-in-repositories`, 6 instances). Reporting it makes the author
responsible for debt they did not create, which is how review output becomes
something people skim.

### BAD — unverified

> ❌ "This may cause a race condition."

Either read enough to state the interleaving, or drop it. `PLAUSIBLE` is for
findings you can describe but cannot fully confirm — not for hunches.

---

## 4. Routing on a real diff

The branch that produced this skill: 45 committed files, 3 uncommitted.

```
.claude/skills/**          → excluded (reviewing the reviewer)
docs/**                    → excluded
.github/workflows/*.yml    → no skill; Phase 4 only
client/messages/en/*.json  → i18n check (Phase 4)
client/LEARNINGS.md        → excluded, but READ as review input (Phase 2)
client/src/app/**          → frontend-ui-architecture, next-best-practices, react-best-practices
client/src/lib/**          → frontend-ui-architecture, react-best-practices
server/src/modules/**      → onion-architecture, fastify-best-practices
server/.dependency-cruiser.cjs → no skill; its effect shows up via `pnpm arch`
```

Five skills matched, cap is four. Ranked by matching file count:
`frontend-ui-architecture` (14), `react-best-practices` (14),
`onion-architecture` (6), `next-best-practices` (5) — `fastify-best-practices`
(2) is dropped and named in the output.

---

## 5. Baseline suppression in practice

Without Phase 2, a PR touching `server/src/modules/` emits every baselined
violation in those files — about 17 findings on a diff that may have caused none
of them.

```bash
# what the gate ignores
python3 -c "import json;print(len(json.load(open('server/.dependency-cruiser-known-violations.json'))))"
# → 17

cd server && pnpm arch:all   # everything, baseline included — the real backlog
cd server && pnpm arch       # only what is NOT baselined — what the gate sees
```

Rule: `pnpm arch` failing is a finding. A violation visible only in `arch:all` is
known debt and stays silent — **unless the diff added another instance of it**.

---

## 6. Relocated code — the trap that produced this rule

Found on this skill's own first run. `PrDetailView.tsx` is a new file, so every
line reads as added, including:

```tsx
const allFindings: FindingRecord[] = React.useMemo(
  () => runs.flatMap((r) => r.findings),
  [reviews],          // ← uses `runs`, depends on `reviews`
);
```

A textbook exhaustive-deps finding. Check the merge base before reporting:

```bash
git show main:'client/src/app/repos/[repoId]/pulls/[number]/page.tsx' | grep -A3 useMemo
```

```tsx
const allFindings: FindingRecord[] = React.useMemo(
  () => runs.flatMap((r) => r.findings),
  [reviews],
);
```

Identical. The extraction carried it across untouched, so **drop it** — the
author did not write it and cannot be asked to fix it here.

What belongs in the PR description instead:

> `PrDetailView.tsx` is ~150 lines moved verbatim from `page.tsx`. Only the
> import paths and the hoisted `styles.ts` are new.

### The distinction that matters

| Situation | Verdict |
|---|---|
| Moved unchanged | drop |
| Moved and edited | report the edit |
| Moved into a context where it is now wrong — e.g. a hook relocated above an early `return` | report at full severity |

Only the third is this PR's fault, and it is the one worth catching.

---

## 7. A check that lied

Also from the first run. This looks like a passing client:

```bash
cd client && echo "--- typecheck"; pnpm typecheck > /tmp/c1.log 2>&1; echo "exit=$?"
```

```
(eval):cd:1: no such file or directory: client
exit=0
 Test Files  22 passed (22)
      Tests  129 passed (129)
```

Three failures stacked:

1. `cd client` failed — the shell was already inside `server/`
2. `exit=$?` came after an `echo`, so it reported the **echo's** status, not the command's
3. the commands then ran in `server/`, and 22 files / 129 tests is the *server*
   full suite — read as a green client

Correct form — verified working, do not improvise it:

```bash
cd /Users/…/dev-digest/client || exit 1
pnpm typecheck > /tmp/check.log 2>&1; rc=$?
grep -m1 '^> @devdigest' /tmp/check.log
echo "exit=$rc"
```

```
> @devdigest/web@0.0.0 typecheck /Users/…/dev-digest/client
exit=0
```

Two more traps found while writing that snippet, both of the same family:

- **`head -1` does not show the banner.** pnpm prints a blank first line;
  `grep -m1 '^> @devdigest'` is reliable, a fixed line number is not.
- **A pipe destroys the exit code.** `pnpm typecheck | grep …` gives you *grep's*
  status. The array holding the real one is `$PIPESTATUS` in bash but
  `$pipestatus` in zsh — so redirect to a file instead of piping.

The banner is the authority: `@devdigest/web` is the client, `@devdigest/api` is
the server. Wrong package means the check did not run — failed, never a pass.

---

## 8. Phase 1 short-circuit

```
BLOCKED — server typecheck failed.

  server/src/modules/reviews/service.ts(34,18): error TS2554:
  Expected 4 arguments, but got 1.

  Stopped before the review pass — a diff that does not compile is not
  worth reviewing line by line. Fix and re-run.
```

Nothing else runs. No skills loaded, no findings drafted. This is the cheapest
possible failure and should stay that way.
