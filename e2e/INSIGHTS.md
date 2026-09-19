# Insights — `@devdigest/e2e`

Traps we have already hit in the browser suite. Append-only. See the root
[`INSIGHTS.md`](../INSIGHTS.md) for the entry format and for cross-package traps.

---

### Flows `02`, `04` and `05` fail locally but pass in CI
**Date:** starter
**Cause:** the flows follow the home redirect to the *first* repo, so they assume the
seeded demo repo is the only one. CI seeds an empty database; your dev DB usually has
other repos you imported, so the redirect lands somewhere else.
**Fix / rule:** run `npm run e2e:hermetic`, which boots its own freshly-seeded stack on
alternate ports and leaves your dev DB alone. Never "fix" this by resetting your dev
database — and never with `docker compose down -v`, which deletes the volume and every
repo and review in it.
