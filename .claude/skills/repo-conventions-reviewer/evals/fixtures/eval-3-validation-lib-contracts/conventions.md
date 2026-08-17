# Accepted conventions — validation-lib

These conventions were already extracted and accepted for this repo. Each is
backed by a real file:line citation into `repo/`.

1. **contract** — Validator functions return `{ valid: boolean; errors: string[] }`;
   they never throw and never return a bare boolean.
   Evidence: `src/validation/emailValidator.ts:8-13`, `src/validation/phoneValidator.ts:8-13`.

2. **testing** — Every exported validator has a co-located `*.test.ts` file
   in the same folder covering at least one accept and one reject case.
   Evidence: `src/validation/emailValidator.test.ts`, `src/validation/phoneValidator.test.ts`.

3. **config-access** — Environment variables are read only through
   `getEnv()` from `src/config/env.ts`; no direct `process.env.X` access
   elsewhere.
   Evidence: `src/config/env.ts:1-3`.

4. **exports** — `src/validation/index.ts` re-exports each validator by name
   (`export { x } from './x'`); no `export *`.
   Evidence: `src/validation/index.ts:1-2`.
