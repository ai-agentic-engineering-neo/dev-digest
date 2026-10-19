# Spec: Conventions extractor (L02)

Статус: Implemented · 2026-10-19 · пакети: `server`, `client` (+ seed, e2e, docs)

## 1. Context
Конвенції — це house-rules репозиторію (naming, error handling, структура,
імпорти, типи, тести, стиль), які модель знаходить у вибірці файлів. Кожен
кандидат має **один перевірений рядок коду** як доказ. Прийняті кандидати
збираються в **один** скіл (`type: convention`, `source: extracted`), який
прив'язується до агентів механізмом зі `specs/skills.md`.

До L02 вже існували заготовки: таблиця `conventions`, контракт
`ConventionCandidate`, `repoIntel.getConventionSamples()`, рядки
`messages/en/conventions.json`, `FeatureModelId 'conventions'`,
`skills.source='extracted'`, `skills.evidence_files`.

**Довіра.** Модель лише пропонує. Вміст файлів іде в промпт у `<untrusted>`,
а доказ перевіряє код. Кандидат без знайденої цитати відкидається. Сніпет
вирізається з реального файлу. Шлях, що виходить за межі клону, відкидається.
Скіл стає інструкцією агента лише після того, як юзер сам прийме кандидатів і
збереже скіл.

## 2. User stories
- Як автор агентів, я запускаю аналіз репозиторію на конвенції (Run extraction /
  Re-scan) і бачу прогрес.
- Я бачу всі знайдені конвенції: категорію, правило, `path:line` з посиланням на
  GitHub, сніпет і confidence.
- Я роблю accept / reject окремої конвенції (з Undo) або всіх pending одразу.
- Я редагую конкретну конвенцію (rule, категорія, сніпет), і вона стає accepted.
- З панелі «N conventions accepted · Create skill» я відкриваю модалку скіла з
  усіма прийнятими конвенціями.
- У модалці я редагую текст майбутнього скіла й метадані (name, type,
  description, body), обираю, які конвенції включити і до яких агентів
  прив'язати. Потім зберігаю або скасовую.

## 3. UI
| # | Екран | Місце | Компонент |
|---|-------|-------|-----------|
| 1 | Sidebar | **SKILLS LAB → Conventions** (`g c`) | `vendor/ui/nav.ts` |
| 2 | `/repos/:repoId/conventions` | заголовок «Conventions in `<repo>`», «Detected from N sample files · last scan …», Re-scan, Accept all (N) / Reject all | `ConventionsView` |
| 3 | там само | картка: бейдж категорії, rule, `MonoLink path:line`, сніпет, confidence-бар; Accept as Skill · Edit first · Reject; для resolved — бейдж + Undo | `ConventionCard` |
| 4 | там само | інлайн «Edit first»: rule, категорія, сніпет → Save & accept | `ConventionEditor` |
| 5 | там само | липка панель «N conventions accepted · Create skill» | `CreateSkillBar` |
| 6 | модалка | Included conventions (чекбокси регенерують body) · `SkillForm` · Attach to agents → Save skill / Cancel | `CreateSkillFromConventionsModal` |

Перемикач репозиторію на цій сторінці лишає юзера на Conventions (`repoSwitchHref`).

## 4. Acceptance criteria
- **AC1** `GET /repos/:id/conventions` → `{scan, items}`: останній скан і кандидати
  (confidence desc). Невідомий репо → 404.
- **AC2** `POST /repos/:id/conventions/extract` → 202 `{scan: running}`. Відмова:
  - 409 `extract_in_progress`, якщо скан уже біжить. `running` старший за
    10 хв вважається `failed`.
  - 409 `repo_not_indexed`, якщо немає клону або source-зразків.
  - Помилка конфігурації ключа провайдера.
- **AC3** Відбір зразків робить **лише код**. Конфіги в корені клону за точними
  іменами (`CONFIG_FILES`: package.json, tsconfig, eslint, prettier, biome,
  editorconfig) + топ-12 файлів `getConventionSamples`. Кожен файл обрізається
  до 400 рядків і нумерується.
- **AC4** Один виклик моделі `ConventionExtraction` (модель з Settings → Feature
  Models → Conventions). Модель повертає `{category, rule, evidence_path, line,
  quote, confidence}`.
- **AC5** Перевірка доказів (`domain.verifyEvidence`). Кандидата відкидаємо, якщо:
  - шлях небезпечний або файлу немає в клоні (файли поза вибіркою дочитуються);
  - нормалізований `quote` не знайдено в `line ± 3`.

  Далі `line` переякорюється на справжній рядок, сніпет вирізається з файлу,
  confidence обмежується 0..1, дубль за rule прибирається, у списку лишається
  ≤20 кандидатів.
- **AC6** Re-scan в одній транзакції видаляє **всі** кандидати репо, вставляє нові
  (`pending`) і ставить скану `done`. Будь-яка помилка → скан `failed` з `error`.
- **AC7** `PATCH /conventions/:id` редагує rule / category / snippet / status;
  `POST /repos/:id/conventions/bulk {status}` змінює лише `pending` і повертає
  `{updated}`. Невалідний статус → 422.
- **AC8** `POST /skills` приймає `source: 'extracted'` і `evidence_files`.
  Extracted-скіл зберігається увімкненим. Прив'язка — `PUT /agents/:id/skills` з
  наявними зв'язками + новим (в кінці, enabled).
- **AC9** Seed: `acme/payments-api` має завершений скан (84 файли) і 3 кандидати з
  мокапу (91 / 85 / 78 %).
- **AC10** `INJECTION_GUARD` і grounding рев'ю не змінено. У промпті екстракції
  є власне правило: вміст `<untrusted>` — це дані.

## 5. Data & contract changes
- `conventions`: −`accepted`, +`category`, `evidence_line`, `status
  pending|accepted|rejected`, `created_at`, `updated_at`, індекс
  `(workspace_id, repo_id)`. Нова таблиця `convention_scans` (міграція `0013`).
- Контракти (обидві копії `vendor/shared`):
  - `ConventionCategory`, `ConventionStatus`, `ConventionScan`, `ConventionsList`,
    `ConventionUpdateBody`, `ConventionsBulkBody`;
  - `ConventionCandidate`: `accepted` → `status`, +`category`, `evidence_line`;
  - `SkillCreateBody.source` += `'extracted'`, +`evidence_files`.
- Клієнт імпортує з `@devdigest/shared` лише типи. Порядок категорій продубльовано
  в `conventions/constants.ts` під `satisfies Record<ConventionCategory, …>`.

## 6. Out of scope
- Кілька скілів зі знахідок (по одному на категорію). Майбутній перемикач у модалці.
- Інкрементальний re-scan і збереження рішень між сканами.
- Пошук конфігів глибше за корінь клону.

## 7. Test plan
- server unit `test/conventions-domain.test.ts`: `verifyEvidence` (зсув, відсутній
  файл / цитата, далекий рядок, тривіальна цитата, clamp, дедуп, ліміт),
  `safeRepoPath`, сервіс з in-memory store (вибірка, один виклик, 409, failed).
- server it `test/conventions.it.test.ts`: seed, edit / accept / reject / bulk,
  422, 409 без клону, extract → poll → done (неперевірені відкинуто, конфіги в
  промпті), extracted-скіл з `evidence_files`.
- client: `ConventionCard`, `CreateSkillFromConventionsModal`, `buildSkillBody`,
  `agoParts`, `repoSwitchHref`.
- e2e `09-conventions.flow.json` (read-only): sidebar → seed-картки → Edit first →
  Cancel.
