# Plan — Run cost (M1)

Spec: [run-cost.md](run-cost.md). Порядок: data → API → UI (кожен крок самодостатній і перевірюваний).

## Step 1 — DB + запис вартості (server)
1. `server/src/db/schema/runs.ts`: `costUsd: numeric('cost_usd', { precision: 12, scale: 6 })` (nullable). Drizzle повертає numeric як string → конвертувати в `number | null` у repo.
2. `pnpm db:generate` (нова міграція `0010_*`, наявні не чіпати) → `pnpm db:migrate` локально.
3. `reviews/repository/run.repo.ts`: `completeAgentRun` приймає `costUsd?: number | null`, пише `cost_usd` (`null` на failed/cancelled).
4. `reviews/run-executor.ts`: передати `outcome.costUsd` у `completeAgentRun` (успішна гілка) і в `trace.stats.cost_usd`; у catch-гілці — `null`.
5. Тест: unit/it на `completeAgentRun` + `listRunsForPull` повертає `cost_usd`.

## Step 2 — Контракти (shared, обидві копії)
- `PrMeta.cost_usd`, `RunSummary.cost_usd`, `RunStats.cost_usd?` у `server/src/vendor/shared` і **вручну** в `client/src/vendor/shared` (перевірити `diff -rq` до/після, не перезаписувати дрейфнуті файли).

## Step 3 — API (server)
- `run.repo.ts → listRunsForPull`: додати `cost_usd: run.costUsd == null ? null : Number(run.costUsd)`.
- `modules/pulls/routes.ts` (`GET /repos/:id/pulls`): додатковий запит `SELECT pr_id, SUM(cost_usd) FROM agent_runs WHERE pr_id IN (…) AND workspace_id = … GROUP BY pr_id` (SUM ігнорує NULL; якщо всі NULL → `null`). Додати `cost_usd` у відповідь.
- Тест `*.it.test.ts` (testcontainers): PR з 2 run-ами → сума; PR з усіма NULL → `null`; PR без run-ів → `null`.

## Step 4 — Клієнт: helper + компонент
1. `lib/format-cost.ts` (+ тест): `formatCost`, уніфікований `formatTokens` (K/великі літери за дизайном).
2. `RunCostBadge` (`compact` / `detailed`) + `RunCostBadge.test.tsx` (null → `—`, 0 → `$0.00`, малі/великі суми).
3. Рядки в `messages/en/prReview.json`.

## Step 5 — Клієнт: три екрани
1. **PR list**: `GRID` + колонка COST у header (`pulls/page.tsx`) і `PRRow` (`<RunCostBadge variant="compact" />`).
2. **Run history / verdict**: `RunHistory` (рядок run-а: `tok · cost`), `VerdictBanner`/`ReviewRunAccordion` (`variant="detailed"`; пошук run за `review.run_id` у `runs`). Оновити `RunHistory.test.tsx`, `VerdictBanner.test.tsx`.
3. **Trace drawer**: `TraceBody` → `<Stat label=cost val=formatCost(stats.cost_usd) />`; оновити `RunTraceDrawer.test.tsx`.

## Step 6 — Перевірка
- `server`: `pnpm typecheck && pnpm exec vitest run --exclude '**/*.it.test.ts'` + `pnpm exec vitest run .it.test` (Docker).
- `client`: `pnpm typecheck && pnpm test`.
- Ручна: `./scripts/dev.sh`, запустити ревʼю → cost у трьох місцях; старий run → `—`; (опційно) e2e-флоу в `e2e/`.
- Незалежний reviewer/verifier pass перед завершенням.
- Наприкінці — `/engineering-insights` (server + client INSIGHTS.md; зокрема: numeric→string у Drizzle, прибрати запис «Cost UI removed» як виконаний).

## Ризики
| Ризик | Мітигація |
|---|---|
| `costUsd` = `null`, якщо хоч один LLM-виклик без ціни | Прийнято: `—`. Не підміняти нулем |
| Дрейф `vendor/shared` | Точкові правки + `diff -rq` |
| Drizzle numeric → string | Явний `Number()` у repo, тест |
| Старі run-и без cost | `NULL` → `—`, без backfill |
| Ширина колонок у списку PR | Перевірити `GRID` на дизайні (екран 1) |
