# Insights — reviewer-core

Dated discoveries and decisions. Not loaded by default.
Promote an entry to `reviewer-core/CLAUDE.md` → Gotchas only if dropping it would make Claude err.

## 2026-11-24 — Why single-pass is the studio default
Map-reduce makes one LLM call per file: slower, and one transient 5xx fails the whole run. The whole diff fits typical context windows, so the server pins `single-pass` (`server/src/modules/reviews/constants.ts`).
