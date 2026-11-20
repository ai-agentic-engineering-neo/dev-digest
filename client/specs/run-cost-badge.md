# Run Cost Badge — client (M1)

Дані й контракт → [`server/specs/run-cost-badge.md`](../../server/specs/run-cost-badge.md).
Поля `cost_usd` на `RunSummary`, `RunStats` і `PrMeta` треба додати в `client/src/vendor/shared`
(обидві копії контракту оновлюються разом).

## Три екрани (за дизайном)
| # | Екран | Що показуємо | Приклад |
|---|---|---|---|
| 1 | Список PR (`pulls/page.tsx` + `PRRow`) | колонка **COST** = сума всіх run-ів PR | `$0.012` |
| 2 | Timeline на PR Detail (`RunHistory`) | під часом запуску, праворуч: токени (in+out) · cost | `9,119 tok · $0.0013` |
| 3 | Drawer «Agent run · …» (`TraceBody`, секція Stats) | плитка **COST** між TOKENS і FINDINGS | `$0.06` |

## Формат — одна функція `formatCost(usd: number | null | undefined): string`
- `null` / `undefined` → `—`. Ніколи не `$0.00` для прогону без даних.
- `< $1` → 3 значущі цифри без хвостових нулів: `0.0013 → $0.0013`, `0.012345 → $0.0123`, `0.06 → $0.06`.
  Реалізація: `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 3 })`.
- `≥ $1` → 2 знаки після коми: `$1.50`.
- `0` → `$0`. Це справжні дані (безкоштовна модель), а не «немає даних».

Дизайн тут непослідовний: список показує `$0.003` (3 знаки після коми), timeline — `$0.0013` (4 знаки),
drawer — `$0.06`. Беремо одне правило (3 значущі цифри) для всіх трьох екранів. Воно збігається з дизайном
у типових значеннях (`$0.014`, `$0.041`, `$0.0013`) і виконує вимогу «≥3 значущі цифри». Фіксовані
3 знаки після коми для дешевого прогону ($0.0003) показали б `$0.000`, тобто фейковий нуль.

Токени в timeline: `(tokens_in + tokens_out).toLocaleString('en-US') + ' tok'`.
У drawer токени лишаються як є (`formatTokens`: `15k→1.2k`).

## Компонент `RunCostBadge` (2 види)
Місце: `app/repos/[repoId]/pulls/_components/RunCostBadge/`. Туди ж кладемо `formatCost`
(helpers.ts), бо його використовують і список, і PR Detail.
- `variant="compact"` — `$0.012` (екран 1).
- `variant="full"` — `9,119 tok · $0.0013` (екран 2).
- Стиль: `mono`, `var(--text-muted)`, 11–12px, як час у рядку timeline.

Drawer використовує `formatCost` в наявному `<Stat>`, бадж там не потрібен.

## Зміни по екранах
1. **Список PR**
   - `constants.ts`: `COLUMN_KEYS` += `"cost"` **після `status`, перед `updated`** (як на дизайні).
     У `GRID` додати колонку (~80px) між status і updated.
   - `PRRow`: комірка `<RunCostBadge variant="compact" usd={pr.cost_usd} />` (mono, `var(--text-secondary)`).
     PR без жодного запуску з ціною → `—` (на дизайні так у #460).
   - На дизайні списку є ще колонка FINDINGS і кнопка Run Review у кожному рядку. Це не частина
     цієї фічі, out of scope.
   - `messages/en/prReview.json`: `list.columns.cost = "Cost"`.
2. **Timeline** — `RunHistory`, права колонка (там уже є `ran_at`): другий рядок
   `<RunCostBadge variant="full" …/>`, **тільки для `status === "done"`**.
   Для error / cancelled / running лишається тільки час, як на дизайні.
3. **Drawer** — `TraceBody`: `<Stat label={t("trace.stat.cost")} val={formatCost(stats.cost_usd)} />`
   між tokens і findings; i18n `trace.stat.cost = "Cost"` (у тому ж namespace, що й `trace.stat.tokens`).

## Тести (vitest + RTL)
- `formatCost`: null → `—`, `0` → `$0`, `0.0013`, `0.012345`, `0.06`, `1.5 → $1.50`.
- `RunHistory.test.tsx`: done-run показує `… tok · $…`, failed-run не показує cost; у фікстурі додати `cost_usd`.
- `RunTraceDrawer.test.tsx`: плитка Cost є; старий trace без `cost_usd` → `—`.

## Acceptance (чекліст лаби)
- [ ] **Звірка цифр:** cost у drawer = рядок `Cost:` у вкладці log = OpenRouter dashboard (на одному прогоні).
- [ ] **Формат читабельний:** ≥3 значущі цифри (`$0.012`, а не `$0.01`).
- [ ] **Stale / незавершений прогін:** без фейкової ціни, `—` або нічого.
- [ ] Кожен завершений прогін показує бадж; у списку PR колонка Cost.

## Відкрите питання
Слайд лаби згадує ще **рядок у плашці вердикту** на PR Detail (`$0.014 · 8.2K→1.3K`, `VerdictBanner`).
У трьох екранах завдання його немає, тому поки out of scope. Якщо треба, це одна
`<RunCostBadge variant="full">` у `VerdictBanner`.
