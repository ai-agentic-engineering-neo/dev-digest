# client — docs index

Deeper design notes for `client/`, one topic per file. The package `README.md` stays the canonical overview;
put here what is too detailed for it. Add each new doc to the list below with a one-line "read when".

<!-- - [topic.md](topic.md) — read when … -->
- [architecture.md](architecture.md) — read when adding a page/route, deciding where a component goes (`_components/` vs `src/components/`), or tracing the PR detail page's component tree and URL state
- [data-fetching.md](data-fetching.md) — read when adding/changing a hook, query key or invalidation, or touching live run progress (polling + SSE `useRunEvents`)
