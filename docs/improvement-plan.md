# Improvement plan

Audit of the whole repo against the project's own skills, 2026-08-02.

> **Status — 3 of 11 items done** (last updated 2026-08-02, after the P0 pass).
> P0 is complete except one deferred service. Every P1 and P2 item is still
> outstanding and still measured-accurate. Delete this file when the table below
> is all ✅, not before.
>
> | Item | Status |
> |---|---|
> | 1. Error boundaries | ✅ done |
> | 2. Route-level `"use client"` | ✅ done — all 7 routes thin |
> | 3. Container out of services | 🟡 3 of 4 — `repo-intel` deferred |
> | 4. Routes reaching into `db/` | ⬜ 4 violations |
> | 5. Contract drift | ⬜ untouched |
> | 6. Client boundary enforcement | ⬜ none; 42 deep imports |
> | 7. Schema-first gaps | ⬜ 3 files |
> | 8. Index-as-key | ⬜ `DiffViewer`, `FileCard` |
> | 9. Per-route metadata | ⬜ still 1 export |
> | 10. Client test coverage | 🟡 43 → 50 tests |
> | 11. Inline style objects | 🟡 hoisted in the 4 extracted views |

Applied: [onion-architecture](../.claude/skills/onion-architecture/SKILL.md),
[frontend-ui-architecture](../.claude/skills/frontend-ui-architecture/SKILL.md),
[react-best-practices](../.claude/skills/react-best-practices/SKILL.md),
[next-best-practices](../.claude/skills/next-best-practices/SKILL.md),
[fastify-best-practices](../.claude/skills/fastify-best-practices/SKILL.md),
[security](../.claude/skills/security/SKILL.md).

Everything below is measured, not impressions. Commands used are in each item.

---

## Verdict first

The architecture is in better shape than most projects this size. Ports &
adapters on the server, colocated feature folders on the client, schema-first
routes, a real DI seam, testcontainers integration tests, security plugins
configured correctly. **There is no fire.**

The gaps cluster in three places:

1. ~~**Resilience the user sees** — the client has no error boundaries at all.~~
   ✅ closed.
2. **Boundaries that erode quietly** — 17 backend violations (was 20), 42 deep
   relative imports (was 50), contract drift with no sync mechanism.
3. **The client has no enforcement** — the server fails CI on architecture
   violations; the client still has nothing equivalent. **This is now the
   biggest remaining gap**: items 4–9 are all things a linter would have caught,
   and without one they will reappear as fast as they are fixed.

---

## P0 — done

Kept for the rationale and for the record of what changed. Skip to P1 for
outstanding work.

### 1. ~~The app has zero error boundaries~~ ✅

**Done.** Added `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`
plus `common.routeError` / `common.notFound` i18n keys. Verified against a
running build: an unknown URL returns 404 with the custom copy.

Two scope calls worth recording:

- **No segment-level `error.tsx`.** There are no nested layouts, so a segment
  boundary would be a byte-identical duplicate with no behavioural difference.
- **`loading.tsx` deliberately deferred.** It only fires on Server Component
  suspense; while every page was `"use client"` it could never show. Item 2 made
  it meaningful — it is now worth adding, as its own change.

Original analysis follows.

### 1. The app has zero error boundaries

```
find client/src/app -name 'error.tsx' -o -name 'not-found.tsx' \
  -o -name 'loading.tsx' -o -name 'global-error.tsx'   → 0 results
```

Not one `error.tsx`, `global-error.tsx`, `not-found.tsx` or `loading.tsx` in the
entire App Router tree. Any render error in any route unmounts to a blank page
with no recovery path. This is the single highest-impact gap in the repo, and it
is also the cheapest to close.

Both skills call it out independently — `next-best-practices` (error-handling)
and `react-best-practices` (Error Boundaries, HIGH).

**Do:**

- `app/error.tsx` — client component, `reset` button
- `app/global-error.tsx` — must include `<html>` and `<body>`
- `app/not-found.tsx` — there is already a `RepoNotFound` component to reuse
- `error.tsx` per risky segment: `repos/[repoId]/pulls/`, `agents/`
- `loading.tsx` where a skeleton already exists inline

**Effort:** half a day. **Risk:** none — purely additive.

### 2. ~~Route-level `"use client"` makes whole routes client-rendered~~ ✅

**Done.** All 7 routes are now thin Server Components (7–9 lines, no directive).
Extracted `HomeView`, `AgentEditorView`, `PullsListView`, `PrDetailView`; the PR
list's filter/sort/count rules became pure functions in `pulls/helpers.ts` and
gained 7 unit tests that previously would have needed a full route render.

Original analysis and the before-table follow.

### 2. Route-level `"use client"` makes whole routes client-rendered

| Route | Lines | `"use client"` at root |
|---|---|---|
| `repos/[repoId]/pulls/[number]/page.tsx` | 185 | yes |
| `repos/[repoId]/pulls/page.tsx` | 135 | yes |
| `agents/[id]/page.tsx` | 124 | yes |
| `app/page.tsx` | 49 | yes |
| `onboarding/page.tsx` | 9 | yes |
| `agents/page.tsx` | 7 | no |
| `settings/[section]/page.tsx` | 7 | no |

Five of seven routes carry the directive at the route root, so everything they
import joins the client bundle from the top. This is the opposite of the
leaf-boundary rule, and it also blocks any future server-side data fetching.

The fix pattern already exists in this codebase — `agents`, `settings` and
`onboarding` use a thin route + `*View` component. Extend it to the four fat
routes.

**Do:** for each fat route, move body → `_components/<Name>View/`, move
`"use client"` onto the view, leave `page.tsx` returning `<XxxView />`.

**Effort:** ~1 day for four routes. **Payoff:** views become testable in RTL,
routes become Server Components, and it clears the structural debt catalogued in
[client/LEARNINGS.md](../client/LEARNINGS.md).

### 3. Backend: container out of service constructors — 🟡 3 of 4

**Done for `agents`, `repos`, `reviews`.** Each now declares its collaborators
explicitly; `reviews` also gained an `AgentLookup` port declared by the consumer
rather than importing `agents/repository`. Violations 20 → 17, baseline
regenerated.

**`repo-intel` deferred.** It hands the container down to `pipeline/full.ts` and
`pipeline/incremental.ts` (630 lines combined); removing it means changing both
pipeline signatures. That is a separate change with a different risk profile.

Consequence to be honest about: **all 4 remaining container cycles are
`repo-intel`**, so `no-circular` is still 5. The claim below that fixing item 3
dissolves the cycles only pays off once `repo-intel` is done.

Two things learned doing it, worth keeping:

- Injecting `Db` instead of the **repository** trades one violation class for
  another — `db-only-in-repositories` went 6 → 8 until corrected.
- Assembling the service inside `platform/container.ts` *adds* cycles, because
  the executor imports `Container`. Compose in `routes.ts` instead.

Original analysis follows.

### 3. Backend: container out of service constructors

`pnpm arch:all` → 4 × `no-container-in-services`, 5 × `no-circular`.

**Four of the five cycles run through `platform/container.ts`.** The container
imports the services it constructs; the services import the container to reach
their dependencies. Fixing the Service Locator dissolves the cycles as a side
effect — one change, two violation classes.

```
repo-intel/service.ts → platform/container.ts → repo-intel/service.ts
```

**Do:** `reviews`, `agents`, `repos`, `repo-intel` — replace
`constructor(private container: Container)` with explicit port parameters; move
wiring into `platform/container.ts`. Then `pnpm arch:baseline`.

**Effort:** ~1 day. **Payoff:** highest-leverage backend change available.

---

## P1 — worth scheduling

### 4. Routes reaching into the database

4 files: `polling`, `pulls`, `settings`, `workspace` `routes.ts` import
`db/schema` and run queries directly in handlers — no service, no repository.

Mechanical, low risk, and it removes `drizzle-orm` from the outermost ring.

### 5. Contract drift between the two `vendor/shared` copies

Confirmed by symbol:

| Symbol | client | server |
|---|---|---|
| `openrouter` | 3 files | 5 files |
| `CommitFile` | 0 | 1 |
| `CommitFilesPayload` | 0 | 1 |
| `sessionId` | 0 | 1 |

Two hand-maintained copies with no sync script and no drift detection. The
current mitigation is a warning in `CLAUDE.md`, which is documentation, not a
mechanism.

**Options, cheapest first:**

- **A CI drift check** — diff the two `contracts/` dirs, fail on divergence.
  ~20 lines, catches the problem the day it appears. Recommended.
- **A sync script** — one direction, server → client, run manually.
- **A real workspace package** — correct, but contradicts the deliberate
  "no monorepo workspace" decision in `CLAUDE.md`. Not recommended now.

Related and free: `client/src/vendor/shared/adapters.ts` is **245 lines with
zero consumers** — re-exported by `index.ts` via `export *` into every client
bundle. Delete the file and the export line.

### 6. The client has no boundary enforcement

The server now fails CI on architecture violations. The client has the same
classes of problem and nothing checking them:

- **50 deep relative imports** (`../../../`) despite `@/*` being configured —
  worst offender `pulls/[number]/page.tsx` with 6 in one file
- **4 `export *` barrels** — `app-shell`, `page-shell`, `showcase`, `lib/hooks`
- `_components` nested two levels under `RunTraceDrawer` (11-segment paths)

**Do:** either `eslint-plugin-boundaries`, or a second `.dependency-cruiser.cjs`
for `client/` mirroring the server setup — same baseline-ratchet approach, so it
lands green and only blocks new violations.

`no-restricted-imports` on `../../` alone would close the 50-import class in one
rule.

### 7. Schema-first gaps

The convention in `server/CLAUDE.md` is that every route declares zod schemas.
Three files fall short:

| File | routes | schemas |
|---|---|---|
| `workspace/routes.ts` | 1 | 0 |
| `settings/routes.ts` | 4 | 2 |
| `repos/routes.ts` | 4 | 3 |

Some are parameterless GETs where a schema adds little — but response schemas
also drive serialization, so it is worth a pass rather than an assumption.

---

## P2 — quality, do opportunistically

### 8. Array index as `key` on real lists

Most instances are harmless (skeleton placeholders, append-only trace rows). Two
are not:

- `components/diff-viewer/DiffViewer/DiffViewer.tsx:28` —
  `<FileCard key={i} file={f} />` over a file list that can reorder or filter
- `components/diff-viewer/FileCard/FileCard.tsx:83`

Use the file path / stable id. `react-best-practices` marks this CRITICAL
because it breaks reconciliation, not just performance.

### 9. Per-route metadata

One `export const metadata` in the whole app (root layout). Every route shares
one browser title. For an internal tool this is low-stakes, but
`generateMetadata` on the PR detail and agent editor routes would make tabs and
history usable.

### 10. Client test coverage

12 test files against 51 components. The colocated `*.test.tsx` convention is
established and working — the gap is coverage, not approach. Worth pairing with
item 2: extracting `*View` components makes the fat routes testable for the
first time, so write those tests as part of that work rather than separately.

### 11. Inline style objects in hot paths

`style={{}}` literals create a new object per render and defeat `React.memo` on
children. Heaviest: `AddRepoView` (16), `RunHistory` (14). The project already
has the right pattern — `styles.ts` with an `s.*` object — so this is
consistency, not redesign.

---

## Explicitly not recommended

- **Do not migrate to a monorepo workspace.** The no-workspace decision is
  deliberate and documented; the drift problem is better solved by a CI check.
- **Do not add entity classes to the server domain.** Settled in the
  onion-architecture skill — the domain is types + pure functions + ports.
- **Do not sweep the 20 backend violations in one PR.** They are baselined and
  cannot regress; fix them as you touch the files.
- **Do not restructure `vendor/ui`.** Vendored, no upstream resync, treated as
  owned source — it is out of scope for both architecture skills.
- **Do not chase the inline-style or index-key items as a project.** They are
  worth fixing in files you already have open, nothing more.

---

## Suggested sequence

| Sprint | Items | Why together |
|---|---|---|
| ~~1~~ | ~~1, 3~~ | ✅ done (3 partially) |
| ~~2~~ | ~~2 + 10~~ | ✅ done |
| **next** | **6** | Do enforcement *before* items 4–9 — otherwise each fix can silently regress. Same baseline-ratchet as the server, so it lands green. |
| then | 4, 7 | Both are backend route-layer cleanups |
| then | 3 (`repo-intel`), 5 | The two deferred/structural pieces; each is its own change |
| ongoing | 8, 9, 11 | Only in files already being edited |

Item 6 moved ahead of 4–9 deliberately: fixing violations with no linter means
re-measuring by hand every time. `loading.tsx` (unblocked by item 2) rides along
with whichever frontend sprint comes next.

## What already works — do not "improve" it

Worth recording so it does not get churned:

- **Security setup is correct.** `helmet`, `cors` with an explicit origin,
  `rate-limit`, a global `setErrorHandler`, secrets outside git and outside the
  DB via `SecretsProvider`. No changes needed.
- **Ports & adapters on the server** — seven ports, an adapter each, mocks
  injected through `ContainerOverrides`.
- **`run.repo.ts`** is a model repository: business method names, rows mapped at
  the boundary, executor passed in.
- **The thin-route pattern** already exists in three routes — item 2 is
  extending what works, not importing something new.
- **`useEffect` discipline is good** — at most 2 per file across the codebase,
  no effect chains, no derived-state-in-effect.
- **No raw `<img>`** anywhere outside vendor.
