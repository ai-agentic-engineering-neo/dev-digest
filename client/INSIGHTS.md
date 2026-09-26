# client — INSIGHTS

Append-only engineering insights for `client/`. Written by the `engineering-insights`
skill (`.claude/skills/engineering-insights/`), read at the start of any task that
touches this package. Fixed sections; one dated entry per line; never rewrite an
entry, correct it with a new dated one. Rule: if anyone reading the code would
see it, do not write it.

## What Works

- [2026-09-25] Mounting the whole `/showcase` gallery in the smoke test catches any broken export or render in `@devdigest/ui` without per-component tests. Evidence: `client/src/test/smoke.test.tsx`.
- [2026-09-25] A colocated component test that renders `PRRow` needs only `vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))` plus `NextIntlClientProvider` with the `prReview` messages; messages import path from `pulls/_components/<X>/` is seven `../` deep. Evidence: `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.test.tsx`.
- [2026-09-25] A file-upload flow is testable with plain RTL: `fireEvent.change(input, { target: { files: [new File(...)] } })` drives a `FileReader.readAsDataURL` in jsdom, so the import drawer's preview/confirm path needs no user-event dependency. Evidence: `client/src/app/skills/_components/SkillsView/_components/ImportSkillDrawer/ImportSkillDrawer.test.tsx`.

## What Doesn't Work

- [2026-09-25] Sending `content-type: application/json` on a body-less POST or PUT. Fastify rejects it with "Body cannot be empty". `apiFetch` sets the header only when a body exists. Evidence: `client/src/lib/api.ts:30`.
- [2026-09-25] Editing `src/vendor/shared` directly. It is a copy of `server/src/vendor/shared` and has already drifted; edit the server copy and sync. Evidence: `client/src/vendor/shared/index.ts`.
- [2026-09-25] Rendering a hover popover with `position: absolute` inside a PR-list row: the table card (`s.tableCard`) has `overflow: hidden` and clips it to a thin strip. Anchor it with `position: fixed` from the cell's `getBoundingClientRect()` instead. Evidence: `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx:findingsAnchor`.
- [2026-09-25] pr-self-review's gate hook greps every Bash command for the literal tokens `git push` / `gh pr create`, including inside quoted strings or heredocs; writing those words into a report from a shell command trips the gate. Reword the text or write it with the Write tool. Evidence: `.claude/skills/pr-self-review/scripts/gate.sh:15`.
- [2026-09-26] Importing a runtime value (a Zod enum, a schema) from `@devdigest/shared` in client code breaks the dev server with `Module not found: Can't resolve './contracts/findings.js'`: the barrel uses `.js` specifiers that Next's webpack does not map to `.ts`, and it only gets bundled once something imports a value. Import `type` only; mirror enum values in a local constants file. Evidence: `client/src/app/conventions/_components/CandidateCard/constants.ts`.

## Codebase Patterns

- [2026-09-25] Query errors toast only on network failure or 5xx; 4xx stays silent so views render inline empty states. Mutations always toast. Evidence: `client/src/lib/providers.tsx:38`.
- [2026-09-25] Route files are thin; all logic lives in colocated `_components/<Name>/` with `styles.ts`, `constants.ts`, `helpers.ts`, `index.ts`, and `*.test.tsx`. Evidence: `client/src/app/repos/[repoId]/pulls/[number]/_components/`.
- [2026-09-25] Styles are inline `CSSProperties` objects keyed off CSS variables; theme switching is the `data-theme` attribute. Tailwind is installed but the UI kit does not use per-component stylesheets. Evidence: `client/src/lib/theme.tsx:18`.
- [2026-09-25] `/` redirects to the first repo's PR list, so with several repos in the dev DB the landing page is whichever sorts first. Evidence: `client/src/app/page.tsx:17`.
- [2026-09-25] Cost formatting threshold is `0.10`, not `0.01`: two decimals from ten cents up, two significant digits below (`$0.06`, `$0.012`, `$0.0013`). A `0.01` cut-off rendered the design's `$0.012` as `$0.01`. Evidence: `client/src/lib/format-cost.ts:formatCost`.
- [2026-09-25] ESLint runs `eslint-plugin-react-hooks` recommended rules but `react-hooks/set-state-in-effect` is switched off in `eslint.config.mjs`: six existing hydration-safe effects (theme, active repo, editor state, mermaid) set state on mount by design. Rejected: refactoring them to `useSyncExternalStore` just to satisfy lint. Evidence: `client/eslint.config.mjs:set-state-in-effect`.
- [2026-09-25] `src/vendor/ui/nav.ts` was edited (user-approved exception to the do-not-touch rule) to add the SKILLS LAB sidebar section with Skills (`g s`) and Agents; `activeKeyFor` already knew `/skills`. Any further nav change goes there too, not in app-shell. Evidence: `client/src/vendor/ui/nav.ts:SKILLS LAB`.
- [2026-09-26] A statically rendered page whose client component calls `useSearchParams` must wrap it in `<React.Suspense>` in page.tsx, or `next build` fails with a missing-Suspense error; dynamic routes like /agents/[id] do not need it. Evidence: `client/src/app/skills/page.tsx`.
- [2026-09-26] The `Modal` primitive pads its header and footer only; the body is the caller's job (`body: { padding: 24 }` in a colocated styles.ts, as CreateAgentModal does). `Drawer` pads its body itself. A modal whose content touches the edges is missing that wrapper. Evidence: `client/src/vendor/ui/kit/Modal.tsx:60`.

## Tool & Library Notes

- [2026-09-25] `NEXT_PUBLIC_API_BASE` is the only env the client reads; default `http://localhost:3001`. Evidence: `client/src/lib/api.ts`.
- [2026-09-25] In RTL assertions a `SeverityBadge` with a count reads as label immediately followed by the number (`toHaveTextContent("Critical2")`): the count sits in a sibling span with no whitespace text node. Evidence: `client/src/vendor/ui/primitives/Badge.tsx:SeverityBadge`.
- [2026-09-25] dependency-cruiser (borrowed from server/node_modules, Node 22 required: the default node on PATH fails with ERR_UNKNOWN_BUILTIN_MODULE node:path/posix) run against client/src with the react-frontend-architecture skill's example config reports 0 import-direction or cross-route-private violations and 8 warnings, all imports of the @/lib/hooks aggregate barrel. Adding lint:arch to the client needs no known-violations baseline beyond that barrel. Evidence: `.claude/skills/react-frontend-architecture/examples.md:257`.

## Recurring Errors & Fixes


## Session Notes

- [2026-09-25] Initial capture from a read-through of the starter. No code changed. Evidence: `client/CLAUDE.md`.
- [2026-09-25] L01 run cost badge: `RunCostBadge` (compact/full) in `src/components/run-cost-badge`, `lib/format-cost.ts`, wired into PR list COST column, timeline, review-run header, trace drawer COST stat; showcase group; 39 client tests green. Evidence: `client/specs/run-cost-badge.md`.
- [2026-09-25] HW1 criteria pass (in progress): FINDINGS column + hover popover on the PR list, severity pills + filter chips in FindingsPanel, severity icons on timeline tiles, Dismiss relabelled Reject, ESLint flat config added (react-hooks plugin still missing); docs/ui-architecture.md + specs/pages.md written by a subagent, columns table still lacks the Findings row. Evidence: `client/src/app/repos/[repoId]/pulls/_components/FindingsPopover/FindingsPopover.tsx`.
- [2026-09-25] L02 skills UI: /skills card grid + side panel with inline edit/delete, create modal, import drawer with preview and trust notice, agent editor Skills tab (checkbox link, drag + arrows reorder, disabled badge), skill_count on agent cards, SKILLS LAB nav; contracts copy re-synced from server; 54 client tests green. Evidence: `client/specs/skills.md`.
- [2026-09-26] HW2 (2026-09-26, separate from the L02 line): ConfirmDialog for skill/agent deletes, agent_count on cards, /skills side panel via ?skill= and the /skills/:id editor (Config/Preview/Versioning with diff + restore), per-skill token blocks in the trace, /conventions page with candidate cards, inline edit and the Create-skill modal; 62 client tests green. Evidence: `client/specs/conventions.md`.

## Open Questions

- [2026-09-25] Should the shared contracts copy be replaced by a path alias into `server/src/vendor/shared`, as reviewer-core already does, to stop the drift? Evidence: `reviewer-core/tsconfig.json:paths`.
