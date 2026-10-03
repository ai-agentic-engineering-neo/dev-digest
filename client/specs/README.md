# client/specs

One file per UI feature: `YYYY-MM-DD-feature-name.md`, using the base skeleton
from [`../../specs/README.md`](../../specs/README.md). If it also needs a new
endpoint, put the spec in the root `../../specs/` so both sides stay in one
document.

Module-specific points every spec here must cover — as behaviour inside
*Cross-module interactions* / *Contracts*, not as file locations:

```markdown
## Module specifics (client)
### Route(s)          <!-- src/app/**/page.tsx path -->
### Data              <!-- which hook in src/lib/hooks, which endpoint -->
### States            <!-- loading / empty / error / success -->
### Copy              <!-- keys to add under messages/<locale>/ -->
```
