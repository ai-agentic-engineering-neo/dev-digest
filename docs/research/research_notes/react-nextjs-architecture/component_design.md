# React component design and decomposition (architecture, not performance)

Scope: how React components should be split, composed and placed. Every rule is tied to a source URL. Research date: 2026-11-24. Sources marked (VERIFIED) were fetched in full during this session; sources marked (SECONDARY) are known only through third-party summaries or search snippets.

## Q1. When and how to split a component? (one component per file? nesting definitions?)

### Takeaway
Split by single responsibility and by the shape of the data model or the mockup. Granularity is a judgment call: extract a piece when it grows complex. Never define a component inside another component. Several small, related components in one file are fine. "One component per file" is a convention, not a React rule, and Kent C. Dodds explicitly argues against enforcing it.

### Cited Findings
- react.dev "Thinking in React" (VERIFIED). It answers how to decompose UI into a hierarchy, the 5-step method. — [Thinking in React](https://react.dev/learn/thinking-in-react)
  - Single responsibility: "a component should ideally only be concerned with one thing. If it ends up growing, it should be decomposed into smaller subcomponents." — [Source](https://react.dev/learn/thinking-in-react)
  - Mirror the data model: "Separate your UI into components, where each component matches one piece of your data model." — [Source](https://react.dev/learn/thinking-in-react)
  - Nesting follows the mockup: components that appear inside another in the mockup become its children in the hierarchy. — [Source](https://react.dev/learn/thinking-in-react)
  - Extract when complexity grows. The table header stays inline until it gets complex (e.g. sorting), then it becomes `ProductTableHeader`. — [Source](https://react.dev/learn/thinking-in-react)
  - Build a static, props-only version first ("you should not be using any state values"), then add state. — [Source](https://react.dev/learn/thinking-in-react)
- react.dev "Your First Component" (VERIFIED). It answers the nesting, naming and multiple-components-per-file questions. — [Your First Component](https://react.dev/learn/your-first-component)
  - "you must never nest their definitions". Declare every component at the top level. A nested definition is "very slow and causes bugs". Pass data by props instead. — [Source](https://react.dev/learn/your-first-component)
  - Component names must start with a capital letter. — [Source](https://react.dev/learn/your-first-component)
  - You can keep multiple components in one file. This is convenient "when components are relatively small or tightly related". Move one to its own file when the file "gets crowded". — [Source](https://react.dev/learn/your-first-component)
- react.dev "Keeping Components Pure" (VERIFIED). It answers what a component may do during render. — [Keeping Components Pure](https://react.dev/learn/keeping-components-pure)
  - "Same inputs, same output". A component must "always return the same JSX given the same inputs". — [Source](https://react.dev/learn/keeping-components-pure)
  - Don't mutate preexisting variables or objects during render. Mutating objects you created in the same render is fine. — [Source](https://react.dev/learn/keeping-components-pure)
  - Treat props, state and context as read-only. Don't depend on render order. Components communicate only through props. — [Source](https://react.dev/learn/keeping-components-pure)
  - Side effects belong in event handlers. `useEffect` is "your last resort". StrictMode double-renders in development to catch impurity. — [Source](https://react.dev/learn/keeping-components-pure)
- TkDodo "Component Composition is great btw" (VERIFIED, 2024-09-21). It answers how to split a component that has several UI states. — [Source](https://tkdodo.eu/blog/component-composition-is-great-btw)
  - Use early returns for mutually exclusive states (loading, error, empty, data) instead of ternary or `&&` soup in JSX. Keep the early returns flat. They also narrow TypeScript types. — [Source](https://tkdodo.eu/blog/component-composition-is-great-btw)
  - Split by visual boxes first. Then extract the shared shell as a `Layout` that takes `children`. Repeating `<Layout>` in each branch is acceptable. — [Source](https://tkdodo.eu/blog/component-composition-is-great-btw)
  - If a shared component keeps gaining conditions, it is probably the wrong abstraction. Favor cohesion: keep styles, logic and markup that belong together in one place rather than splitting by file type. — [Source](https://tkdodo.eu/blog/component-composition-is-great-btw)
- Kent C. Dodds "Colocation" (VERIFIED, 2019-06-17) says to delete the eslint-plugin-react `no-multi-comp` rule "and all rules like it". He argues against enforcing one component per file. — [Source](https://kentcdodds.com/blog/colocation)
- Josh Comeau (VERIFIED, updated 2025-12-03): "one component per file is not required". He pulls non-trivial sub-components into their own files once they work. — [Source](https://www.joshwcomeau.com/react/file-structure/)

### Inferences
- Rule set for a skill: (1) split on responsibility or data-model boundaries, (2) extract when a section grows its own state or logic, (3) never nest component definitions, (4) small private helper components may share a file with their parent, (5) prefer early-return state branches with a shared `children` layout over nested ternaries.

### Gaps
- No official React source sets a size threshold (lines or props) for splitting. Any numeric limit would be a team convention.

## Q2. Presentational vs container components and the modern equivalent

### Takeaway
Dan Abramov's 2015 split, where "presentational" components render and "container" components fetch data and hold state, has been walked back. His 2019 update says his views evolved and that hooks do the same job without an arbitrary division. The modern equivalent: put logic in custom hooks (or a headless component, or framework data loading such as Server Components) and keep the view component thin. Do this only where it pays off; don't make it a mandatory layer.

### Cited Findings
- Dan Abramov, "Presentational and Container Components" (Medium, 2015; it returned 403 to direct fetch, so the content is SECONDARY). The article carries an "Update from 2019: I wrote this article a long time ago and my views have since evolved." — [Original](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0); note text confirmed via [LogRocket reproduction](https://blog.logrocket.com/how-to-convert-your-existing-redux-containers-to-hooks)
  - The LogRocket reproduction of the note includes "I don't suggest splitting your components like this anymore". It says hooks let you do the same thing "without an arbitrary division", and that the pattern can still be handy where it feels natural. Verify this wording against the original before quoting it as Abramov's. — [LogRocket](https://blog.logrocket.com/how-to-convert-your-existing-redux-containers-to-hooks)
- patterns.dev "Container/Presentational Pattern" (VERIFIED): the pattern "can be replaced with React Hooks". A custom hook (e.g. `useDogImages`) removes the wrapper layer. The pattern "can easily be an overkill" in small apps. "Modern React strongly favors Hooks over container components for separating logic from views." — [Source](https://www.patterns.dev/react/presentational-container-pattern/)
- Martin Fowler site, Juntao Qiu "Headless Component" (VERIFIED, 2023-11-07). This is the modern, principled form of the split. — [Source](https://martinfowler.com/articles/headless-component.html)
  - Definition: a component, usually a custom hook, "responsible solely for logic and state management without prescribing any specific UI". — [Source](https://martinfowler.com/articles/headless-component.html)
  - Move state, behavior and keyboard handling into a hook (e.g. `useDropdown`). UI parts react only to props. Test the logic through the hook or a fake test component. — [Source](https://martinfowler.com/articles/headless-component.html)
  - Use it when the same behavior needs different visuals or swappable UI. Prefer mature libraries (React Aria, Headless UI, Downshift, TanStack Table) to building from scratch. — [Source](https://martinfowler.com/articles/headless-component.html)
  - Drawbacks: a learning curve, and indirection that can hurt readability if overused. — [Source](https://martinfowler.com/articles/headless-component.html)
- react.dev "You Might Not Need an Effect" recommends wrapping fetching in a custom hook (e.g. `useData(url)`) and preferring the framework's built-in data fetching. — [Source](https://react.dev/learn/you-might-not-need-an-effect)

### Inferences
- Modern formulation for a skill: put data, state and effects in `useXxx` hooks, or in server-side loading in Next.js (Server Components fetch, Client Components render interactivity). Components then compose hooks with JSX. Do not create `XxxContainer` wrapper components by default.
- Flag as outdated: mandatory `containers/` and `components/` folder splits, Redux `connect()` containers, and class-based containers.

### Gaps
- The exact text of Abramov's 2019 note could not be fetched from Medium (403). Only secondary reproductions were seen.
- The RSC-era reframing (server component equals "container") appears only in non-authoritative DEV posts. No primary source was found.

## Q3. Composition patterns: children/slots, lift content up, compound, render props vs hooks, headless, Radix/shadcn

### Takeaway
The default tool is `children` and other JSX-typed props (slots). Prefer them to threading data through intermediate components or reaching for context. Use compound components (context-based) for multi-part widgets that share implicit state. Use headless hooks or primitives for reusable behavior. Use Radix-style `asChild` for element polymorphism. Render props are mostly superseded by hooks.

### Cited Findings
- react.dev "Passing Props to a Component" (VERIFIED): a component with `children` has "a 'hole' that can be 'filled in' by its parent components with arbitrary JSX". Use it for visual wrappers (panels, grids). — [Source](https://react.dev/learn/passing-props-to-a-component)
  - "Use spread syntax with restraint. If you're using it in every other component, something is wrong". It often means "you should split your components and pass children as JSX". — [Source](https://react.dev/learn/passing-props-to-a-component)
  - Props are read-only snapshots, and explicit repetitive props "can be more legible". — [Source](https://react.dev/learn/passing-props-to-a-component)
- react.dev "Passing Data Deeply with Context" (VERIFIED). Before using context: (1) start by passing props, because it makes data flow explicit; (2) extract components and pass JSX as `children`. Passing `posts` through a `<Layout>` that doesn't use it means "you forgot to extract some components". Use `<Layout><Posts posts={posts} /></Layout>`. Use context for theme, current user, routing, and reducer+context state. — [Source](https://react.dev/learn/passing-data-deeply-with-context)
- Dan Abramov, "Before You memo()" (VERIFIED, 2021-02-23): two techniques, "move state down" and "lift content up" (pass the stable subtree as `children`). He says they "don't really have anything to do with performance, per se". They make data flow easier to follow, and the performance gain is "a cherry on top". — [Source](https://overreacted.io/before-you-memo/)
- Kent C. Dodds "Compound Components with React Hooks" (VERIFIED, 2019-02-18): compound components are "two or more components that work together", like `<select>`/`<option>`. The parent holds implicit state shared through context (`useToggleContext`). The hook throws if a part renders outside the parent. Context replaces the older `cloneElement` approach. — [Source](https://kentcdodds.com/blog/compound-components-with-react-hooks)
- patterns.dev "Compound Pattern" (VERIFIED): there are two implementations, context and `Children.map`/`cloneElement`. Prefer context. The `cloneElement` version breaks when a part is wrapped in another element (only direct children get props) and silently overwrites same-named props. Attaching parts as statics (`FlyOut.Toggle`) means consumers only import one name. The pattern works with Server Components if provider and consumer boundaries are placed correctly. — [Source](https://www.patterns.dev/react/compound-pattern/)
- Radix "Composition" guide (VERIFIED): `asChild` clones the child and passes it the needed props and behavior. Custom components must spread all props onto the DOM node and forward the ref, or "it will break". If you change the element, you own its accessibility. Recommended as good practice for leaf components generally. — [Source](https://www.radix-ui.com/primitives/docs/guides/composition)
- Headless components: see Q2 — [Source](https://martinfowler.com/articles/headless-component.html)

### Inferences
- Order of preference for a skill: plain props → `children`/slot props → compound components (context) → context provider. Use a headless hook when behavior is reused across different visuals.
- Render props: treat as legacy for logic sharing (hooks replace them, per patterns.dev's general "hooks over wrappers" stance). They are still valid for headless libraries that expose render functions.
- shadcn/ui-style composition (Radix primitives with app-owned styled wrappers) follows the same rules: spread props, forward refs (in React 19 `ref` is a normal prop), compound parts.

### Gaps
- The shadcn/ui docs and the React docs page "Reusing Logic with Custom Hooks" were not fetched this session.
- No current official react.dev page on render props was checked. The claim that hooks superseded render props comes from my background knowledge of the legacy Hooks FAQ, not a fetched source.

## Q4. Shared/UI-kit components vs feature components vs page-level components

### Takeaway
The most-cited reference is Bulletproof React. It uses a three-layer, one-way structure: shared (`components/`, `hooks/`, `lib/`, `utils/`) → `features/<name>/` → `app/` (routes/pages). Features don't import each other. They are composed at the app or route level. An ESLint rule enforces this.

### Cited Findings
- Bulletproof React "Project Structure" (VERIFIED): `src/` contains `app` (routes, provider, router), `components` (shared), `features`, `hooks`, `lib`, `stores`, `types`, `utils`, `config`, `testing`. — [Source](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
  - "Most code" lives in `features`. A feature may contain `api`, `assets`, `components`, `hooks`, `stores`, `types`, `utils`, and only the folders it needs. — [Source](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
  - Cross-feature imports are discouraged. Compose features at the application level. — [Source](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
  - Imports flow one way, shared → features → app, enforced with `import/no-restricted-paths` zones. — [Source](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
  - Barrel files are discouraged (they hurt Vite tree-shaking). Import files directly. — [Source](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Josh Comeau (VERIFIED) organizes by function (`components/`, `hooks/`, `helpers/`), not by feature. Route components live in `pages/` (or the Next.js routing dir). — [Source](https://www.joshwcomeau.com/react/file-structure/). This contrasts with Bulletproof's feature-first layout. Both are legitimate. Bulletproof's suits larger apps, Comeau's a personal blog or site.

### Inferences
- Placement rule for a skill: generic, domain-free UI (Button, Dialog, Table primitives, design-system wrappers over Radix) goes in shared `components/ui`. Domain-aware components go in `features/<x>/components`. Pages or routes only compose features and handle data loading or layout.
- Promote a component from a feature to shared only once a second feature needs it, and strip its domain knowledge when you do.

### Gaps
- Feature-Sliced Design (feature-sliced.design) and the Next.js App Router project-organization docs were not fetched here. Another researcher may cover them.
- No source in this batch defines a "design-system layer" in detail beyond Radix's guidance on reusing design-system buttons through `asChild`.

## Q5. Props API design: prop explosion, boolean props, polymorphism

### Takeaway
Avoid accumulating boolean props that switch which tree renders. Use composition instead: compound parts, `children`/slots, and a provider for shared state. For polymorphism, Radix's `asChild` is the current mainstream pattern over `as` props. Spread props sparingly in app components, but always in leaf primitives meant for composition.

### Cited Findings
- Fernando Rojo, "Composition Is All You Need", React Universe Conf 2025 (SECONDARY: only third-party summaries were found, not the recording). — [Talk summary](https://youtubesummary.com/summary/4KvbVq3Eg5w); [blog write-up](https://singhkunal2050v2.netlify.app/blog/react-composition-patterns-beyond-boolean-props)
  - Thesis: composition is more maintainable than ever more boolean props. The example is rebuilding Slack's message composer as composable parts. — [Source](https://youtubesummary.com/summary/4KvbVq3Eg5w)
  - Heuristic: a boolean that decides which component tree renders signals you should compose instead. Closing line: "The next time you're 15 booleans deep into your component props, just remember: composition is all you need." — [Source](https://singhkunal2050v2.netlify.app/blog/react-composition-patterns-beyond-boolean-props)
  - Shared state goes through a Provider, so you swap state management by swapping the Provider while children stay unchanged. — [Source](https://second-brain-nuxt.vercel.app/composition-is-all-you-need)
  - The same rule set is packaged as Vercel's agent skill "vercel-composition-patterns". — [Source](https://skills.sh/vercel-labs/agent-skills/vercel-composition-patterns)
- react.dev: avoid contradictory booleans in state. Replace `isSending` + `isSent` with a single `status` union. By analogy this applies to props (an inference, not stated for props). — [Source](https://react.dev/learn/choosing-the-state-structure)
- Polymorphism via `asChild`, with spread-props and forward-ref requirements. — [Source](https://www.radix-ui.com/primitives/docs/guides/composition); the context-based `as` alternative is mentioned in [Headless Component](https://martinfowler.com/articles/headless-component.html)
- Over-use of `{...props}` signals a missing split into `children`. — [Source](https://react.dev/learn/passing-props-to-a-component)
- Name props that only seed state `initialX`/`defaultX`. Don't mirror props in state. — [Source](https://react.dev/learn/choosing-the-state-structure)

### Inferences
- Skill rules: (1) at most one or two visual booleans. A boolean that picks a different subtree is a reason to compose. (2) Use a `variant: 'a' | 'b'` union over several mutually exclusive booleans. (3) Accept `children` or named slot props (`header`, `actions`) instead of data props for content. (4) Use `asChild` for element swapping in UI-kit primitives.

### Gaps
- The primary recording or slides of Rojo's talk were not accessed. Quotes rely on third-party write-ups, so verify before quoting verbatim.
- No authoritative source gives a numeric limit on prop count.

## Q6. State placement in the component tree

### Takeaway
Keep state minimal and derived values computed. Put state at the closest common parent of the components that use it. Push it back down (colocate) when usage narrows. Lift state up instead of synchronizing copies. Don't use Effects to derive or relay data. Reach for context only after props and `children` composition.

### Cited Findings
- "Thinking in React": state must be minimal and DRY. Data that is unchanged, comes from props, or is computable is not state. Place state at the closest common parent, or create a new parent solely to hold it. Children update it through callback props (inverse data flow). — [Source](https://react.dev/learn/thinking-in-react)
- "Choosing the State Structure" (VERIFIED): group related state, avoid contradictions (use a status union), avoid redundant state (compute `fullName`), avoid duplication (store `selectedId`, not the object), avoid deep nesting (normalize). "Don't put props into state unless you specifically want to prevent updates." — [Source](https://react.dev/learn/choosing-the-state-structure)
- "You Might Not Need an Effect" (VERIFIED). — [Source](https://react.dev/learn/you-might-not-need-an-effect)
  - Compute derived values during render. Use `useMemo` only for measured expensive work. — [Source](https://react.dev/learn/you-might-not-need-an-effect)
  - Reset state with `key` (`<Profile key={userId} />`). — [Source](https://react.dev/learn/you-might-not-need-an-effect)
  - Event-specific logic goes in handlers. Effects only for code that runs "because the component was displayed". Don't chain Effects. — [Source](https://react.dev/learn/you-might-not-need-an-effect)
  - Notify the parent in the same event handler. "Whenever you try to keep two different state variables synchronized, try lifting state up instead!" Pass data down; don't send it up through Effects. — [Source](https://react.dev/learn/you-might-not-need-an-effect)
  - Use `useSyncExternalStore` for external stores. Fetch in a custom hook with cleanup, or with the framework's data fetching. — [Source](https://react.dev/learn/you-might-not-need-an-effect)
- Kent C. Dodds "State Colocation will make your React app faster" (VERIFIED, 2019-09-23) gives a decision tree: start with `useState` in the component; move it down if only one child uses it; lift it to the closest common parent if siblings need it; for prop drilling, use composition or context. "Revisit these decisions" as requirements change. Don't put local UI state such as modal-open in global stores. — [Source](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster)
- "Move state down" is also framed as architectural (clearer data flow), not only a performance technique. — [Source](https://overreacted.io/before-you-memo/)
- Context only after props and `children` extraction. Context use cases: theme, auth user, routing, reducer+context. — [Source](https://react.dev/learn/passing-data-deeply-with-context)

### Inferences
- Skill checklist: Is it derivable? Then don't store it. Is it server data? Then use a server-state library or the framework, not `useState`+`useEffect`. Who reads it? Put it at the lowest common owner. Is it duplicated? Lift it. Has it narrowed? Push it down.

### Gaps
- The react.dev page "Sharing State Between Components" was not fetched separately. Its lifting-state rule is covered by "Thinking in React" and "You Might Not Need an Effect" above.

## Q7. File-level conventions inside a component folder

### Takeaway
No official React convention exists. The authoritative community guidance is colocation: tests, styles, hooks, helpers and types that are specific to one component live next to it. Promote them to shared folders only when reused. A folder per complex component, with optional `index.ts` re-export, is a common style. Bulletproof warns against barrels.

### Cited Findings
- Kent C. Dodds "Colocation" (VERIFIED, 2019): "Place code as close to where it's relevant as possible". "Things that change together should be located as close as reasonable". Colocate test files with what they test (e2e tests at the root are the exception). Colocate styles and state. — [Source](https://kentcdodds.com/blog/colocation)
- Josh Comeau "Delightful React File/Directory Structure" (VERIFIED, 2022, updated 2025-12-03): use `components/FileViewer/` with `FileViewer.tsx`, private sub-components (`Sidebar.tsx`…), `FileViewer.helpers.ts`, `FileViewer.types.ts`, component-specific hooks and constants. Add `index.ts` re-exporting the default. With the App Router, `export *` caused errors, so keep only the default re-export. Generic hooks go in `src/hooks`, project helpers in `src/helpers`, project-agnostic utils in `src/utils.ts`, and style constants in `src/constants.ts`. — [Source](https://www.joshwcomeau.com/react/file-structure/)
- Bulletproof React: the feature-folder internals (`api/components/hooks/stores/types/utils`). Discourages barrel files and favors direct imports. — [Source](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- TkDodo: favor cohesion over separation by file type. — [Source](https://tkdodo.eu/blog/component-composition-is-great-btw)

### Inferences
- Suggested convention for a skill (synthesized, not from one source): `Component/Component.tsx`, `Component.test.tsx`, `useComponentThing.ts`, `Component.helpers.ts`/`.types.ts`/`.constants.ts`, private sub-components as siblings. Use an `index.ts` re-export only if the team accepts barrels; Bulletproof and Comeau disagree here.
- Conflict to flag: Comeau uses an `index.ts` per component and Bulletproof discourages barrels. Resolve per project; in Next.js App Router, avoid `export *`.

### Gaps
- No react.dev or Next.js official page prescribes component-folder file naming. Everything here is community convention.
- Outdated-advice flags: `containers/` folders (Abramov 2015, walked back in 2019), `no-multi-comp` lint (Dodds says delete it), class-component HOC/render-prop logic sharing (superseded by hooks), and `React.forwardRef` (still in the Radix docs, but React 19 passes `ref` as a regular prop; this is my background knowledge, not fetched here).
