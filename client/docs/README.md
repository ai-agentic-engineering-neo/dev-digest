# client docs

How-to and reference material for the **studio** (`@devdigest/web`): how the app
is put together and how to work on it. Use this folder for explanations that
stay true while the code changes.

For the quick start, route map and stack summary, see [`../README.md`](../README.md).
For rules Claude must follow when editing, see [`../CLAUDE.md`](../CLAUDE.md).
For feature requirements, see [`../specs/README.md`](../specs/README.md).

## What belongs here

- **Architecture notes:** how a page flows from route → feature folder → hook → API.
- **How-to guides:** adding a route, a hook, a new UI string, or a vendored component.
- **Reference:** environment variables (`NEXT_PUBLIC_API_BASE`), scripts, folder conventions.

## What does not belong here

- Feature requirements and acceptance criteria → `specs/`
- Gotchas and dated decisions → `../insights.md`
- Agent instructions → `../CLAUDE.md`

## Index

_Empty for now. Add a line per document as it is written, for example:_
- `architecture.md` — page → hook → API data flow
- `adding-a-feature.md` — step-by-step for a new `_components/<Name>/` feature
