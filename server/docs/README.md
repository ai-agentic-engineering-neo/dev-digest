# docs — server

Deep-dives for the `server` package. Linked from `server/CLAUDE.md` › *Read when*.

- **[`architecture.md`](architecture.md)** — request lifecycle, the DI container
  and its ports, secrets/config split, module anatomy, the data layer, and how
  background work (SSE, traces, orphan reaping) is observed.

Related: the indexer has its own deep-dive at
[`../src/modules/repo-intel/README.md`](../src/modules/repo-intel/README.md), and
the API map lives in [`../README.md`](../README.md).
