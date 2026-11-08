# Implementation Plan: <feature>

<!-- Written by the `implementation-planner` agent. Copy this file to plans/<feature-kebab>.md.
     The plan says HOW to build; WHAT to build comes from the APPROVED specs it links (spec-creator) —
     the implementation-planner never writes specs. No "TBD" anywhere: unknowns go to "Open questions" and block approval. -->

- **Status:** draft | approved | in progress | done
- **Execution mode:** multi-agent | single-agent  <!-- chosen by the user; /implement-plan follows it.
     Recommended: multi-agent if ≥ 6 tasks AND some wave has ≥ 2 independent tasks; else single-agent -->
- **Goal:** <one sentence — what the user can do after this ships>
- **Specs:** <Status approved: `SPEC-NN` — specs/<feature>.md (cross-module) | <module>/specs/<feature>.md (single module)>
- **Packages:** server · client · reviewer-core · e2e · mcp-server (only the ones touched)
- **Out of scope:** <bullets>

## Global constraints

<!-- From CLAUDE.md / INSIGHTS.md: only the package-wide ones that apply to THIS feature.
     Entries about a specific file/module go into that task's "Insights" field instead. -->
- No edits in `*/src/vendor/shared/**` — new API shapes live in the server module + a mirror in `client/src/lib/types.ts`.
- Migrations only via `drizzle-kit generate`, at most ONE migration task per wave.
- …

## Contracts (Wave 0)

<!-- Exact shapes every later task consumes. Owned by ONE task (T0). -->
```ts
// server/src/modules/<name>/domain.ts
export const Foo = z.object({ id: z.string().uuid(), created_at: z.string() });
export type Foo = z.infer<typeof Foo>;
// REST: GET /foos/:id → Foo   (404 not_found)
```

## File ownership map

<!-- Every file that will be created/modified, exactly once. Hotspot files (modules/index.ts,
     platform/container.ts, client/src/lib/types.ts, client/messages/en/*.json) belong to W0
     or to one integration task. -->
| File | Task | New / Modified |
|---|---|---|
| `server/src/modules/<name>/domain.ts` | T0 | new |

## Tasks

### T0 [W0] [backend] Contracts
- **Status:** todo
- **Files (only these):** …
- **Depends on:** —
- **Covers:** <`SPEC-NN/AC-n, …` this task makes true — mandatory; only W0 contracts / integration may write
  "— (W0 contracts)" or "— (integration: <why>)">
- **Produces:** <signatures / routes>
- **Insights:** <exact INSIGHTS.md lines (with path:line → symbol) about these files/modules — or "none">
- **Skill focus:** <optional — the 1–3 skill rules most at risk here; all injected skills apply anyway>
- **Steps:** <what to build, in order; tests included if Files lists test files>
- **Acceptance criteria:**
  - [ ] …
- **Verify:** <commands from plans/README.md "Verify commands" with the expected result>
  - `cd server && node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → 0 errors
  - `cd server && node node_modules/vitest/vitest.mjs run test/<area>-<topic>.test.ts` → all pass

### T1 [W1] [backend] …
### T2 [W1] [frontend] …

## Waves

| Wave | Tasks | Runs | Gate before next wave |
|---|---|---|---|
| W0 | T0 | alone | typecheck + its tests green |
| W1 | T1, T2 | in parallel (multi-agent) · sequential: T1 → T2 (single-agent) | every task's Verify + typecheck of every touched package |
| W2 | T3 (integration / e2e) | alone | — |

## Risks · Review focus

- <top failure modes + which task owns each>

## Open questions

- <questions for the user; empty before approval>
