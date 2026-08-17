# Accepted conventions — billing-service

These conventions were already extracted and accepted for this repo. Each is
backed by a real file:line citation into `repo/`.

1. **error-handling** — Functions that can fail return `Result<T, E>` (via
   `ok()`/`err()` from `src/lib/result.ts`) instead of throwing.
   Evidence: `src/services/orderService.ts:16-22`, `src/services/paymentService.ts:9-17`.

2. **domain-modeling** — Monetary values are always integer cents
   (`amountCents` / `totalCents`), never floating-point dollars.
   Evidence: `src/services/orderService.ts:6` (`totalCents: number`),
   `src/services/paymentService.ts:9` (`amountCents: number`).

3. **immutability** — Service functions never mutate an input record; they
   return a new object via spread (`{ ...order, ... }`).
   Evidence: `src/services/orderService.ts:28` (`return ok({ ...order, status: 'paid' })`),
   `src/services/paymentService.ts:16`.

4. **naming** — Functions that perform a pure calculation with no I/O and no
   side effects are named with a `calculate`/`compute` prefix.
   Evidence: `src/services/paymentService.ts:19` (`calculateProcessingFee`).
