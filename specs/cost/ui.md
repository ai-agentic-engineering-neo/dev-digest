# UI-контракт: Cost — що саме додаємо і куди

**Статус: затверджено користувачем.** Зміни — лише за новим рішенням; під час реалізації відхилень від цього файлу не допускаємо (потрібне відхилення → спершу оновити контракт).

Звірено з макетом (`screen_dashboard.jsx`, `prdetail_runs.jsx`, `screen_trace.jsx`, `CostBadge` у `primitives.jsx`) і з поточним кодом клієнта. Специфікація: [spec.md](spec.md) · план: [plan.md](plan.md).
Усі шляхи — від `dev-digest/client/src/`; `P` = `app/repos/[repoId]/pulls`.

## 1. Нові файли (лише 2 компоненти/модулі + тести)
| Файл | Що це |
|---|---|
| `lib/format-cost.ts` | чиста функція `formatCost(usd, { digits? })` |
| `lib/format-cost.test.ts` | unit-тести формату |
| `components/cost-badge/CostBadge.tsx` | презентаційний компонент (без хуків, без i18n) |
| `components/cost-badge/index.ts` | `export { CostBadge } from "./CostBadge";` |
| `components/cost-badge/CostBadge.test.tsx` | `null` → «—», `0.014` → `$0.014`, `title` проп |

Нових екранів, сторінок, стилів-файлів і залежностей **немає**. Класи `.mono` і `.tnum` уже є в `vendor/ui/styles.css`.

## 2. Змінюються існуючі файли (одна точка вставки в кожному)
| # | Файл | Зміна |
|---|---|---|
| 1 | `P/constants.ts` | `COLUMN_KEYS`: `"cost"` між `"status"` і `"updated"`; `GRID`: `"1fr 132px 92px 60px 118px 76px 78px"` |
| 2 | `P/_components/PRRow/PRRow.tsx` | нова комірка після Status |
| 3 | `P/[number]/_components/RunHistory/RunHistory.tsx` | рядок під часом у правій колонці |
| 4 | `P/[number]/_components/ReviewRunAccordion/ReviewRunAccordion.tsx` | `CostBadge` між score і часом |
| 5 | `P/[number]/_components/RunTraceDrawer/_components/TraceBody/TraceBody.tsx` | `Stat` COST між TOKENS і FINDINGS |
| 6 | `messages/en/prReview.json` | `list.columns.cost`, `list.costTitle`, `timeline.runCost` |
| 7 | `messages/en/runs.json` | `trace.stat.cost` |
| 8 | `vendor/shared/contracts/{trace,review-api,platform}.ts` | поля `cost_usd` (клієнтська копія; серверна — ідентично) |

**Не чіпаємо:** `vendor/ui/**`, `FilterBar`, `styles.ts` (комірка Cost не потребує нового стилю — обгортка `<div>` як у сусідніх колонок), інші колонки, `VerdictBanner`, Compose-футер, Multi-Agent.

## 3. Код (точний, як буде написано)

### 3.1 `lib/format-cost.ts` — рівно за макетом
```ts
/** `usd` null/undefined → «—». Без digits: <$1 → 3 знаки, ≥$1 → 2 знаки. З digits → toFixed(digits). */
export function formatCost(usd: number | null | undefined, opts?: { digits?: number }): string {
  if (usd == null) return "—";
  if (opts?.digits != null) return "$" + usd.toFixed(opts.digits);
  return usd < 1 ? "$" + usd.toFixed(3) : "$" + usd.toFixed(2);
}
```

### 3.2 `components/cost-badge/CostBadge.tsx` — з `primitives.jsx`
```tsx
import { formatCost } from "@/lib/format-cost";

/** Compact spend display. `usd` null/undefined ⇒ em-dash (no run / unknown price). */
export function CostBadge({ usd, title }: { usd: number | null | undefined; title?: string }) {
  if (usd == null) {
    return <span className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>;
  }
  return (
    <span
      className="mono tnum"
      title={title}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-secondary)", fontWeight: 500 }}
    >
      {formatCost(usd)}
    </span>
  );
}
```
З дизайн-версії свідомо не переносимо `size="lg"`, `muted`, `tokens` — у наших чотирьох місцях вони не використовуються (додамо, коли з'явиться споживач).

### 3.3 Список PR — `PRRow.tsx` (після блоку Status, перед Updated) + заголовок
```tsx
<div>
  <Badge dot color={st.c} bg="transparent">{t(`list.status.${st.labelKey}`)}</Badge>
</div>
<div>                                                   {/* ← НОВЕ */}
  <CostBadge usd={pr.cost_usd} title={t("list.costTitle")} />
</div>
<div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>
```
Заголовок колонки з'являється автоматично з `COLUMN_KEYS` (`list.columns.cost` = «Cost»). Остання колонка (Updated) і далі вирівняна праворуч.

### 3.4 Таймлайн — `RunHistory.tsx` (права колонка, під часом; лише `status === "done"`)
```tsx
<div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
  {r.ran_at && <span>{new Date(r.ran_at).toLocaleTimeString()}</span>}
  {settled && (                                          {/* ← НОВЕ */}
    <span className="mono tnum" style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3 }}>
      {t("timeline.runCost", { tokens: (r.tokens_in ?? 0).toLocaleString(), cost: formatCost(r.cost_usd, { digits: 4 }) })}
    </span>
  )}
</div>
```
Приклад на екрані: `9,119 tok · $0.0013`. Невідома вартість → `9,119 tok · —`.

### 3.4a Акордеон Review Runs — `ReviewRunAccordion.tsx`
```tsx
{review.score != null && (<Badge mono color="var(--text-secondary)">{review.score}</Badge>)}
<CostBadge usd={review.cost_usd} title="Cost of this review" />   {/* ← НОВЕ, між score і часом */}
<span className="mono" ...>{formatWhen(review.created_at)}</span>
```

### 3.5 Панель запуску — `TraceBody.tsx`
```tsx
<Stat label={t("trace.stat.duration")} val={formatSeconds(stats.duration_ms)} />
<Stat label={t("trace.stat.tokens")}   val={formatTokens(stats.tokens_in, stats.tokens_out)} />
<Stat label={t("trace.stat.cost")}     val={formatCost(stats.cost_usd, { digits: 2 })} />   {/* ← НОВЕ */}
<Stat label={t("trace.stat.findings")} val={stats.findings} />
```
Використовує наявний `Stat` з `atoms.tsx` (плитка `flex: 1`) — нових стилів немає; ряд стає з чотирьох плиток замість трьох.

### 3.6 i18n
```jsonc
// messages/en/prReview.json
"list": { "columns": { …, "status": "Status", "cost": "Cost", "updated": "Updated" }, "costTitle": "Cost of this review", … }
"timeline": { …, "runCost": "{tokens} tok · {cost}" }
// messages/en/runs.json
"trace": { "stat": { "duration": "DURATION", "tokens": "TOKENS", "cost": "COST", "findings": "FINDINGS" } }
```

## 4. Тести, які змінюються/додаються
- Нові: `format-cost.test.ts`, `CostBadge.test.tsx`.
- Оновлюються: `RunHistory.test.tsx` (фікстура `cost_usd`; рядок `9,119 tok · $0.0013`; `null` → `—`), `RunTraceDrawer.test.tsx` (COST `$0.06`; старий трейс без поля → «—»).
- Додаються: кейс колонки Cost у `PRRow` (список) і `CostBadge` в `ReviewRunAccordion`.

## 5. Що це дає в UI (звірка з макетом)
| Місце | Макет | Наша реалізація |
|---|---|---|
| Список PR | колонка «Cost» після Status, `CostBadge` | так (без колонок Findings/Run review — їх у starter нема) |
| Таймлайн | `9,119 tok · $0.0013` під часом | так, `digits: 4` |
| Review Runs | `CostBadge` між score і часом | так |
| Run Trace | DURATION · TOKENS · COST · FINDINGS, `$0.06` | так, `digits: 2` |
