# server/specs

One file per server-side feature: `YYYY-MM-DD-feature-name.md`, using the base
skeleton from [`../../specs/README.md`](../../specs/README.md). Anything that
also changes the UI belongs in the root `../../specs/` instead.

Module-specific points every spec here must cover — as behaviour inside
*Cross-module interactions* / *Contracts*, not as file locations:

```markdown
## Module specifics (server)
### Routes            <!-- method + path + which @devdigest/shared schema -->
### Schema changes    <!-- tables/columns; remember: db:generate, never hand-write -->
### Adapters needed   <!-- new port behind the DI container? -->
```

Most course lessons land as a new `src/modules/<name>/` plugin — say which
module the spec creates or extends.
