# server docs

Deeper documentation for `server` — architecture notes, design decisions, or
subsystems that need more explanation than the top-level `README.md` gives —
as `docs/<topic>.md`.

- [run-lifecycle-and-cost.md](run-lifecycle-and-cost.md): a review run from `running` to `done`/`failed`/`cancelled`, cancellation, reaping orphaned runs on boot, and where `cost_usd` is stored and totalled.
- [findings-read-model.md](findings-read-model.md): how severity counts and previews for the PR list and Timeline are computed on read, and what `null` means.
