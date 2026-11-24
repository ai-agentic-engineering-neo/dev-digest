# Where business logic, state, and the API/data layer live in React apps (architecture, not performance)

Scope: how to separate business/domain logic from the UI in React, and where state and the API/data layer should live. Every recommendation is tied to its source URL. Dates were checked on each page (fetched 2026-11-24). Sources from before 2023 are marked **[older]**. Their core advice still holds, but check API details against newer sources.

### Source index (annotated)

| # | Source | Date | Answers |
|---|---|---|---|
| S1 | [Juntao Qiu, "Modularizing React Applications with Established UI Patterns" (martinfowler.com)](https://martinfowler.com/articles/modularizing-react-apps.html) | 2023-02-16 | Layered React app (view / hooks / domain model / network gateway). Where business logic goes. Strategy pattern instead of scattered conditionals. |
| S2 | [Alex Bespoyasov, "Clean Architecture on Frontend"](https://bespoyasov.me/blog/clean-architecture-on-frontend/) | 2021-09-02 **[older]** | Hexagonal / clean layering on the frontend (domain, application/use cases, adapters, ports). React as a driving adapter. Costs of the approach. |
| S3 | [react.dev, "Reusing Logic with Custom Hooks"](https://react.dev/learn/reusing-logic-with-custom-hooks) | current official docs | When to extract a custom hook. Hooks share logic, not state. Naming rules. No lifecycle hooks. |
| S4 | [Johannes Kettmann (profy.dev), "Path To A Clean(er) React Architecture, Part 6: Business Logic Separation"](https://profy.dev/article/react-architecture-business-logic-and-dependency-injection) (mirror: [dev.to](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-6-business-logic-separation-221g)) | 2024-06-21 | Use-case functions with injected dependencies, wrapped by a hook. Unit-testing them. When to skip. |
| S5 | [Kettmann, "Path To A Clean(er) React Architecture: Domain Entities & DTOs" (dev.to mirror of profy.dev series)](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-domain-entities-dtos-3ja0) | 2024 (series) | DTO vs domain entity. Mapping in the API layer. When to skip DTOs. |
| S6 | [TkDodo, "Practical React Query"](https://tkdodo.eu/blog/practical-react-query) | 2020-11-16, updated 2023-10-21 | Server state vs client state. Wrapping queries. Colocating keys. Index of the 33-part series. |
| S7 | [TkDodo, "Effective React Query Keys"](https://tkdodo.eu/blog/effective-react-query-keys) | 2021-06-13, updated 2022-04-23 **[older; partly superseded by S8]** | Query key factories, colocated per feature, keys ordered from generic to specific. |
| S8 | [TkDodo, "The Query Options API"](https://tkdodo.eu/blog/the-query-options-api) | 2024-01-17 | `queryOptions` as the unit of reuse. Query factories that combine keys and options. |
| S9 | [TkDodo, "Creating Query Abstractions"](https://tkdodo.eu/blog/creating-query-abstractions) | 2026-02-23 | Custom hooks vs `queryOptions`. Shared options should not be configurable. Per-screen options belong at the call site. |
| S10 | [TanStack Query docs, "Query Options"](https://tanstack.com/query/latest/docs/framework/react/guides/query-options) | current official docs | Official endorsement of `queryOptions` for sharing a key and queryFn. |
| S11 | [TkDodo, "Type-safe React Query"](https://tkdodo.eu/blog/type-safe-react-query) | 2023-01-07, updated 2023-10-21 | Typing the fetch layer. Zod validation inside `queryFn`. |
| S12 | [TkDodo, "React Query and Forms"](https://tkdodo.eu/blog/react-query-and-forms) | 2022-04-10 **[older]** | Server state vs form state. Where form and mutation logic live. |
| S13 | [TkDodo, "Working with Zustand"](https://tkdodo.eu/blog/working-with-zustand) | 2022-11-20 **[older]** | Placement and shape of a global client store. |
| S14 | [Kent C. Dodds, "Application State Management with React"](https://kentcdodds.com/blog/application-state-management-with-react) | 2020-07-21 **[older]** | Colocate, then lift, then context. Server cache vs UI state. When not to use Redux. |
| S15 | [Redux Style Guide](https://redux.js.org/style-guide/) | living official docs | Feature folders / ducks. Logic in reducers. Actions as events. What belongs in Redux. RTK Query. No form state in Redux. |
| S16 | [Bulletproof React, "API Layer"](https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md) | living repo docs (no date) | Single API client. Request declarations (types + schema + fetcher + hook) colocated under `features/*/api`. |
| S17 | [Bulletproof React, "Project Structure"](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) | living repo docs | Feature folder contents. One-way import rule (shared → features → app). No imports across features. |
| S18 | [Bulletproof React, "State Management"](https://github.com/alan2207/bulletproof-react/blob/master/docs/state-management.md) | living repo docs | Five state categories (component, application, server cache, form, URL) with a tool and placement for each. |
| S19 | [Khalil Stemmler, "Client-Side Architecture Basics" (intro)](https://khalilstemmler.com/articles/client-side-architecture/introduction/) | updated 2020-06-24 **[older]** | Framing only: client apps as layers of concern from view to state and interaction logic. The layer details were not on the fetched page. |

---

## 1. Where should business logic live: components vs custom hooks vs plain TS modules?

### Takeaway
All sources agree on three homes. Business and domain rules go in plain TypeScript modules (functions or objects with no React). Custom hooks are the thin glue that connects those modules to React state and effects. Components render and forward events. Clean/hexagonal layering with ports and DI is optional and pays off only when there is real logic.

### Cited Findings
- Qiu proposes four layers. The **view** is presentational React components. **Hooks** hold state and coordinate; the article describes a hook as the state machine behind a view. The **domain model** is plain TS classes and functions with no UI knowledge. The **network / anti-corruption layer** is a gateway that fetches and converts remote data — [S1](https://martinfowler.com/articles/modularizing-react-apps.html)
- Fetching, data reshaping, defaults and conditional rules belong in domain objects or the network layer, not in components or `useEffect` blocks. The article warns against squeezing different concerns into components or hooks — [S1](https://martinfowler.com/articles/modularizing-react-apps.html)
- Replace conditionals scattered across files (e.g. `countryCode === "JP"`), which cause shotgun surgery, with a Strategy interface (`PaymentStrategy`) passed to components through props. A new variant then means one new implementation — [S1](https://martinfowler.com/articles/modularizing-react-apps.html)
- Domain objects can be tested without rendering, and framework-independent logic can be reused elsewhere (a backend, another view library) — [S1](https://martinfowler.com/articles/modularizing-react-apps.html)
- Clean architecture layers: **domain** (entities plus pure transform functions), **application** (use cases such as checkout, plus **ports** defined around what the app needs), and **adapters** (driving: the React UI; driven: API, storage, payment). Dependencies point inward only, and the domain depends on nothing — [S2](https://bespoyasov.me/blog/clean-architecture-on-frontend/)
- React is a driving adapter. Hooks serve as a "crooked" dependency injection that hands service implementations to use cases. Use cases follow an "impure sandwich": side effect, pure transform, side effect — [S2](https://bespoyasov.me/blog/clean-architecture-on-frontend/)
- Bespoyasov's caveats: upfront design time, verbosity on small projects, harder onboarding, a bigger bundle. Two rules are non-negotiable: extract the domain, and keep the dependency direction. Avoid inheritance in domain models. Pass dates in as arguments to keep domain functions pure — [S2](https://bespoyasov.me/blog/clean-architecture-on-frontend/)
- Kettmann's diagnosis: in many React codebases, logic lands somewhere among the component, a custom hook and a utility file, with no consensus. His fix is a standalone **use-case function** that does validation and service orchestration and returns results like `{ error }` instead of setting UI state — [S4](https://profy.dev/article/react-architecture-business-logic-and-dependency-injection)
- The use case receives its services as a `dependencies` parameter (DI). A custom hook wraps it and supplies the real dependencies, so components stay unaware of them. He accepts pragmatically that this hook file is not framework-free — [S4](https://profy.dev/article/react-architecture-business-logic-and-dependency-injection)
- Don't extract a use case for a simple API request. The separation pays off only when real logic exists — [S4](https://profy.dev/article/react-architecture-business-logic-and-dependency-injection)
- Domain logic gets its own part in the series ("Part 7: Domain Logic") — [Kettmann Part 7](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-7-domain-logic-lg) (title from the series index; full text not fetched)
- Stemmler frames client apps as discrete layers of concern, from the view through state management to interaction (application) logic, and names testability as a goal — [S19](https://khalilstemmler.com/articles/client-side-architecture/introduction/)

### Inferences
- A defensible default for a skill README is **component → custom hook (glue) → pure TS module (domain/use case) → API module**. Promote logic to a domain or use-case module only once there are real rules (validation, branching, orchestration), following the "skip for a simple request" rule from S4 and the cost list from S2.
- S1 uses classes (`PaymentMethod`), while S2 and S4 favour functions and DI. The common core is "no React imports in domain code". Class vs function is a team choice.

### Gaps
- profy.dev itself did not resolve from the fetch environment (DNS failure). Kettmann's content was verified through his dev.to cross-posts, which name the profy.dev canonical URL.
- Stemmler's layer-by-layer details (presentation, UI logic, interaction, networking, state) were not on the fetched intro page and are not verified here.

---

## 2. Custom hooks as the boundary: when to extract one

### Takeaway
react.dev treats custom hooks as a way to share **stateful logic, not state**. Extract one mainly to wrap Effects or logic reused across components that look different. Give it a concrete, purpose-revealing name. Plain helpers that call no hooks must not use the `use` prefix.

### Cited Findings
- Don't extract every duplicated snippet ("some duplication is fine"). Wrapping a single `useState` is probably unnecessary — [S3](https://react.dev/learn/reusing-logic-with-custom-hooks)
- Consider extracting a custom hook whenever you write an Effect. It states the intent and shows how data flows through it — [S3](https://react.dev/learn/reusing-logic-with-custom-hooks)
- Hooks share stateful logic, not state itself. Each call is independent. To share actual state, lift it up and pass it down — [S3](https://react.dev/learn/reusing-logic-with-custom-hooks)
- Use the `use` prefix only when the function calls at least one hook. Hook-free helpers such as `getSorted(items)` should be plain functions, which can then be called conditionally — [S3](https://react.dev/learn/reusing-logic-with-custom-hooks)
- Avoid "lifecycle" hooks like `useMount` / `useEffectOnce` / `useUpdateEffect`. They hide dependencies from the linter — [S3](https://react.dev/learn/reusing-logic-with-custom-hooks)
- Use concrete, high-level names (`useChatRoom`, `useImpressionLog`, `useData(url)`) and constrain what each hook does. If a name is hard to pick, the Effect may not be ready to extract — [S3](https://react.dev/learn/reusing-logic-with-custom-hooks)
- Wrapping logic in a hook lets you swap the implementation later without touching components (e.g. `useState`+`useEffect` → `useSyncExternalStore`) — [S3](https://react.dev/learn/reusing-logic-with-custom-hooks)
- For server data specifically, TkDodo now considers custom hooks that *only* wrap `useQuery` "a bit pointless". Keep a hook when it adds real logic, otherwise share `queryOptions` — [S8](https://tkdodo.eu/blog/the-query-options-api); reaffirmed in [S9](https://tkdodo.eu/blog/creating-query-abstractions)

### Inferences
- The hook layer should stay thin. Pure computations belong in non-`use` functions (S3 naming rule), which makes them unit-testable without `renderHook`. This matches S1 and S4.

### Gaps
- None material.

---

## 3. Server state vs client state

### Takeaway
Server data is a **cache owned by the server**. Manage it with a cache library (TanStack Query, SWR, RTK Query) and don't copy it into local or global state. Only genuine UI/client state goes into `useState` / context / Zustand / Redux. Since 2024 the recommended unit of reuse for queries is `queryOptions` (often in per-feature query factories), not custom hooks.

### Cited Findings
- "It is the server who owns the data." Don't copy `useQuery` results into local state, because background updates then stop reaching the UI — [S6](https://tkdodo.eu/blog/practical-react-query)
- Older advice: wrap each query in a custom hook, and keep every use of a query key plus its types in one file — [S6](https://tkdodo.eu/blog/practical-react-query) (2020, updated 2023)
- Query key factories, colocated per feature (e.g. a `queries.ts` beside the feature) rather than in a global keys file, with keys ordered from generic to specific (`['todos','list',{filters}]`, `['todos','detail',id]`) so you can invalidate at any level — [S7](https://tkdodo.eu/blog/effective-react-query-keys)
- "Separating QueryKey from QueryFunction was a mistake." Build query factories that mix key-only entries (`all()`, `lists()`) with full `queryOptions` entries (`list(filters)`, `detail(id)`) — [S8](https://tkdodo.eu/blog/the-query-options-api)
- `queryOptions` catches typos such as `stallTime` and types `getQueryData`/`setQueryData` without manual generics — [S8](https://tkdodo.eu/blog/the-query-options-api)
- `queryOptions` works in `useQuery`, `useSuspenseQuery`, `useQueries`, route loaders, prefetching in event handlers and on the server. Hooks can't. Make shared options non-configurable (key + fn) and set `staleTime`/`select`/`throwOnError` at the call site by spreading — [S9](https://tkdodo.eu/blog/creating-query-abstractions)
- The official docs recommend `queryOptions` to share `queryKey` and `queryFn` across `useQuery`, `useSuspenseQuery`, `useQueries`, `setQueryData` and so on, while still allowing per-component overrides such as `select` — [S10](https://tanstack.com/query/latest/docs/framework/react/guides/query-options)
- Dodds distinguishes **server cache** (server data copied to the client) from **UI state** (e.g. whether a modal is open), says to manage them differently, and recommends react-query, which he describes as a cache rather than a state manager — [S14](https://kentcdodds.com/blog/application-state-management-with-react)
- Bulletproof React: use a dedicated caching library for server cache rather than a general store like Redux — [S18](https://github.com/alan2207/bulletproof-react/blob/master/docs/state-management.md)
- Redux Style Guide: use RTK Query as the default for fetching and caching. It recommends against hand-writing data-fetching logic in almost all cases — [S15](https://redux.js.org/style-guide/)

### Inferences
- S6/S7 (2020–2022) recommended "custom hook per query" plus separate key factories. S8–S10 (2024–2026) supersede that with `queryOptions`-based factories that keep each key next to its fn. A README should cite S8/S9/S10 as current and S6/S7 for background.

### Gaps
- No single official doc prescribes a *file location* for query factories. S8 and S9 don't specify one. The feature-folder placement comes from S7 and S16.

---

## 4. The API layer: typed client, fetchers, boundary validation, DTO → domain mapping

### Takeaway
Use one pre-configured API client. Declare each request outside components, with its types/schema, fetcher and query hook or options, colocated under `features/<x>/api`. Validate responses at the boundary (Zod in the fetcher / `queryFn`). Map DTOs to domain shapes inside the API layer so components never see raw server shapes. Skip DTO mapping when the API already fits the UI.

### Cited Findings
- Use a single API client instance, reused across the app (reference: `src/lib/api-client.ts`) — [S16](https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md)
- Don't declare requests inline. Each declaration holds the request/response types and validation schemas, a fetcher that goes through the shared client, and a hook for fetching and caching — [S16](https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md)
- Colocate declarations by feature (e.g. `features/discussions/api/get-discussions.ts`). Use a top-level `api` folder if many calls are shared — [S16](https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md); [S17](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
- Type the fetch function, not the hook. Avoid return-only generics such as `axios.get<Todo>`, which are disguised type assertions ("For a Generic to be useful, it must appear at least twice") — [S11](https://tkdodo.eu/blog/type-safe-react-query)
- Call a Zod schema's `parse` inside `queryFn`. Invalid data puts the query into its `error` state. Keep schemas lenient about details users don't care about, parse selectively because of runtime cost, and consider tRPC/zodios end-to-end typing if you own both ends — [S11](https://tkdodo.eu/blog/type-safe-react-query)
- The DTO (e.g. JSON:API `attributes`/`relationships`) is used only inside the API layer. `dtoToUser()` in `api/user/transform.ts` maps it to a flat domain `User` in `src/domain/`, so components never see DTOs. This decouples the UI from changes in the backend's response format — [S5](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-domain-entities-dtos-3ja0)
- DTO cost: a model, a DTO and a transformer per entity. Reduce it with shared or OpenAPI-generated types, and skip DTOs when the response already fits — [S5](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-domain-entities-dtos-3ja0)
- A gateway / anti-corruption layer keeps changes to the external API in one place — [S1](https://martinfowler.com/articles/modularizing-react-apps.html)
- More parts of the series: shared API client, fetch functions, data transformations — [Part 1](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-a-shared-api-client-2d4p), [Part 2](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-api-layer-fetch-functions-4jin), [Part 3](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-api-layer-data-transformations-1go0), [Part 8 (React Query)](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-8-how-does-react-query-fit-into-the-picture-1b99) (titles and URLs from the series index; contents not fetched)

### Inferences
- The recommended boundary pipeline is: API client → fetcher (parse with Zod → map DTO to domain) → `queryOptions` → component. Validation and mapping both sit in the API layer, so domain and UI code can trust their types.

### Gaps
- No fetched source treats Zod-at-the-boundary in a Next.js server-component context. That belongs with the adjacent Next.js research.

---

## 5. Placement of global client state: Context vs Zustand/Redux

### Takeaway
Default to colocated state: local, then lifted, then composition, then context. Use a global store only for truly app-wide client state, split into small stores. Inside a store, put the logic in reducers/actions modelled as events, and expose it through custom hooks.

### Cited Findings
- "Keep state as close to where it's needed as possible." Lift state to the nearest common parent. Try composition before context. Use context "only when prop drilling really becomes a problem", with separate contexts per concern — [S14](https://kentcdodds.com/blog/application-state-management-with-react)
- Don't put local state (e.g. whether a modal is open) in Redux — [S14](https://kentcdodds.com/blog/application-state-management-with-react)
- **Structure files as feature folders with single-file logic** ("ducks", `createSlice`), Priority B — [S15](https://redux.js.org/style-guide/)
- **Put as much logic as possible in reducers** rather than in handlers or dispatching code, Priority B — [S15](https://redux.js.org/style-guide/)
- **Model actions as events, not setters**, Priority B — [S15](https://redux.js.org/style-guide/)
- **Evaluate where each piece of state should live**: global state goes in Redux, local state in the nearest component. Priority B — [S15](https://redux.js.org/style-guide/)
- Zustand: export only custom hooks, never the store. Use atomic selectors. Keep actions in a separate object. Model actions as events and keep business logic inside the store. Prefer several small stores to one global store — [S13](https://tkdodo.eu/blog/working-with-zustand)
- Application state (modals, notifications, colour mode) can use Context, RTK, Zustand, Jotai, XState and similar. Keep it as close as possible to its consumers and don't make everything global from the start. URL state belongs in the router — [S18](https://github.com/alan2207/bulletproof-react/blob/master/docs/state-management.md)
- Features own their `stores/`. There are no imports between features, and imports flow shared → features → app, enforced with ESLint `import/no-restricted-paths` — [S17](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)

### Inferences
- The Redux "logic in reducers / actions as events" rule and the Zustand "actions as events, logic in store" rule are the same principle: state transitions live in a pure, testable unit, not in components.

### Gaps
- No 2024–2026 primary source in this pass compares Context and Zustand architecturally. S13 and S14 date from 2020–2022.

---

## 6. Placement of form and validation logic

### Takeaway
Form state is its own category. Keep it in a form library (React Hook Form and similar) with schema validation (Zod/Yup), local to the form rather than in a global store. Treat server data as the form's *initial* values. Fetching and mutations usually live in the parent, and the form component owns `useForm`.

### Cited Findings
- Form state category: React Hook Form / Formik / React Final Form with zod or yup, wrapped in an abstract `Form` component plus reusable field components — [S18](https://github.com/alan2207/bulletproof-react/blob/master/docs/state-management.md)
- **Avoid putting form state in Redux.** Keep edits local and dispatch when the form is complete. A live WYSIWYG preview is the exception. Priority C — [S15](https://redux.js.org/style-guide/)
- Treat server state as initial data only. Split the form into a child component that receives fetched data as `defaultValues`. Consider `staleTime: Infinity` when only the user edits the data. Alternatively, keep server data in the query and store only the user's edits as client state. After a mutation, invalidate the query and reset the form — [S12](https://tkdodo.eu/blog/react-query-and-forms)
- Validation is an example of non-UI logic that moves into the use-case function — [S4](https://profy.dev/article/react-architecture-business-logic-and-dependency-injection)

### Inferences
- A Zod schema shared between form validation and API-request validation gives one source of truth for input rules. S16 already places schemas in the API declarations, but no source explicitly states this reuse.

### Gaps
- React 19 form Actions (`useActionState`, `<form action>`) and Next.js Server Actions were not researched here, and S12 (2022) predates them. Cover them with current react.dev / nextjs.org docs.

---

## 7. Testing implications: pure logic modules are unit-testable

### Takeaway
The main payoff every source names for extracting logic is testability. Domain functions and use cases with injected dependencies can be unit-tested without rendering or network mocks. Integration/e2e tests catch mismatches between mocks and real services.

### Cited Findings
- Domain objects can be tested without rendering any view. Pure presentational components are easy to test and reuse — [S1](https://martinfowler.com/articles/modularizing-react-apps.html)
- A standalone domain needs fewer mocks. Use cases become testable when services are passed in rather than pulled from hooks. The author admits the hook-based version is hard to test in isolation — [S2](https://bespoyasov.me/blog/clean-architecture-on-frontend/)
- Unit-test use cases with mock dependencies to cover every branch quickly, instead of slow UI-driven tests per path. Keep integration/e2e tests to catch mock drift — [S4](https://profy.dev/article/react-architecture-business-logic-and-dependency-injection)
- Redux: putting logic in reducers is preferred partly because reducers are pure and easy to test (rule "Put as Much Logic as Possible in Reducers") — [S15](https://redux.js.org/style-guide/) (the testability rationale is in the rule's full text; this fetch confirmed the rule name and priority only)
- Validating in `queryFn` turns bad server data into an ordinary error state that tests can assert on — [S11](https://tkdodo.eu/blog/type-safe-react-query)
- TkDodo's series has a dedicated "Testing React Query" part — [S6 series index](https://tkdodo.eu/blog/practical-react-query) (not fetched)

### Inferences
- In a skill README: "If logic can be a non-`use` function, make it one. It is then testable with plain vitest and no `renderHook`." This combines S3's naming rule with S1/S4.

### Gaps
- The exact wording of the Redux testability rationale and the contents of TkDodo's "Testing React Query" were not verified in this pass.
