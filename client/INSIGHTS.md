# INSIGHTS — non-obvious lessons: package client

Append-only log: entries are only ADDED to the end of a section via `node .claude/skills/engineering-insights/scripts/insights.mjs append`; existing ones are never edited or deleted (the guard hook blocks Write/Edit that change text).
Format: `- YYYY-MM-DD · <area> · <fact/symptom> → ALWAYS/NEVER <action>, because <reason> · <evidence: path + symbol / command / error text>` (trailing `[?]` = hypothesis, not yet confirmed).
Selection rules, review and promotion to CLAUDE.md — skill `engineering-insights`. This is a draft under human review, not the truth.

## What Works

## What Doesn't Work

## Codebase Patterns

- 2026-11-20 · i18n in shared components · component tests wrap only their own namespace (e.g. NextIntlClientProvider messages={{ prReview }}), so a shared component under src/components that calls useTranslations('common') breaks every consumer's test → keep shared components presentational and take already-translated strings as props, because the caller owns the namespace · RunCostBadge tokensLabel prop, RunHistory.test.tsx

## Tool & Library Notes

- 2026-11-20 · pnpm · global pnpm ≥11 ignores the package.json "pnpm.overrides" field, so `pnpm install --frozen-lockfile` fails with ERR_PNPM_LOCKFILE_CONFIG_MISMATCH and every `pnpm <script>` with ERR_PNPM_VERIFY_DEPS_BEFORE_RUN → run `npx -y pnpm@10 install --frozen-lockfile` / `npx -y pnpm@10 test`, because pnpm 10 still honours the field and leaves pnpm-lock.yaml untouched · run-cost feature session, client/package.json pnpm.overrides

## Recurring Errors & Fixes

- 2026-11-20 · FindingCard tests · stderr 'Updating a style property during rerender (borderColor) when a conflicting property is set (borderLeftColor)' appears in any test that changes which card is focused (j/k, filtering a FindingsPanel list) → treat it as pre-existing noise, not a regression from your change; the fix is splitting the border shorthand in FindingCard/styles.ts, because the focused style swaps border while borderLeftColor carries the severity color · FindingCard/styles.ts:13, FindingsPanel.test.tsx severity-counter tests
- 2026-11-20 · @devdigest/shared runtime import · importing a VALUE (e.g. the Zod enum Severity.options) from @devdigest/shared in client code passes tsc and vitest but the Next dev build 500s with 'Module not found: Can't resolve ./contracts/findings.js', because the vendored barrel re-exports with .js extensions that webpack can't map to .ts → keep client imports from @devdigest/shared type-only (import type) and mirror needed values locally typed as Record<Severity, …> so tsc still enforces the contract; ALWAYS open the page in the browser after adding a non-type import there · FindingsPanel/constants.ts SEVERITY_LEVELS, src/vendor/shared/index.ts

## Session Notes

## Open Questions
