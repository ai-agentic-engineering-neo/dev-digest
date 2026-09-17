# Spec — grounding, scoring, and prompt safety

The engine's guarantees. These are the rules a change must not break; they are covered by `test/`.

## Grounding gate

1. A **diff finding** is kept only when `[start_line, end_line]` intersects at least one hunk of the unified diff for the same `file`. New-side line numbers are authoritative.
2. A finding whose `kind` is `secret_leak`, `lethal_trifecta`, `phantom`, or `hook` is a **full-file** finding: it is kept when the file appears in the diff, regardless of line numbers.
3. A finding citing a file absent from the diff is always dropped.
4. Dropped findings are returned with a reason and surfaced in the run trace. Silent dropping is a defect.
5. Grounding is summarised as `kept/total passed` and persisted with the run.
6. There is no bypass. Every path that produces persisted findings runs the gate.

## Scoring

1. The score is computed from the findings that **survived** grounding, never taken from the model.
2. Penalties subtracted from 100: `CRITICAL` −35, `WARNING` −12, `SUGGESTION` −3. The result is clamped to 0–100.
3. Consequences that must stay true: no findings ⇒ 100; one suggestion ⇒ 97; one warning ⇒ 88; one critical ⇒ 65.
4. The score can never contradict the findings displayed with it.
5. `countBlockers` counts findings at or above a given severity gate and is the deterministic signal for pass/fail — not the model's verdict.

## Verdict

1. Allowed values: `request_changes`, `comment`, `approve`.
2. Merging partial reviews takes the **worst** verdict, ordered `request_changes` > `comment` > `approve`.

## Prompt assembly

1. Every optional slot follows omit-when-empty: an absent `skills`, `memory`, `specs`, `callers`, `repoMap`, or `prDescription` produces no section, so an unenriched prompt is byte-identical to the baseline.
2. All untrusted content is delimiter-wrapped through `wrapUntrusted`.
3. The PR description is truncated to a fixed character budget before wrapping.
4. The shared `INJECTION_GUARD` is appended to **every** agent's system prompt on every path.
5. Untrusted content claiming a finding is intentional, a demo, a test fixture, or not for production never reduces severity or scope.
6. Untrusted text is never keyword-scanned to decide safety.

## Structured output

1. Model output is validated against the `Review` schema from `@devdigest/shared`.
2. Output is extracted and repaired before parsing; parse failures are retried within a bounded budget.
3. Output that cannot be parsed after the retry budget fails the run — it is never coerced into a partial result.

## Purity

1. No database, GitHub, filesystem, or process-environment access anywhere in this package.
2. The only side effect is a call through the injected `LLMProvider`.
3. Cancellation is signalled by an injected `checkCancelled()` that throws; the engine defines no error type and performs no cleanup of caller state.
4. Callers depend only on the exports of `src/index.ts`.
