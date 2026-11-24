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
- 2026-11-24 · Next.js / next-intl docs · nextjs.org and next-intl.dev now document Next 16 and next-intl v4 (proxy.ts instead of middleware.ts, refresh()/updateTag(), next/root-params), while client pins next ^15.5 and next-intl ^3.26 → check client/package.json before copying any example from the live docs and translate 16/v4-only APIs back (middleware.ts, src/i18n/request.ts), because those examples compile-fail or silently do nothing on our versions · frontend-ui-architecture research, skill references/nextjs.md 'Version traps'

## Recurring Errors & Fixes

- 2026-11-20 · FindingCard tests · stderr 'Updating a style property during rerender (borderColor) when a conflicting property is set (borderLeftColor)' appears in any test that changes which card is focused (j/k, filtering a FindingsPanel list) → treat it as pre-existing noise, not a regression from your change; the fix is splitting the border shorthand in FindingCard/styles.ts, because the focused style swaps border while borderLeftColor carries the severity color · FindingCard/styles.ts:13, FindingsPanel.test.tsx severity-counter tests
- 2026-11-20 · @devdigest/shared runtime import · importing a VALUE (e.g. the Zod enum Severity.options) from @devdigest/shared in client code passes tsc and vitest but the Next dev build 500s with 'Module not found: Can't resolve ./contracts/findings.js', because the vendored barrel re-exports with .js extensions that webpack can't map to .ts → keep client imports from @devdigest/shared type-only (import type) and mirror needed values locally typed as Record<Severity, …> so tsc still enforces the contract; ALWAYS open the page in the browser after adding a non-type import there · FindingsPanel/constants.ts SEVERITY_LEVELS, src/vendor/shared/index.ts
- 2026-11-20 · React style shorthands (supersedes the earlier FindingCard borderColor entry: now fixed) · borderColor / borderWidth / padding / margin are shorthands for all four sides, so pairing borderColor with borderLeftColor still triggers 'Updating a style property during rerender (borderColor) when a conflicting property is set (borderLeftColor)' even with no 'border' shorthand in sight → when one side differs, write every side as a longhand (borderTopColor/Right/Bottom/Left), because React diffs inline styles per key and re-setting the shorthand on rerender wipes the side override · FindingCard/styles.ts card()

## Session Notes

## Open Questions
