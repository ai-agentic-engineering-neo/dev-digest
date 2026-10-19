# Spec: Skills (L02)

Статус: Implemented · 2026-10-18 · пакети: `server`, `client` (+ seed, docs)

## 1. Context
Скіл — це перевикористовуваний блок інструкцій у markdown, який вставляється в
промпт кожного агента, до якого він прив'язаний. Скіл — **тільки текстова
конфігурація**: він нічого не виконує, не має інструментів і доступу до мережі.
Таблиці `skills` / `skill_versions` / `agent_skills` і секція
`## Skills / rules` у `reviewer-core` вже існували, але run-executor не передавав
скіли, а UI не було.

**Довіра.** Скіл — не дані, а інструкції, яких модель має слухатися, тому блок
скілів НЕ обгортається в `<untrusted>` (інакше `INJECTION_GUARD` змусив би модель
ігнорувати скіл). Чужий скіл = чужі інструкції в промпті агента, тож шлюз
довіри — імпорт: прев'ю → явне підтвердження → скіл зберігається **вимкненим**
з `source=imported` і бейджем «needs vetting». Виконувані частини архіву не
читаються й не запускаються.

## 2. User stories
- Як автор агентів, я бачу всі скіли сіткою карток (назва, тип, опис, перемикач)
  і відкриваю прев'ю збоку.
- Як автор, я створюю й редагую скіл (назва, директивний опис, тип, тіло в
  markdown); зміна тіла створює нову незмінну версію.
- Як автор, я імпортую `.md` або `.zip`, бачу прев'ю ядра (і що проігноровано) і
  зберігаю лише після підтвердження.
- Як автор, на вкладці Skills агента я прив'язую скіли, вмикаю/вимикаю їх і
  змінюю порядок — порядок = послідовність блоків у промпті.
- Як рецензент, у трасі прогону (Prompt assembly) я бачу блок скілів, які саме
  скіли увійшли і скільки токенів кожен додав.

## 3. UI
| # | Екран | Місце | Компонент |
|---|-------|-------|-----------|
| 1 | Sidebar | група **SKILLS LAB**: Skills, Agents | `vendor/ui/nav.ts` |
| 2 | `/skills` | сітка карток + пошук + «Add Skill ▾ (Create / Import)» | `app/skills/_components/SkillsListView` |
| 3 | `/skills` | прев'ю збоку: опис, тіло, версії, enable/edit/delete | `SkillPreviewDrawer` |
| 4 | `/skills` | редактор: name · description (підпис: «це інтерфейс скіла, пиши директивно») · type · body (Write/Preview) | `SkillEditorModal` + `SkillForm` |
| 5 | `/skills` | імпорт: файл → попередження про довіру → ядро → проігноровані файли → редагована форма → «Save as disabled skill» | `ImportSkillModal` |
| 6 | `/agents/:id?tab=skills` | «N of M enabled», фільтр, усі скіли воркспейсу, чекбокс, drag + ↑/↓ | `AgentEditor/_components/SkillsTab` |
| 7 | Run trace → Prompt assembly | токени біля кожного блоку; під Skills — список `name vN · T tok` | `PromptBlock`, `SkillsBreakdown` |

### 3.1 Agents screen (mockups, 2026-10-19)
- `/agents` і `/agents/:id` — один двопанельний екран (`AgentsWorkspace`): ліворуч
  «Agents» + «Add Agent ▾» (з нуля / шаблони) + пошук + картки; праворуч редактор
  або empty state «No agents yet» (Create your first agent · Start from template ▾).
  За наявності агентів `/agents` відкриває першого.
- Картка: назва + перемикач, опис, модель + «N skills», футер
  `N runs · X% accept · $Y avg` (з `agent_runs` і accepted/dismissed findings;
  невідоме не показується). `Agent.stats` у списку `/agents`.
- Редактор: заголовок + «Run Review ▾»; вкладки Config · Skills · Evals · Stats · CI
  (останні три — mount points для L06/L07). Config: Name, Description, Model,
  System prompt з лічильником `~N / 8,000 tokens`, Output schema; Provider /
  strategy / CI gate / repo intel / delete — у згорнутому «Advanced».

### 3.2 Skills screen (mockups, 2026-10-19)
- `/skills` і `/skills/:id` — один двопанельний екран (`SkillsWorkspace`), як Agents:
  ліворуч «Skills» + «Add Skill ▾» (Create · Import .md/.zip · Search community
  skills…) + пошук + картки; праворуч редактор або «No skills yet». `/skills`
  відкриває перший скіл.
- Картка: іконка в кольорі типу, назва + перемикач, опис, тип + джерело з іконкою,
  футер `N agents · X% pull · Y% accept` (`Skill.stats` у списку `/skills`).
  **pull** = частка завершених прогонів агентів з увімкненим зв'язком, у трасі
  яких (`prompt_assembly.skills_detail`) є цей скіл; **accept** = accepted /
  (accepted + dismissed) по findings прогонів, що включали скіл.
- Редактор: заголовок (назва, тип, `vN`, «Run on evals» — disabled до L06) і
  вкладки Config · Preview · Evals · Stats · Versions (`?tab=`).
  - Config: Name, Description, Type, тіло з нумерацією рядків, `name.md`,
    «unsaved», `~N tokens`; при зміні тіла — необов'язкова «Change note».
  - Preview: тіло як Markdown. Evals: mount point (L06).
  - Stats: `GET /skills/:id/stats` — Used by, Pull frequency, Accept rate,
    Findings (30d), агенти зі скілом, findings за категоріями (30 днів).
  - Versions: історія тіла; заголовок = change note або `+N / −M lines`; Diff
    відносно поточної; Restore = збереження старого тіла як НОВОЇ версії
    (`Restored vN`).
- Community drawer — лише точка входу з empty state (каталог — пізніший урок).
- Дані: `skill_versions.message` (міграція `0012`), `SkillUpdateBody.version_message`,
  `SkillVersion.message`, `Skill.stats?`, `SkillStats` (обидві копії `vendor/shared`).

## 4. Acceptance criteria
- **AC1** CRUD: `GET/POST /skills`, `GET/PUT/DELETE /skills/:id`; ім'я унікальне
  у воркспейсі (409). Зміна `body` → `version+1` + рядок `skill_versions` в одній
  транзакції (`GET /skills/:id/versions`).
- **AC2** `POST /skills/import/preview` нічого не зберігає. `.md` — парсинг
  frontmatter (`name`, `description`, `type`). `.zip` — ядро = `SKILL.md` у корені
  або в єдиній верхній теці; інші файли лише перелічуються (`executable` для коду
  та `scripts/`, інакше `not-core`), не розпаковуються. Ліміти: 1 MB файл,
  200 записів, 5 MB розпаковано, 512 KB ядро; ZIP64/шифрування/`..` відхиляються.
- **AC3** `POST /skills` з `source: "imported"` завжди створює `enabled=false`.
- **AC4** `PUT /agents/:id/skills {items:[{skill_id, enabled}]}` замінює набір
  зв'язків у транзакції, `order` = індекс; чужі/дубльовані id → 422.
- **AC5** У промпт потрапляють лише скіли, де зв'язок `enabled` **і** скіл
  `enabled`, у порядку агента; кожен рендериться як
  `### Skill: <name>\n<description>\n\n<body>`.
- **AC6** Траса: `prompt_assembly.skills_detail[]` (id, name, version, tokens) і
  `prompt_assembly.block_tokens`; у Live Log рядок
  `Skills: N block(s), +T tokens — a v1, b v2`. Вимкнений скіл не з'являється ні
  в промпті, ні в трасі.
- **AC7** Seed: агент **Test Quality Reviewer** зі скілами `uncovered-branches`,
  `corner-cases`, `over-mocking`; **General Reviewer** зі скілом
  `api-contract-breaking-change`. 4-й скіл Test Quality (`flaky-tests`) —
  через імпорт із `docs/skills/import-samples/`.
- **AC8** `INJECTION_GUARD` і grounding не змінено.

## 5. Data & contract changes
- `agent_skills.enabled boolean not null default true`; унікальний індекс
  `skills(workspace_id, name)`; `skills.source` += `'imported'` (міграція `0011`).
- Контракти (обидві копії `vendor/shared`): `SkillCreateBody`, `SkillUpdateBody`,
  `SkillVersion`, `SkillImportRequest`, `SkillImportPreview`, `SkillIgnoredFile`,
  `AgentSkillsReplaceBody`; `AgentSkillLink.enabled`; `Agent.skill_count?`;
  `PromptAssembly.block_tokens?`, `PromptAssembly.skills_detail?`.

## 6. Out of scope
- Імпорт за URL і community-каталог (рядки i18n лишились для майбутнього).
- Версіонування агента при зміні зв'язків зі скілами.

## 7. Контрольний експеримент (реальні PR на GitHub)
Обидва PR відкриваються у вашому репо, імпортуються в DevDigest, і кожен агент
запускається двічі: **без скілів** (на вкладці Skills зняти всі чекбокси) і **зі
скілами**. Потім: Run trace → Prompt assembly → блок Skills + токени.

### 7.1 Test Quality — тест лише на happy-path
`src/pricing/discount.ts`:
```ts
export function applyDiscount(total: number, code?: string): number {
  if (total < 0) throw new Error('total must be non-negative');
  if (code === 'VIP') return Math.round(total * 0.8 * 100) / 100;
  if (total >= 100) return Math.round(total * 0.9 * 100) / 100;
  return total;
}
```
`src/pricing/discount.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { applyDiscount } from './discount';

describe('applyDiscount', () => {
  it('gives 10% off big orders', () => {
    expect(applyDiscount(200)).toBe(180);
  });
});
```
Очікування: без скілів агент (свідомо «худий» промпт) перевіряє лише явно
зламані тести → пропуск. Зі скілами: `uncovered-branches` флагує гілки
`total < 0` і `code === 'VIP'`; `corner-cases` — межу `total >= 100` (немає тесту
рівно на 100 / 99.99).

### 7.2 API Contract — зміна сигнатури роуту (General Reviewer)
У будь-якому Fastify/Express роуті (або в `server/src/modules/agents/routes.ts`
у форку DevDigest):
```diff
-  app.get('/agents/:id/skills', { schema: { params: IdParams } }, async (req) => {
+  app.get('/agents/:agentId/skill-links', { schema: { params: AgentParams, querystring: z.object({ include: z.enum(['body']) }) } }, async (req) => {
```
і перейменування поля відповіді (`skill_id` → `skillId`) лише в серверній копії
контракту. Очікування: без скіла General Reviewer шукає баги в логіці → пропуск;
зі скілом `api-contract-breaking-change` — CRITICAL: змінений шлях, новий
обов'язковий query-параметр, перейменоване поле, розбіжність двох копій
контракту.

## 8. Test plan
- server unit `test/skills-import.test.ts`: frontmatter, вибір ядра, класифікація,
  zip (лише ядро читається, zip-bomb, traversal, не-zip), правила версій, формат блоку.
- server it `test/skills.it.test.ts`: seed, CRUD+версії, preview→confirm
  (disabled), порядок/enabled у промпті й трасі, 422 на чужий id.
- client: `SkillsTab` (helpers + компонент), `ImportSkillModal`, `SkillEditorModal`.
- e2e `08-skills.flow.json`: сторінка Skills і вкладка Skills агента (seed-дані).

## 9. Перевірка наприкінці
- [ ] `pr-self-review` має `disable-model-invocation: true`; викликати вручну
  `/pr-self-review` — у звіті є і frontend-, і backend-скіли.
- [ ] Скіл створюється й редагується в UI (версія росте).
- [ ] Test Quality і General мають прив'язані скіли.
- [ ] Увімкнений скіл видно в Live Log/трасі окремим блоком, вимкнений — ні.
- [ ] Імпорт пройшов через прев'ю; `scripts/detect-flaky.sh` позначено
  «executable — not processed».
- [ ] Експеримент 7.1 і 7.2 відтворюється.
