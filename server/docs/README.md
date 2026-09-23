# server/docs

Deeper documentation for `server` that we deliberately keep out of
`CLAUDE.md`. `CLAUDE.md` links here — read only when the task actually needs
it (e.g. DI container details, adapter design, nuances of a specific module).

What doesn't belong here: anything already obvious from the code, and
volatile data (model prices, current limits, etc.).

## Contents

- [di-container.md](./di-container.md) — the DI container, the adapter ports,
  `ContainerOverrides` for tests, and all five LLM resolution sites.
