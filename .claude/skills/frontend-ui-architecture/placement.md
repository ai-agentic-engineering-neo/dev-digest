# Placement

Every "where does this file go" case, with the reasoning. Sources: `README.md` § Structure, § Boundaries.

## The ladder

Ask these in order and stop at the first yes:

1. Is it used by exactly one module? → put it **inside that module**.
2. Is it used by two modules under the same route? → put it at the **nearest common parent**.
3. Is it used across routes and still domain-aware? → **cross-route tier** (`components/<name>/`, `features/<name>/`).
4. Is it domain-free? → **shared / design-system tier**.

**Step 2 is the one that gets skipped, because its home has no obvious name.** When the nearest common parent is a *route segment* rather than a component folder, the shared file lives at that segment, beside the route's own files:

```
app/repos/[repoId]/pulls/
  page.tsx
  helpers.ts          shared by page.tsx and two _components/
  constants.ts
  _components/PRRow/
  _components/FilterBar/
```

Do not skip past this to the cross-route tier. Two consumers inside one route is not evidence that a third route wants the code — promoting it there makes a route-specific helper look reusable, and the next person has to prove it is not.

Skipping to step 3 or 4 "because it will probably be reused" is the single most common structural mistake. Reuse that has not happened is a guess; the folder it creates is permanent.

## Components

| Case | Home |
|---|---|
| Rendered by one route subtree | `app/<route>/_components/<Name>/` |
| Rendered by one parent component, never alone | inside that component's folder |
| Rendered by 2+ routes, knows the domain | `components/<name>/` or `features/<name>/components/` |
| Domain-free primitive | design-system tier |

**A component becomes a feature when it needs its own internal folder structure.** That test is independent of how many places render it — internal structure means it has parts, and parts mean it is a module, not a component.

### The component folder

Folder-per-component once it has satellites:

```
RunTraceDrawer/
  RunTraceDrawer.tsx       implementation keeps the real name
  RunTraceDrawer.test.tsx
  helpers.ts
  constants.ts
  styles.ts
  _components/             sub-components only this component owns
  index.ts                 one-line re-export, nothing else
```

A single file is correct for a small leaf component. **The folder is justified by the number of satellite files, not by the component's importance.**

Keep the implementation file named after the component, not `index.tsx`: a tree full of `index.tsx` makes editor tabs, stack traces and fuzzy file search useless.

### Sub-component ownership

Only a folder's main file may own sub-components. Import from direct children only — never from siblings, never skipping levels. Anything two branches need moves up to their common parent.

This is what makes a subtree **independently deletable**: removing the folder removes everything that belonged to it, and nothing else breaks.

## Constants

- Used by one module → `constants.ts` beside it, or inline at the top of the file.
- Used across a feature → the feature's `constants.ts`.
- Genuinely cross-cutting (env, feature flags, design tokens) → a root `config/`.

**A root `constants.ts` is the constants version of the `utils/` junk drawer** and rots the same way: a name too loose to create a boundary, so everything is admissible.

Query keys are constants with an owner: keep them next to the fetcher they belong to, built by a key factory (`all → lists() → list(filters) → details() → detail(id)`, each `as const`) so invalidation works at every granularity. A central `queryKeys.ts` separates the key from the thing it identifies.

Route constants in Next.js: prefer `typedRoutes` over a hand-maintained `ROUTES` map. Generated route types cannot drift from the filesystem; a map can, silently. Note only *literal* strings are checked — non-literals need `as Route`.

Magic values: a literal is fine when its meaning is obvious at the call site (`items[0]`, `* 2`). It needs a name the moment it repeats or encodes a policy (`MAX_RETRIES`, `PAGE_SIZE`).

Prefer an `as const` object over `enum`:

```ts
const RunStatus = { Queued: 'queued', Running: 'running', Done: 'done' } as const;
type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];
```

`enum` emits runtime code, so it is banned outright under `erasableSyntaxOnly` and Node's native type stripping, and `const enum` additionally breaks `isolatedModules` and inlines values across package boundaries. The honest trade-off: an `as const` object is structurally typed, so you lose the quasi-nominal identity `enum` members have. That is the one case where reaching for `enum` is still an argument rather than a mistake — where the runtime cost is acceptable.

## Utils, helpers, lib, services

**There is no authoritative distinction between `utils` and `helpers`.** Treat them as synonyms, pick one, and never have both — two names for one concept guarantees the split between them is arbitrary.

The real problem is that both names are too loose to bound a module. The fix is to **name by domain, not by technical kind**:

- `formatCurrency` → `lib/money.ts`, not `utils/index.ts`
- `parseDiffHunk` → `lib/diff.ts`
- `utils/array.ts`, `utils/logging.ts` are acceptable *if each file is a real subject*; a single `utils.ts` never is

Test: **if the function's name contains a domain noun, the file name should too.**

Where the words do carry distinct meaning, the split is by dependency direction:

| Folder | Means |
|---|---|
| `lib/` | code with its own identity that could plausibly be a package — configured clients, framework plumbing |
| `api/` (FSD calls it this; others say `services/`) | talks to the outside world: request functions, response types, mappers |
| `utils/` | pure, stateless, **domain-free**. A function that knows your domain is not a util |

If you inherit a junk drawer, the cheap migration trick is to rename it to something greppable and unpleasant — `unstable_temporary_utils` — and put a CI check on its size. Nothing new gets added to a folder nobody wants their name on.

## Types

1. Used in one place → **define it in that file**. Inline in the signature is fine; not every type needs extracting.
2. Used in several places → `types.ts` **at the smallest scope covering the uses**, not a global `types/`.
3. Crossing a package or the wire → a dedicated shared contract module.

A global `types/` should hold only framework-level plumbing that belongs to no feature: ambient declarations, module augmentations, `*.d.ts`.

For anything crossing the wire, one schema declaration is the single source of truth and the types are *inferred* from it (`z.infer`). A hand-written interface shared across the wire drifts silently; a schema cannot, because it is executed.

Use `import type` deliberately: under `verbatimModuleSyntax` what carries the modifier is erased and what does not is emitted as-is. Useful side effect — cycle-detection lint ignores type-only imports, so converting a type-only edge genuinely breaks a cycle.

In Next.js, route-shaped types (`PageProps`, `LayoutProps`, `RouteContext`) are **generated globals** — do not hand-write them. Custom global declarations go in a new `.d.ts` added to `tsconfig.include`, never in `next-env.d.ts`, which is regenerated.

## Tests, stories, styles

Beside the module they cover. A mirrored `test/` tree that shadows `src/` is the anti-pattern: the two trees drift, and moving a component silently orphans its test.

The exception is deliberate and narrow: **integration and end-to-end tests stay at the project root**, because they span modules and belong to no single one.

## Naming

Two coherent conventions; pick one per repo and lint it:

- **kebab-case everywhere** — the `unicorn/filename-case` default. The argument is case-sensitive filesystems: macOS and Windows are case-insensitive, Linux CI is not, and `Button.tsx` vs `button.tsx` is a classic works-locally-fails-in-CI bug.
- **PascalCase folder holding `<Name>.tsx`** — matches the exported identifier, makes "delete the component" a single folder delete.

No authority prescribes either. Next.js explicitly declines to. The only defensible universal claim is *be consistent and enforce it mechanically*, with ignore patterns for framework-mandated names (`page.tsx`, `layout.tsx`, `[slug]`, `_components`).

On exports: default export when a file holds one component, named exports when it holds several. Never `export default () => {}` — an anonymous component shows up nameless in stack traces and dev tools.

## Nesting

Cap at three or four levels. Deep nesting is how a well-intentioned feature structure becomes unpleasant to work in: every import is a guess, and moving anything rewrites dozens of relative paths.

If the tree is deeper than that, the usual cause is a component folder that should have been promoted to a feature — or a feature that should have been split.
