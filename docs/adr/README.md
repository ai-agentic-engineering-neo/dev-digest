# Architecture Decision Records

Short records of decisions that shape the codebase, with the context and the
trigger for revisiting them. Format: Status · Context · Decision · Consequences ·
Revisit when. Numbered in order; a superseded ADR stays, marked `Superseded by`.

| # | Decision | Status |
|---|---|---|
| [0001](0001-money-stays-double-precision.md) | Run costs stay `double precision` for now | Accepted |
| [0002](0002-contracts-stay-vendored-copies.md) | Zod contracts stay as two vendored copies, guarded by CI | Accepted |
| [0003](0003-no-client-features-layer-yet.md) | No `src/features/` layer in the client yet | Accepted |
| [0004](0004-client-rendered-data-no-ssr-prefetch.md) | Pages stay client-rendered; no SSR prefetch | Accepted |

Origin: docs/improvement-plan.md items D2, X2c, C9, C10 (decided 2026-11-25).
