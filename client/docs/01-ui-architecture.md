# How data reaches the screen

What carries a value from the API to a rendered pixel, and which of those choices are load-bearing.

[`../README.md`](../README.md) is the map: the route list and the hooks → `api.ts` chain live there
and are not repeated. This file covers what the file names do not say — why the client boundary sits
where it does, what an invalidation actually disturbs, how a live run coexists with the cache, and
which two lines of configuration the whole contract layer rests on.

## Where the client boundary sits

`src/app/layout.tsx` is a Server Component and cannot become anything else. Two things in it are
server-only: the `metadata` export (`client/src/app/layout.tsx:9`) and the `getLocale()` /
`getMessages()` pair from `next-intl/server` (`client/src/app/layout.tsx:15-16`). Marking that file
`"use client"` does not degrade gracefully — the metadata export stops being allowed and the two
next-intl calls have no client equivalent, so the build fails rather than the app getting slower.

The boundary therefore sits one level below the root, at `Providers`
(`client/src/lib/providers.tsx:2`), rendered inside the server layout
(`client/src/app/layout.tsx:30`). Everything a page needs — the Query client, the theme, toasts, the
active repo — hangs off that single client root, which is why no page has to think about the
boundary at all.

**The directive marks a boundary, not a file type.** Four of the forty non-test `.tsx` files under
`src/app/` lack it, and one of those four,
`RunTraceDrawer/_components/atoms.tsx`, is client code all the same: a Client Component
imports it, so it is compiled into the client bundle. A file without the directive is not a Server
Component; it is a file that takes its side from whoever imports it. Adding `"use client"` to such a
file changes nothing, and removing it from one that is imported by a client tree changes nothing
either — which is why the directive is a poor signal of where the split actually runs.

Two page shapes coexist, and the difference is not stylistic. `agents/page.tsx` and
`settings/[section]/page.tsx` are Server Components that render one client view and nothing else.
The other five pages carry the directive because they call hooks in the page body — `pulls/page.tsx`
uses `useParams`, `useSearchParams` and `usePulls` directly
(`client/src/app/repos/[repoId]/pulls/page.tsx:3`). `CLAUDE.md` § *Rules not visible from any single
file* asks for the first shape ("pages are thin"); the codebase is two-sevenths of the way there.
Treat the server shell as the target when touching a page, not as a pattern already in force.

The Query client is constructed inside `useState` with a factory
(`client/src/lib/providers.tsx:22`), not at module scope. At module scope one client would be shared
by every request the Node process serves, so one user's cache would be handed to the next.

## The cache is the state, and its keys are the plumbing

Every server value reaches a component through a React Query key, and the keys follow one shape —
a name and the id it is scoped to: `["reviews", prId]` (`client/src/lib/hooks/reviews.ts:53`),
`["pulls", repoId]` (`client/src/lib/hooks/core.ts:104`), `["pr-runs", prId]`
(`client/src/lib/hooks/reviews.ts:42`). There is no key factory and no hierarchy; the tuple is
written out at each site.

The defaults matter more than they look (`client/src/lib/providers.tsx:26-30`): `staleTime` is 30
seconds, `retry` is 1, and refetch-on-focus is off. A value therefore stays on screen unchanged for
half a minute unless something invalidates it, and switching tabs never silently refreshes anything.
Anywhere the UI must feel live, it is live because of an explicit invalidation or a poll, never
because Query noticed on its own.

Errors surface globally, but asymmetrically (`client/src/lib/providers.tsx:35-43`): a failing
mutation always raises a toast, because it was a deliberate user action, while a failing query
raises one only for a network error or a 5xx. An expected 404 stays silent so the screen can render
an inline empty state instead of an alarm.

**An invalidation replaces the array, and identity is a dependency.** Four call sites invalidate
`["reviews", prId]`: deleting a run (`client/src/lib/hooks/reviews.ts:68`), deleting a review
(`:85`), starting one (`:133`), and acting on a single finding (`:158`). The refetch that follows
hands every consumer a **new array object**, even when the content is identical — the accept that
changed one boolean gives back a fresh `findings` array for every finding on the page. Any
`useEffect`, `useMemo` or reset logic that depends on that array's identity therefore runs again,
and from the user's side the page appears to move on its own. A severity filter once cleared itself
the moment a reader accepted a card, for exactly this reason.

The rule that follows: **key UI state on ids, never on the identity of cached data.** `prId`,
`run_id` and `finding.id` survive a refetch; the array and the objects inside it do not. The same
lesson is already applied deliberately one file over — `useRunEvents` depends on
`runIds.join(",")` rather than on the `runIds` array (`client/src/lib/hooks/reviews.ts:171` and
`:213`), because the caller builds that array inline on every render and the effect would otherwise
tear down and re-open every SSE connection each time the page re-rendered.

## A run you can watch

The server answers `POST /pulls/:id/review` before the review has begun, carrying run ids and an
always-empty `reviews` array (see [`../../server/docs/01-review-run.md`](../../server/docs/01-review-run.md)).
This is the other half of that story: what the client does with those milliseconds-old ids.

Live run ids do not come from the mutation's response. They come from the server, polled:
`usePrActiveRuns` refetches every 4 seconds for as long as the list is non-empty and stops on its
own when it empties (`client/src/lib/hooks/reviews.ts:33`), and the PR page derives `liveRunIds`
from it (`client/src/app/repos/[repoId]/pulls/[number]/page.tsx:45-48`). Because the source is
`agent_runs` rather than anything remembered in the browser, closing the tab mid-run and coming back
resumes the live view instead of losing it.

Those ids drive the subscription. `useRunEvents` opens one `EventSource` per run id
(`client/src/lib/hooks/reviews.ts:181`), accumulates parsed events into component state, and closes
every stream in the effect's cleanup (`:208-211`). A stream that ends decrements an open counter,
and `running` flips false only when the last one closes (`:200-204`). Worth knowing: the browser
delivers a *normal* end-of-stream to `onerror` as well, so `running === false` means "no stream is
open", not "the run succeeded" — success and failure look the same from here.

**Live state and cached state are separate stores joined by a single edge.** Events live in
`useState` inside the hook and never enter the Query cache. `RunStatus` watches the
running → idle transition, guarded by a ref so it cannot fire on mount
(`client/src/app/repos/[repoId]/pulls/[number]/_components/RunStatus/RunStatus.tsx:23-26`), and the
page turns that one edge into two invalidations and a refetch
(`client/src/app/repos/[repoId]/pulls/[number]/page.tsx:156-160`). So between pressing *Run Review*
and seeing findings the user gets a timeline row from the poll and a streaming log from SSE, and the
findings list stays exactly as it was until that edge fires. Nothing renders half a review.

One seam is easy to miss: an agent that fails at runtime reports it as an SSE `error` event, which
is neither a query error nor a mutation error, so the global toast wiring in `providers.tsx` never
sees it. The hook raises that toast itself (`client/src/lib/hooks/reviews.ts:186-189`). A new
stream-borne failure mode needs the same treatment — it will not inherit the global handling.

## Contracts are a compile-time promise only

Types come from `src/vendor/shared`, a copy of the server's contracts that is **not** synchronised
with it (root [`CLAUDE.md`](../../CLAUDE.md) § *Gotchas*). Nothing checks them at runtime: `api.ts`
casts the parsed body and returns it (`client/src/lib/api.ts:62`). A server that changes a response
shape produces `undefined` deep inside a component, not a validation error at the boundary — the
contract is a promise the compiler believes, not one the client enforces.

Value imports from that vendored copy work only because of one line of build configuration:

```js
config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
```

(`client/next.config.mjs:11`). The vendored files carry the server's `.js` specifiers while the
files on disk are `.ts`. `tsc` and vitest resolve that themselves; the bundler does not. **Remove
that line and `pnpm typecheck` and `pnpm test` both stay green while `pnpm build` and `pnpm dev`
fail with a module-not-found pointing at the importing file** — which is why client work is not done
until a build or the running app has seen it (`../CLAUDE.md` § *Commands*).

The trap is sharper than it reads, because nothing currently exercises the line. Every import from
`@devdigest/shared` in application code is an `import type`, erased before bundling; the only
remaining value imports are inside `src/vendor/shared`, between the contracts themselves. The
configuration therefore protects a case that does not occur today and will look like dead weight to
whoever tidies the config next. It stops being theoretical the first time a component needs a Zod
schema rather than a type.

## Where a severity level lives

`src/lib/severity.ts` is the single source of the levels and their order. The list is not written
out; it is derived from a `Record<Severity, true>` whose missing key is a type error
(`client/src/lib/severity.ts:5`), so a level added to the contract stops the build here until it is
added to the UI as well — the check costs nothing at runtime, because the contract is imported as a
type and erased. `FindingsPanel/constants.ts` re-exports both symbols
(`client/src/app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/constants.ts:3`) so the
detail route's existing importers did not have to move.

That is one of **three** places a level lives. The third is the design system's own hand-written
union (`client/src/vendor/ui/primitives/tokens.ts:3`), which knows nothing about the contract or its
vendoring — and has already drifted from it, carrying an `INFO` the contract has never had. Adding a
level is three edits, and the compiler names all three at once rather than letting any of them pass
quietly.

## What is not here

| For | Go to |
|---|---|
| The route list, the hooks → `api.ts` chain, env vars | [`../README.md`](../README.md) |
| Component rules, import conventions, the build/dev gotcha in full | [`../CLAUDE.md`](../CLAUDE.md) |
| What the server does between the trigger and the findings | [`../../server/docs/01-review-run.md`](../../server/docs/01-review-run.md) |
| UI primitives, tokens, the showcase | [`../src/vendor/ui/README.md`](../src/vendor/ui/README.md) |
| Which findings survive, and how the score is computed | [`../../reviewer-core/README.md`](../../reviewer-core/README.md) |
| Choosing between unit, component and e2e coverage | [`../../TESTING.md`](../../TESTING.md) |
