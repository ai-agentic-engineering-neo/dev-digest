# Example Entries

Four realistic entries, one per category, showing the level of specificity
expected. These are illustrative — do not copy them into a real
INSIGHTS.md verbatim.

---

### `[Mistake]` — server/INSIGHTS.md

```
## 2026-08-03 — repo-intel batch indexer times out on Promise.all [Mistake]
Tried indexing a repo's full file list with a single `Promise.all()` inside
`indexRepo()` at `server/src/modules/repo-intel/service.ts:122`. Past ~30
files it silently hung past the LLM client's timeout with no useful error —
the client library retries under the hood, multiplying concurrent
connections. Switched to `Promise.allSettled()` over batches of 10, and now
failures surface per-file instead of aborting the whole scan.
```

---

### `[Pattern]` — reviewer-core/INSIGHTS.md

```
## 2026-07-19 — always run groundFindings() before scoring [Pattern]
`groundFindings()` (`reviewer-core/src/grounding.ts:52`) needs to run
before any score is read from an LLM response, not after — the model's
self-reported score is untrustworthy and the real score only exists once
survivors have been filtered. Wiring it this way at the call site in
`reviewer-core/src/review/run.ts:197` made a whole class of "finding cites
a line outside the diff" bugs disappear without extra prompt engineering.
```

---

### `[Decision]` — client/INSIGHTS.md

```
## 2026-06-11 — colocate feature logic instead of a global components tree [Decision]
Considered a shared `src/components/features/*` tree for page-specific
logic, but settled on colocated `_components/<Name>/` folders beside each
`src/app/**` page instead, each with its own `*.test.tsx` — e.g.
`src/app/repos/[repoId]/pulls/[number]/_components/FindingsTab/FindingsTab.tsx:33`.
Chosen because this app's pages rarely share feature logic across routes
(unlike the cross-cutting chrome in `src/components/app-shell`), so
colocation kept diffs smaller and made it obvious what's safe to delete
when a page goes away.
```

---

### `[Context]` — server/INSIGHTS.md

```
## 2026-05-02 — fastify-type-provider-zod silently 400s on z.date() [Context]
A route schema using `z.date()` for a request body field — e.g. the
`{ schema: { body: ... } }` shape at `server/src/modules/settings/routes.ts:49`
— returns a plain 400 with no validation detail in the response body — the
provider expects JSON-serializable input and a `Date` never survives
`JSON.parse`. Accept an ISO string in the schema and `z.coerce.date()` it
after parsing instead; cost about an hour to trace because the 400 gave no
hint it was a type mismatch rather than a missing field.
```
