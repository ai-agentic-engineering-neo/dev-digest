# Component design: anatomy, splitting, composition

Contents: [Folder anatomy](#folder-anatomy) · [When to split](#when-to-split) · [How to split](#how-to-split) · [Composition](#composition) · [Container/presentational](#containerpresentational-and-hooks) · [Anti-patterns](#anti-patterns)

## Folder anatomy

```
FindingCard/
├── FindingCard.tsx        the component (one per file)
├── index.ts               public API: `export { FindingCard } from "./FindingCard"`
├── constants.ts           values only this component (and its children) use
├── helpers.ts             pure functions for it; imported by tests too
├── helpers.test.ts        unit tests for the pure part
├── types.ts               types shared by the folder's files (prop types stay inline)
├── styles.ts              style objects/class maps
├── FindingCard.test.tsx   component test
└── _components/           children used ONLY by this component
```

Rules of thumb:
- **Create a file only when it has content.** A component with no constants has no `constants.ts`. A tree full of empty placeholders hides the real structure. [R3]
- **One component per file**; tiny private helpers components (a few lines, used once) may share the file.
- **`index.ts` is the folder's door.** Outside code imports `./FindingCard`, never `./FindingCard/FindingCard` or its internals. [R3][R8]
- **Tests live next to the code** they test. [R1]
- A folder per component is justified once the component has a second file (test, helper, styles). A 15-line component with nothing else can stay a single file. [R3]

## When to split

Split because of **why the code changes**, not because of a number:

| Signal | Question to ask |
|---|---|
| Section has its own state or effects | Would it be clearer (and re-render less often) as its own component? [R9][D4] |
| Same JSX repeated 2–3× with small differences | Is the repetition the *same concept*? If unsure, wait (AHA). [R6][R7] |
| A part changes for a different reason (e.g. filter bar vs list) | Separate them so edits don't collide. |
| Mixed concerns: fetching + deriving + markup | Pull logic into a hook/helper first — often that alone fixes the size. [P1][M1] |
| Long file, many props, nested ternaries | These are **smells** that prompt the questions above, not triggers by themselves. |

Do **not** split when:
- the only reason is "the file is long" and the parts share all their state;
- the new component would have one caller and a prop list as long as the original's body;
- you're creating a "reusable" component from one use — wait for the second. [R6]

## How to split

Work top-down: [R12][D1]
1. Start with the screen as one component.
2. Pull out **logic first** (hook for orchestration, `helpers.ts` for pure derivation) — it's the cheapest, safest cut.
3. Cut JSX along ownership lines: each piece gets the state/data it needs and nothing else (push state down). [R9][D4]
4. Put each child in `_components/` of its parent. Promote only when a second parent needs it.
5. Re-read: does each component either *implement details* or *compose others*? Mixed components are the next candidates. [R12]

## Composition

- Prefer **`children` and slots** over boolean-flag props (`showHeader`, `compact`, `withFooter`). Flags multiply states; slots let the caller compose. [R12]
- If a wrapper doesn't use its children for its own logic, accept `children` instead of importing and rendering them — it removes coupling and prop drilling. [R12]
- **Compound components** (`<Tabs><Tabs.List/><Tabs.Panel/></Tabs>`) suit one cohesive widget whose parts share implicit state via context. Don't reach for them for ordinary parent/child splits. [R14]
- Prop drilling through **one** intermediate layer is fine; through three, ask whether state should move down or content should move up (children). [D4][R12]
- Pass primitives where possible; passing whole objects couples the child to the parent's data shape. [R11]

## Container/presentational and hooks

The old split — a "container" fetches, a "presentational" renders — still describes a useful *separation*, but its author said in 2019 he no longer recommends it as a rule, since hooks let a single component separate logic without a second component. [R4][R13]

Use it when the presentational half is **reused** (e.g. same view over different data) or **tested in isolation**. Otherwise: one component + a custom hook for the logic. [R15][D3]

## Anti-patterns

- **God component:** fetch + derive + validate + 150 lines of JSX. → hook + helpers + children.
- **Premature reusable component:** generic `<Card variant size footer header …>` with 12 props after one use. → inline until the second use. [R7]
- **Pass-through wrapper:** a component that only forwards props. → delete it.
- **Split by file size:** five 30-line components that share 9 props. → merge back.
- **Render functions (`renderRow()`) as structure:** use components so each piece has an identity and a place on disk (reconciliation details: `react-best-practices`).
- **Reaching into internals:** `import … from "../FindingCard/helpers"` from a sibling. → export through `index.ts` or promote the helper.
