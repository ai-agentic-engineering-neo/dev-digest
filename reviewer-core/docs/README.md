# reviewer-core — docs

How the review engine is built. Feature contracts live in `specs/` (one file per feature).

| File | Read when |
|---|---|
| `overview.md` | Deciding whether logic belongs here or in `server/`; changing what `src/index.ts` exports. |
| `structure.md` | Locating a pipeline stage (prompt → LLM → grounding → reduce) or a reference test. |
| `patterns.md` | Adding a prompt slot, a new `ReviewOutcome` field, or a new `LLMProvider`. |

Quick facts: pure TypeScript, never emits JS, consumed as source by `server/` through a tsconfig alias.

Paths in these docs are relative to the package root (`reviewer-core/`); `../` points at the repo root.
