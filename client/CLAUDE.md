# client — Next.js UI :3000 (the DevDigest studio). Does NOT touch the DB or LLM — only REST/SSE to server :3001.

## Stack
Next.js 15.5 (App Router) · React 19 · TanStack Query · next-intl 3 · Zod 3.25 · recharts · mermaid · vitest 2 + jsdom + RTL · pnpm

## Commands
- `pnpm dev` · `pnpm typecheck` · `pnpm test` · single test: `pnpm vitest run <path>`
- Tests mock fetch — no API needed

## Map
- src/app/** — pages (thin); routes — see README.md
- src/app/**/_components/<Name>/ — feature logic + its test alongside
- src/components/ — components shared across pages (app-shell, diff-viewer, …)
- src/lib/api.ts — fetch to the API (`NEXT_PUBLIC_API_BASE`)
- src/lib/hooks/* — ALL data: TanStack Query + EventSource for /runs/:id/events
- src/vendor/ui — UI primitives (@devdigest/ui); src/vendor/shared — Zod contracts
- messages/<locale>/*.json — UI strings

## Conventions
- All documentation is written in English (CLAUDE.md, README, specs, INSIGHTS, code comments); UI strings in messages/<locale>/ are product content and follow their locale
- A page only composes; logic lives in colocated `_components/<Name>/`
- Data — only via a hook from lib/hooks; a direct fetch inside a component is forbidden
- No hardcoded text in the UI — a key in messages/ + next-intl
- Take primitives from src/vendor/ui; don't pull in a new UI library

## Gotchas
- vendor/shared must equal server/src/vendor/shared (CI: scripts/check-contracts.sh) — change contracts in server, then `cp -R ../server/src/vendor/shared/. src/vendor/shared/`
- Browser scenarios are covered by ../e2e, not by vitest here

## Do not touch
- src/vendor/** — vendored copies; change them only together with a sync (see the root CLAUDE.md)

## Read when
- Before adding or moving a page → read README.md ("UI route map")
- Before using or adding a UI primitive → read src/vendor/ui/README.md
- Before adding or moving a component, hook, helper, constant or type, or reviewing a client diff → skill `frontend-ui-architecture` (placement rules; existing code is partly legacy — see its policy)
- Before changing feature behavior → read specs/<feature>.md if it exists
- Before a design-level change → read docs/
- Before editing anything here → read INSIGHTS.md

## Insights
This package's lessons live in INSIGHTS.md (append-only, 7 sections). Hooks handle reading at the start and the wrap-up at the end; selection rules, format and writing — skill `engineering-insights` (`/engineering-insights`, `/engineering-insights review`).
An entry that fired twice → move it to Gotchas and mark it in INSIGHTS with a new entry `(→ CLAUDE.md)`.
