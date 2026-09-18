# Task 2.0 Proofs – Skills Lab list + master-detail editor

## Task Summary

Skills Lab UI at `/skills` and `/skills/:id`: card list with search/create, Config + Preview editor beside the list. Description is the skill interface (directive) and is not part of Preview. Import is omitted until spec 03.

## What This Task Proves

- Sidebar Skills item reaches `/skills`; `g s` is registered next to `g a`.
- Cards render name, type badge, description; disabled cards are greyed; toggle `PUT`s `{ enabled }`.
- Create (no Import) persists a skill; Config save sends name/description/type/body; empty description does not save.
- Preview renders headings from **body** only.

## Evidence Summary

RTL tests cover cards, list search/create menu, Config save/validation, and Preview isolation. Browser pass on the running studio confirmed the same loop against Fastify (after applying migration 0014 locally).

## Artifact: Client tests

**What it proves:** All 2.0 proof cases plus the rest of the client suite stay green.
**Why it matters:** UI seams are mocked `fetch`/hooks as the package standard; this is the CI-checkable evidence.
**Command:** `cd client && pnpm test`

```
 Test Files  19 passed (19)
      Tests  78 passed (78)
```

Focused files: `SkillCard.test.tsx` (name/type/description, opacity 0.6 when disabled, toggle PUT `{ enabled }`), `SkillsListView.test.tsx` (mocked list, search, Add Skill → Create only), `ConfigTab.test.tsx` (save payload, empty description blocks PUT, directive caption), `PreviewTab.test.tsx` (body heading present, description absent).

## Artifact: Typecheck and lint

**What it proves:** New routes/hooks type-check and lint.
**Command:** `cd client && pnpm run typecheck && pnpm run lint`

```
$ tsc --noEmit
$ eslint .
```

## Artifact: Browser — list, create, preview, disable

**What it proves:** Live `/skills` is reachable from the sidebar; create, edit body, Preview heading, and disable-grey work against the real API.
**Why it matters:** Client tests mock the network; this is the studio seam.
**URL:** `http://localhost:3000/skills` (sidebar `activeKey` = `skills`)

Create via empty-state CTA opened the modal (Create only). After `pnpm db:migrate` (column `note` missing until 0014 ran on the local volume), cards appeared. Editor at `/skills/<id>?tab=config` saved a new body (`version` 2). Preview showed heading “Catch blocks too” labelled “as the reviewing agent receives it”; description stayed off the preview pane. Card toggle greys the disabled skill (opacity).

## Reviewer Conclusion

Skills Lab matches the Agents master-detail: list + Config/Preview, database-backed, no Import. Versions/restore remain parent 3.0.
