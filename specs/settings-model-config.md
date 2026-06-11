# Специфікація: Конфігурація моделей у Settings (DevDigest)

> **Статус:** готова до роботи · **Дата:** 2026-06-11
> **Пов'язано:** `apps/specs/ai-pr-reviewer.md` (рушій рев'ю + вибір моделі для агентів), перемикання Onboarding на OpenRouter (`server/src/modules/onboarding/constants.ts`)

## Зміст
1. [Мета й бачення](#1-мета-й-бачення)
2. [Стан коду: що вже є (НЕ переписувати)](#2-стан-коду)
3. [Зафіксовані рішення](#3-зафіксовані-рішення)
4. [Фіча 1 — per-feature вибір моделі](#4-фіча-1)
5. [Фіча 2 — живі ціни з OpenRouter](#5-фіча-2)
6. [Фіча 3 — статус API-ключів](#6-фіча-3)
7. [Фіча 4 — наповнення порожніх секцій](#7-фіча-4)
8. [Контракти й дані](#8-контракти)
9. [План реалізації](#9-план-реалізації)
10. [Тестування](#10-тестування)
11. [Відкриті питання](#11-відкриті-питання)

---

## 1. Мета й бачення

Прибрати хардкод **моделей** і **цін** із коду застосунку. Сьогодні кожна системна
LLM-фіча зашита на конкретного провайдера/модель у своїх `constants.ts`, а ціни лежать
у статичній таблиці `adapters/llm/pricing.ts`. Через це:

- зміна моделі = правка коду + редеплой (саме так ми гасили `429` від OpenAI в Onboarding);
- ціни в таблиці застарівають і розходяться з реальним курсом OpenRouter.

**Ціль:** у Settings зʼявляється секція, де для кожної системної фічі обирається модель
зі **списку OpenRouter із живими цінами**; ціни для атрибуції вартості теж тягнуться з
OpenRouter, а не хардкодяться. Плюс — закрити дрібні борги Settings: показати статус
введених ключів і наповнити порожні секції.

## 2. Стан коду: що вже є (НЕ переписувати)

Велика частина інфраструктури вже існує — фіча здебільшого **зшиває** наявне:

- **Список моделей + ціни з OpenRouter.** Роут `GET /providers/:id/models`
  (`server/src/modules/agents/routes.ts:132`) → `service.listModels(provider)`
  (`agents/service.ts:139`) → `OpenRouterProvider.listModels()`
  (`reviewer-core/src/llm/openrouter.ts:116`), який парсить `pricing` з `/models`
  (USD за 1M токенів) і деградує до `[]` без ключа.
- **Хук + рендер пікера.** `useProviderModels(provider)`
  (`client/src/lib/hooks/agents.ts:100`, `staleTime` 5 хв) і `modelLabel()`
  (`AgentEditor/.../ConfigTab/ConfigTab.tsx:19`), що форматує `$in/$out per 1M · ctx`.
  Компонент `SearchableSelect`/`SelectInput` із `@devdigest/ui`.
- **Сховище Settings.** Per-workspace key/value bag: `GET/PUT /settings`
  (`server/src/modules/settings/routes.ts`), схема `SettingsKnown` із `.passthrough()`
  (`vendor/shared/contracts/platform.ts:17-31`) — **нові ключі додаються вільно**.
  Хуки `useSettings` / `useUpdateSettings` (`client/src/lib/hooks.ts:20-33`).
- **Секрети.** `SecretsProvider.get/set` (`vendor/shared/adapters.ts:260`);
  `POST /settings/test-connection` зберігає BYO-ключ і перевіряє його
  (`settings/routes.ts:53`). `SECRET_KEY_BY_PROVIDER` (`settings/constants.ts:8`) уже
  включає `openrouter`. Контейнер уже вміє будувати `OpenRouterProvider`
  (`platform/container.ts:164-169`).
- **Секції Settings.** `SETTINGS_SECTIONS` (`client/src/vendor/ui/nav.ts:58`):
  `api-keys`, `github`, `workspace`, `automatic-reviews`, `integrations`, `plugins`,
  `about`. Реалізовані лише `api-keys`/`automatic-reviews`/`integrations`/`plugins`;
  решта падають у `EmptyState` (`SettingsView.tsx:54`).

## 3. Зафіксовані рішення

1. **Фічі з пікером — усі 5 системних** (PR-review-агенти НЕ чіпаємо, у них власний
   пікер у редакторі агента): `onboarding`, `review_intent`, `risk_brief`,
   `conformance`, `conventions`.
2. **Джерело списку — тільки OpenRouter, живі ціни.** Провайдер у пікері фіксований
   (`openrouter`); користувач обирає лише модель.
3. **Ціни не хардкодимо** для моделей, які реально використовуємо: атрибуція вартості
   для OpenRouter бере живі ціни (з кешу), статична таблиця лишається тільки фолбеком
   для OpenAI/Anthropic (їхні API ціни не віддають) і на випадок недоступності мережі.
4. **Наповнюємо всі 3 порожні секції:** Workspace, GitHub Integration, About.
5. **Скоуп зберігання — per-workspace** (як решта Settings).

## 4. Фіча 1 — per-feature вибір моделі

**Реєстр фіч (shared).** Додати в `@devdigest/shared` (обидві копії vendor, див. §8)
константу-реєстр і enum id:

```ts
export const FEATURE_MODELS = [
  { id: 'onboarding',    label: 'Onboarding Tour',  defaultProvider: 'openrouter', defaultModel: 'deepseek/deepseek-v4-flash' },
  { id: 'review_intent', label: 'PR Review · Intent', defaultProvider: 'openai',   defaultModel: 'gpt-4.1' },
  { id: 'risk_brief',    label: 'Risk Brief',       defaultProvider: 'openai',     defaultModel: 'gpt-4.1' },
  { id: 'conformance',   label: 'Conformance',      defaultProvider: 'openai',     defaultModel: 'gpt-4.1' },
  { id: 'conventions',   label: 'Conventions',      defaultProvider: 'openai',     defaultModel: '<provider default>' },
] as const;
export const FeatureModelId = z.enum(['onboarding','review_intent','risk_brief','conformance','conventions']);
```

> Дефолти = поточні значення констант кожного модуля, тож **поведінка без override не
> змінюється**. `label` і `id` потрібні клієнту для рендера панелі.

**Ключ у Settings.** Розширити `SettingsKnown`:

```ts
feature_models: z.record(FeatureModelId, z.object({ provider: Provider, model: z.string() })).default({}),
```

Пікер завжди пише `provider: 'openrouter'`; незаданий id → дефолт із реєстру.

**Серверний резолвер.** Новий `server/src/modules/settings/feature-models.ts`:

```ts
resolveFeatureModel(container, workspaceId, id): Promise<{ provider: Provider; model: string }>
```

читає рядки `settings` для воркспейса (той самий запит, що в `settings/routes.ts:27`),
повертає `feature_models[id]` або дефолт із реєстру.

**Перемкнути 5 call-site'ів** із модульних констант на резолвер (фолбек на дефолти):

| id | константи зараз | читається тут |
|---|---|---|
| `onboarding` | `onboarding/constants.ts:70` | `onboarding/service.ts:169,174` |
| `review_intent` | `reviews/constants.ts:39` | `reviews/intent.ts:21-22` |
| `risk_brief` | `brief/constants.ts:11` | `brief/service.ts:100` |
| `conformance` | `conformance/constants.ts:10` | `conformance/service.ts:49` |
| `conventions` | `conventions/constants.ts:104` | `conventions/service.ts:48` |

Кожен call-site має (або отримує) `workspaceId` — для `onboarding` він уже є
(`service.ts:88`); для решти — протягнути з контексту запуску/репо.

**UI.** Нова секція Settings **Feature Models** (`{ key: 'models', label: 'Feature Models' }`
у `nav.ts:58`, кейс у `SettingsView.tsx`). Панель `SettingsModels`: по рядку на кожен
`FEATURE_MODELS`; `useProviderModels('openrouter')` → `SearchableSelect` з `modelLabel`
(винести `modelLabel` зі `ConfigTab` у спільний util). Вибір пише
`feature_models[id] = { provider:'openrouter', model }` через `useUpdateSettings`; поточне
значення — з `useSettings`.

## 5. Фіча 2 — живі ціни з OpenRouter

**Для відображення** ціни вже живі — `useProviderModels('openrouter')` повертає
`pricing` у `ModelInfo`; нічого хардкодити не треба.

**Для атрибуції вартості** (логи `costUsd`, рядок run-а) — новий
`server/src/platform/price-book.ts`:

- TTL-кеш (~6 год) мапи `model → { in, out }`, наповнюється з
  `OpenRouterProvider.listModels()` (поле `pricing`);
- `estimate(model, tokensIn, tokensOut)`: для OpenRouter-моделей — жива ціна з кешу,
  далі фолбек на статичну `adapters/llm/pricing.ts`, далі `null`;
- інжектиться в `container.ts:169` як `estimateCost`, що передається в `OpenRouterProvider`
  (підпис `reviewer-core` не змінюється — він уже приймає інжектований естиматор).

Статична таблиця `pricing.ts` лишається **лише** для OpenAI/Anthropic і офлайн-фолбеку.

## 6. Фіча 3 — статус API-ключів

- Сервер: `GET /settings/secrets-status` → `SecretsStatus` (`{ openai, anthropic,
  openrouter, github: boolean }`): для кожного ключа з `SECRET_KEY_BY_PROVIDER` —
  `Boolean(await secrets.get(KEY))`. **Ніколи не віддавати значення ключа.**
- Клієнт: хук `useSecretsStatus()` (`GET /settings/secrets-status`), інвалідація після
  успішного `useTestConnection`. У `SettingsApiKeys` — бейдж "Configured" (зелений) /
  "Not set" (сірий) у кожному `KeyRow`.

## 7. Фіча 4 — наповнення порожніх секцій

Нові компоненти під `client/.../SettingsView/_components/`:

- **`SettingsWorkspace`** — форма над уже наявними преференсами `SettingsKnown`, які
  сьогодні **не мають UI**: `theme` (dark/light), `density` (regular/compact),
  `polling_interval_min` (число), `sync_to_folder` (Toggle). Через
  `useSettings`/`useUpdateSettings`.
- **`SettingsGitHub`** — статус підключення з `useSecretsStatus().github` (+ `@login`
  через `test-connection`), к-сть підключених репо (наявний repos-хук), дефолтна
  гілка/інтервал полінгу, CTA-лінк на API Keys для введення PAT.
- **`SettingsAbout`** — версія застосунку (`client/package.json`), лінки на docs/repo,
  таблиця «фіча → провайдер/модель» (читає `feature_models` + дефолти реєстру).

## 8. Контракти й дані

- `@devdigest/shared` **дублюється** в `server/src/vendor/shared` і
  `client/src/vendor/shared` (резолвиться через tsconfig `paths`). Усі зміни контрактів
  (`FEATURE_MODELS`, `FeatureModelId`, `feature_models` у `SettingsKnown`, `SecretsStatus`)
  правити в **обох** копіях.
- `SettingsKnown.passthrough()` дозволяє новий ключ без міграції БД (`settings` — це
  key/value). Значення `feature_models` серіалізується як JSON у колонку `value`.

## 9. План реалізації

1. **Контракти** (shared × 2): `FEATURE_MODELS`, `FeatureModelId`, `feature_models`,
   `SecretsStatus`.
2. **Сервер:** `feature-models.ts` (резолвер); перемкнути 5 call-site'ів; `price-book.ts`
   + інжекція в контейнер; `GET /settings/secrets-status`.
3. **Клієнт — хуки/типи:** `useSecretsStatus`, ре-експорт `FEATURE_MODELS`/`SecretsStatus`;
   винести `modelLabel` у спільний util.
4. **Клієнт — секції:** `models` у `nav.ts` + `SettingsView`; панелі `SettingsModels`,
   `SettingsWorkspace`, `SettingsGitHub`, `SettingsAbout`; бейджі в `SettingsApiKeys`.
5. **i18n:** ключі `settings.*` (en + uk) для нових панелей за зразком `settings.apiKeys.*`.

## 10. Тестування

- Сервер (vitest, за зразком `test/routes-smoke.test.ts`): `secrets-status` повертає
  булеві й **ніколи значення**; `resolveFeatureModel` повертає override і фолбек на дефолт;
  `PriceBook.estimate` віддає живу ціну, далі статичну, далі `null`.
- E2E вручну: ввести `OPENROUTER_API_KEY` в API Keys (бейдж → "Configured"); відкрити
  **Settings → Feature Models**, переконатися, що селекти показують моделі OpenRouter із
  `$in/$out per 1M · ctx`; обрати модель для Onboarding; **Regenerate** Onboarding Tour —
  у лозі run-а `costUsd` ненульовий і порахований за живою ціною; перевірити, що
  Workspace / GitHub Integration / About показують реальний вміст.

## 11. Відкриті питання

- Узгодження ціни в збереженому `feature_models` зі статичною таблицею (джерело істини —
  жива ціна; статична лише для не-OpenRouter).
- Чи показувати в пікері «безкоштовні» моделі OpenRouter (free-tier rate limits) — за
  замовчуванням так, але з підписом про ліміти.
- Скоуп: per-workspace зараз; чи потрібен per-user override — поза скоупом MVP.
