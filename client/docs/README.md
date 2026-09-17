# client docs

Deeper documentation for `client` — architecture notes, design decisions, or
subsystems that need more explanation than the top-level `README.md` gives —
as `docs/<topic>.md`.

- [data-flow.md](data-flow.md): page → hook → `api.ts` → TanStack Query; which cache key feeds each PR screen, what each mutation invalidates, and known stale spots.
- [findings-and-cost-ui.md](findings-and-cost-ui.md): severity badges and popover, severity pills and filter, and cost formatting, with the rules each follows.
