# Component Decomposition & Composition

When to split a component, and how the pieces fit back together. Sources: `README.md` § Composition.

## When to split

Split when one of these is true:

- It is genuinely rendered in two or more places.
- **A subtree owns state nothing else needs** — extract so the state can move down with it.
- Its props have become mutually **incompatible**: combinations that can never sensibly co-occur.
- You are hitting a concrete pain: unnecessary re-render scope, unclear state ownership, an over-large test, repeated merge conflicts, a third-party integration, or an imperative escape hatch.

**Do not split to hit a number.** No reputable source endorses a line limit for components; the nearest anyone comes is "it should fit on one screen", stated as a smell to look at rather than a limit to enforce. A `max-lines` rule on components optimizes for a metric nobody defends.

The test that survives scrutiny: **can you name the component's responsibility in one short phrase without saying "and"?** If not, it is too big — at 40 lines or at 400.

Prefer splitting along **state boundaries** over visual boundaries. That split survives redesigns; the visual one does not.

A component extracted purely to shorten a file is a wrapper-only component: it adds a name and an indirection without adding a boundary. Inline it.

The genuine disagreement here is about **eagerness** — split-on-pain versus small-by-default — not about counting lines. Both camps agree that an abstraction which has started accumulating parameters and conditionals to fit its callers is the wrong abstraction, and the fix is to inline it back, find the real seam, and re-extract.

## Composition patterns

| Pattern | Use when | Cost |
|---|---|---|
| `children` | one hole; the parent should not know what fills it | none — this is the default |
| Named element props (`header=`, `footer=`) | several holes; discoverability matters more than JSX nesting | cannot be written between the tags |
| Compound components (`Card` + `Card.Header`) | sub-parts share implicit state; you want an HTML-like API | order matters; consumers can nest wrongly; **breaks across the RSC boundary** |
| Provider + consumer hook | shared state across an arbitrary subtree | re-render scope; export the Provider and `useX()`, never the raw context |
| Headless component / hook API | the same behaviour must render differently in several places | indirection, learning curve |
| Render prop | **rendering** inversion of control — not logic sharing | hooks are better for logic |
| `asChild` / `Slot` | change the rendered element without an extra DOM node | the child must spread props and forward its ref |
| Polymorphic `as` | design systems where per-element type-correctness matters | expensive types, does not chain, prop-name collisions |

Two rules cut across all of them:

**Inversion of control beats configuration.** When you feel the urge to add the seventh option to a component, that is the signal to expose a seam — a slot, a render prop, a sub-component — instead. It is never "just one more `if`"; each one is permanent and multiplies with the others.

**Composition, never inheritance.** Settled since the original docs: there are no known cases where a component inheritance hierarchy is the right answer.

Note on render props: the claim that hooks killed them is wrong as stated. Hooks won **logic sharing**. Render props survive for **rendering** inversion of control, and their modern descendants are element-or-function `render` props and `asChild`.

## Prop design

**Boolean proliferation is the best-documented smell.** *n* related booleans describe 2ⁿ nominal states, most meaningless, and which one wins is decided by whichever `if` runs last — an implementation detail leaking into the public API. Replace with one `variant` union; a discriminated union makes the invalid combinations unrepresentable rather than merely discouraged.

**Prop count is a signal, not a limit.** The advice in circulation is openly contradictory — "reconsider above five" against "twenty props can still do one thing well" — and both are defensible, because the count is not the variable. What matters is *homogeneity*: many props of the same kind are fine (an `<input>` wrapper), while a handful mixing data, layout, behaviour and feature flags is not.

**Pass the narrowest thing that works** — `{ name: string }` rather than `{ user: User }`. The counter-advice ("pass objects over primitives") is about a different case, and the two reconcile by asking **who owns the shape**: pass the object when the component is genuinely about that entity; pass the field when the component is generic and the object is an accident of the call site.

**Prop drilling is not automatically a defect.** The official position is that passing props through several layers is an acceptable price for explicit data flow — it makes it obvious which components use which data. The escalation is ordered, and teams skip step two:

1. props
2. **extract components and pass JSX as `children`**
3. context

Drilling that hurts usually means a component split was missed, or made too early. Reaching for context at step one hides the data flow instead of simplifying it.

Never copy props into state — the component then ignores updates. If you must seed from a prop, name it `initialX` or `defaultX` so the one-way flow is visible.

## The shared/UI layer

Three tiers, arrived at independently by several design-system practitioners:

1. **Unstyled primitives** — behaviour and accessibility, no opinions about looks.
2. **Styled primitives** — your design system: tokens, variants, sizes.
3. **Domain components** — product-specific, knows your entities.

A vendored `components/ui/button.tsx` is tier 2. **It may know about your design system; it must not know about your domain.** A `Button` with `variant="destructive"` is tier 2. A `Button` importing `useCart()` is a tier-3 component wearing a tier-2 name, and it inverts the dependency direction.

Because you own vendored code, the allowed edits are: change defaults, add variants, tighten the prop union, add `asChild`. The disallowed edit is importing anything from a feature.

When editing, keep the composition contract intact: stop spreading props or forwarding the ref and every `asChild` usage silently breaks.

## Layout ownership

**A component never sets its own outer margin.** External spacing is the parent's responsibility; a component is only ever responsible for its internal spacing. Outer padding is acceptable only when the component has a border or background defining a real edge.

The reason is encapsulation, not aesthetics: margins bleed through the component boundary, so a component with baked-in outer margin cannot be recomposed — you end up writing compensating negative margins at every new call site.

The remedy is the parent as a flex or grid container using `gap`. (A `<Spacer />` element solved this before `gap` was universally supported; treat it as a legacy workaround now.)

Corollary: layout primitives — `Stack`, `Grid`, `Cluster` — are the only components allowed to express spacing *between* things, and they express it with `gap`, never by reaching into children.

## What RSC changed

`'use client'` bounds the **module graph**, not the render tree. It does not apply to Server Components passed as `children` or other props. That single sentence is the whole composition rule.

- The load-bearing pattern is the **slot**: a Client Component accepts `children`, and a Server Component parent decides what fills it.
- It works because of **ownership**. A Client Component can never *import* a Server Component; it can only *receive* one. The Server Component doing the importing is the one that decides the props.
- Context cannot exist in Server Components. Providers are Client Components accepting `children`, rendered by a Server Component — as deep in the tree as possible.
- Compound components break across the boundary: a static property on a client reference is `undefined`. Expose the parts as named exports instead.

This adds a splitting signal none of the pre-2023 sources list: **push `'use client'` down to the leaves**. A mostly-static layout with one interactive search box is a Server Component rendering a client `<Search />`, not a client layout. Extracting the interactive part is an architectural requirement here, not a preference.

## Anti-patterns

| Anti-pattern | Tell | Fix |
|---|---|---|
| God component | disproportionate props, hooks, or share of the page | split by responsibility; invert control via slots |
| Boolean-flag soup | 3+ related booleans; last `if` wins | one `variant` / discriminated union |
| Wrapper-only component | exists to shorten a file | inline it |
| Premature abstraction | acquiring parameters to fit almost-cases | inline back, find the seam, re-extract |
| Options-bloated abstraction | more flags than call sites | hand the caller a slot or function |
| Prop drilling as a symptom | middle layers forward props they do not use | extract components, pass `children` — before context |
| Context as a hammer | context for anything shared | exhaust props and composition first; scope narrowly |
| Props copied into state | component ignores updates | derive, or rename `initialX` |
| JSX from an inner function | `const renderRow = () => <tr>…` | extract a real component, or inline the JSX |
| Component owns its outer margin | negative-margin compensation at call sites | parent owns spacing via `gap` |
