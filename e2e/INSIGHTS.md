# Insights — e2e

Dated discoveries and decisions. Not loaded by default.
Promote an entry to `e2e/CLAUDE.md` → Gotchas only if dropping it would make Claude err.

## 2026-11-24 — CI does not use `scripts/e2e.sh`
CI (`e2e-web.yml`) brings up its own stack and calls `cd e2e && npm test` directly; `scripts/e2e.sh` is a local convenience that mirrors it.
