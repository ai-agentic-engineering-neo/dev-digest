# Insights — client

Dated discoveries and decisions. Not loaded by default.
Promote an entry to `client/CLAUDE.md` → Gotchas only if dropping it would make Claude err.

## 2026-11-24 — `apiFetch` sets JSON content-type only when a body is sent
A body-less POST with `content-type: application/json` makes Fastify reject it ("Body cannot be empty"). Keep that conditional header in `lib/api.ts`.
