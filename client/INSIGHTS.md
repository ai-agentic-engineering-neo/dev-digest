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

## Session Notes

## Open Questions
