# Conventions Extractor — специфікація фічі

Продукт читає клон репозиторію, пропонує **кандидатів у конвенції** (правило +
доказ у коді + впевненість), перевіряє кожен доказ кодом, дає користувачу
прийняти / відхилити / відредагувати їх і збирає прийняті в **скіл**, який
прилінковується до агента і працює на ревʼю. Ідея та ж, що в `/insights` Claude
Code (`i/img.png`): не «ось правила», а «ось що ми побачили у вашому коді — і
ось де; хочете зробити з цього правило?».

Дизайн: `i/img_3.png` (порожній стан), `i/img_1.png` (список кандидатів),
`i/img_2.png` (модалка «Create skill from conventions»).

Друга половина домашнього завдання — агент **API Contract Reviewer** зі своїми
скілами — в окремій спеці [`api-contract-reviewer.md`](api-contract-reviewer.md).
Критерії оцінювання і звірка з ними: [`hw2-criteria.md`](hw2-criteria.md).

## Межі фічі

| У межах | Поза межами |
|---|---|
| Скан клону **одного** репозиторію за запитом користувача | автоматичний скан на кожен fetch/PR |
| Відбір зразків чистим кодом; **один** виклик дешевої моделі на скан | багатокрокові діалоги з моделлю, embeddings |
| Кодова перевірка доказів; кандидати без доказів не зберігаються | статичний аналіз правил (лінтер зі скіла) |
| Accept / Reject / Edit кандидата, стан переживає перезавантаження | автоприйняття за порогом впевненості |
| Один або кілька скілів `source='extracted'` з прийнятих кандидатів | скіл, що виконує код |
| Прилінкування створеного скіла до агента наявним механізмом | автопривʼязка до всіх агентів |
| Модель фічі — з Settings → Models (рядок `conventions` вже є) | окремий провайдер/ключ для цієї фічі |

## Як це працює

```
Run scan ─► convention_scans (running)
             │
             ├─ 1. відбір зразків — код: конфіги + repoIntel.getConventionSamples(repoId, 36) → 12
             │     + repoIntel.getConventionFacts(repoId) — лічильники по всьому індексу
             ├─ 2. модель (feature model "conventions") → ConventionExtraction {candidates[]}
             ├─ 3. перевірка доказів — код: файл є? рядки є? сніпет збігається?
             ├─ 4. злиття з попереднім станом: rejected лишаються rejected
             └─► conventions (status=pending) + convention_scans (done, лічильники)
                    │
      Accept/Reject/Edit (PATCH /conventions/:id)
                    │
      Create skill ─► preview (нічого не пише) ─► користувач редагує ─► POST → skills (source=extracted)
                    │
      Link to agent ─► agent_skills ─► блок у промпті прогону (механізм зі skills.md)
```

Скан — це **джоб**, а не синхронний запит: модель відповідає десятки секунд,
а UI має показувати «Scanning…» і переживати закриту вкладку. Використовуємо
`JobRunner` так само, як `POST /repos/:id/resync`.

## Модель даних

### `conventions` — вже є, розширюємо (міграція `0013`)

Нинішні колонки: `id, workspace_id, repo_id, rule, evidence_path,
evidence_snippet, confidence, accepted`. Цього замало: немає категорії, рядка
доказу, стану «відхилено» і жодних метаданих скану.

| Колонка | Зміна | Навіщо |
|---|---|---|
| `status` `text` enum `pending \| accepted \| rejected`, not null, default `pending` | **нова**, замінює `accepted` | Reject має переживати перезавантаження і повторний скан; булевого `accepted` для трьох станів не вистачає |
| `accepted` | **видаляємо** | два джерела правди для одного факту розійдуться. Контракт `PluginConvention` (`productionize.ts`, модуль плагінів ще не існує) на експорті виводить `accepted = status === 'accepted'` |
| `category` `text` enum, not null, default `other` | нова | рубрика картки і групування у скілі |
| `rationale` `text`, nullable | нова (міграція `0014`) | обґрунтування моделі одним реченням, зазвичай із цифрами з виміряних фактів; показується на картці рядком «Why:» і йде в тіло скіла. У першій реалізації губилось між верифікатором і базою |
| `evidence_line_start`, `evidence_line_end` `integer`, nullable | нові | доказ = файл **+ рядки**; це і є посилання на GitHub |
| `evidence_sha` `text`, nullable | нова | SHA клону на момент скану — permalink на GitHub не «пливе» після нового пушу |
| `scan_id` `uuid` → `convention_scans.id`, on delete set null | нова | з якого скану кандидат |
| `skill_id` `uuid` → `skills.id`, on delete set null | нова | у який скіл кандидат уже пішов (бейдж на картці, кілька скілів з одного скану) |
| `created_at`, `updated_at` | нові | стандартні для таблиць з UI-редагуванням |
| індекс `(repo_id, status)` | новий | сторінка читає всіх кандидатів репозиторію |

`category` ∈ `naming | structure | imports | types | async | error-handling |
api | testing | logging | other`. Enum оголошено в Zod-контракті і в Drizzle
(`text('category', { enum })`), як `skills.type`; вільний текст — це пастка, у
яку вже потрапила `findings.severity` (див. `server/INSIGHTS.md`).

### `convention_scans` — нова таблиця

Факти рівня **скану** (скільки файлів, яка модель, скільки відкинуто, скільки
коштувало) не мають дому на рядку кандидата, а UI показує «Detected from 84
sample files · last scan 1h ago».

```
id uuid PK · workspace_id · repo_id (cascade)
status text enum running | done | failed
provider text · model text            — що реально викликали (з Settings або дефолт)
head_sha text                          — HEAD клону на момент скану
sample_files jsonb string[]            — точний список файлів, які бачила модель
candidates_total int                   — скільки повернула модель
candidates_kept int                    — скільки пройшли перевірку і збереглися
discarded jsonb {missing_file, bad_lines, snippet_mismatch, duplicate, rejected_before}
tokens_in int · tokens_out int · cost_usd double nullable
error text nullable
started_at · finished_at
```

Один репозиторій — щонайбільше один скан у стані `running` (частковий
унікальний індекс `(repo_id) WHERE status = 'running'`).

### Контракти (`@devdigest/shared`, **обидві копії**)

```ts
ConventionCategory = z.enum([...])
ConventionStatus   = z.enum(['pending', 'accepted', 'rejected'])

ConventionCandidate = {
  id, repo_id, rule, category, status, confidence (0..1),
  evidence_path, evidence_line_start, evidence_line_end, evidence_snippet, evidence_sha,
  scan_id, skill_id (nullable), created_at, updated_at
}

ConventionScan = {
  id, repo_id, status, provider, model, head_sha, sample_files, candidates_total,
  candidates_kept, discarded, tokens_in, tokens_out, cost_usd, error, started_at, finished_at
}

ConventionsPage = { scan: ConventionScan | null, candidates: ConventionCandidate[] }

// вихід моделі — те, що вимагає критерій 40: {категорія, правило, evidence: файл+рядок, впевненість}
ConventionExtraction = {
  candidates: Array<{
    category: ConventionCategory,
    rule: string,                       // одне речення в наказовому способі
    rationale?: string,                 // чому це схоже на конвенцію (≥2 місця)
    evidence: Array<{ path, line_start, line_end, snippet }>,  // 1..3
    confidence: number                  // 0..1
  }>
}
```

Нинішній `ConventionCandidate` у `contracts/knowledge.ts` (`accepted: boolean`,
без категорії) замінюється; клієнтська копія — у тому ж коміті.

## Відбір зразків — без моделі

Крок повністю детермінований, без жодного виклику LLM (критерій 39).

1. **Конфіги** — фіксований список імен у корені клону **і в кожному каталозі
   першого рівня, де є `package.json`** (цей репозиторій — чотири пакети, корінь
   порожній): `package.json`, `tsconfig*.json`, `.eslintrc*`, `eslint.config.*`,
   `.prettierrc*`, `prettier.config.*`, `biome.json`, `.editorconfig`. Не більше
   6 каталогів, не більше 12 конфігів. Конфіги йдуть у промпт як окрема секція
   «Declared tooling»: правило, що збігається з налаштуванням лінтера, — це
   конвенція з найвищою впевненістю.
2. **Код** — `repoIntel.getConventionSamples(repoId, 36)`: ранжовані файли без
   тестів/конфігів/міграцій/тулінгових `.*`-каталогів, **перемішані за
   пакетами** — спершу найкращий файл кожного пакета, далі пропорційно розміру
   пакета (правило Сент-Лагю), усередині пакета — порядок рангу. Семплер бере
   з цього пулу перші 12 файлів довжиною ≥ 20 рядків (`MIN_SAMPLE_LINES`), а
   дрібні — лише на доповнення. Кожен файл обрізається до
   `MAX_SAMPLE_LINES = 250`; рядки нумеруються (`  42 | …`), бо модель має
   цитувати **номери рядків**, а не вгадувати їх.
   *Чому так:* перший реальний скан `vklyovsa/dev-digest` за чистим рангом
   узяв 7 файлів server, 5 client і жодного з reviewer-core та e2e, а два з
   дванадцяти слотів витратив на файли по 9 і 10 рядків.
3. **Бюджет** — сирий текст конфігів і коду рахується `container.tokenizer` і
   обрізається до `SAMPLE_TOKEN_BUDGET = 24_000` токенів (з кінця списку).
   Число виміряне: реальний скан — 2,2 тис. конфігів + 7,3 тис. коду, 13,2 тис.
   на вході разом із промптом, 68 с, з яких майже весь час — **генерація**
   9,1 тис. вихідних токенів. Бюджет не керує часом; він обрізає патологічний
   семпл і тримає промпт дешевої моделі коротким.
4. **Виміряні факти** — `repoIntel.getConventionFacts(repoId)` рахує по всьому
   індексу (усі файли, ребра імпорту, експортовані символи): ролі файлів, що
   повторюються (`routes.ts ×8`), стиль імен за пакетом і розширенням, де
   лежать тести і з яким суфіксом, види експортів, імпорти між сусідніми
   файлами-ролями (`routes.ts → service.ts ×4`) і між каталогами. Секція
   «Measured facts» (~670 токенів) змінює **впевненість**, а не докази: цитата
   з семплу обов'язкова однаково.
5. **Деградація** — якщо фасад повертає `[]` (репозиторій не проіндексовано,
   `REPO_INTEL_ENABLED=false`), скан завершується як `failed` з
   `error='repo_not_indexed'`, а UI пропонує Re‑sync. Мовчазного fallback на
   «якісь файли» немає: результат без рангу — це інший продукт.

Точний список файлів, які бачила модель, зберігається в `sample_files` — це
потрібно перевірці доказів (нижче) і чесній підказці «Detected from N files».

## Виклик моделі

- **Модель** — `resolveFeatureModel(container, workspaceId, 'conventions')`:
  вибір із Settings → Models, інакше дефолт із реєстру `FEATURE_MODELS`.
  Дефолт міняємо з `openai/gpt-5.4` на дешеву `openrouter/deepseek/deepseek-v4-flash`
  (як в onboarding) — **в обох копіях реєстру** (`contracts/platform.ts` і
  `client/src/lib/feature-models.ts`). Жодного імені моделі в коді модуля.
- **Один** `completeStructured` зі схемою `ConventionExtraction`,
  `schemaName: 'ConventionExtraction'` (саме це імʼя вже очікує
  `MockLLMProvider.structuredBySchema`), `temperature: 0`, `maxRetries: 1`.
- **Системний промпт** — `server/src/prompts/conventions.system.md` (як
  `onboarding.system.md`). Суть: шукати правила, що **повторюються** (≥2 місця
  або підтверджені конфігом); формулювати як наказ («Route handlers return
  typed `Result<T, ApiError>`»), а не як спостереження; не пропонувати
  загальники, які вірні для будь‑якого TS‑проєкту («use TypeScript», «write
  tests»); цитувати рядки, які **справді є** у зразку; калібрувати впевненість
  (0.9+ тільки коли правило видно в ≥3 файлах або в конфігу); 5–15 кандидатів.
- **Користувацьке повідомлення**: секція «Declared tooling» (конфіги), секція
  «Sample files» (нумеровані), обидві в `<untrusted source="repo">` — код
  репозиторію є даними, не інструкціями. Плюс секція **«Already decided»**: правила,
  які вже `accepted` (не пропонувати повторно) і `rejected` (не пропонувати
  взагалі) — це і є те, що робить Re‑scan кращим за перший скан, а не копією.

## Перевірка доказів — код

Модель бреше про рядки частіше, ніж про правила. Тому кожен доказ проходить
детерміновану перевірку, і **кандидат без жодного доказу, що вижив, не
зберігається** (критерій «докази з реальним кодом»):

1. `path` ∈ `sample_files` — інакше `missing_file` (модель не могла бачити
   інший файл; посилання на невідомий файл — галюцинація).
2. З цитати знімаються скопійовані номери рядків (`42 | …`), якщо вони є в
   більшості її рядків. Цитата довша за 20 рядків — `bad_lines`: це вже не
   цитата.
3. Нормалізований сніпет (пробіли схлопнуто, кінцеві `;`/`,` обрізано) має бути
   підрядком нормалізованого тексту рядків `[line_start−2, line_end+2]`.
   Якщо ні — пошук по всьому файлу вікном висотою з саму цитату; знайшли —
   **виправляємо** номери рядків (self‑heal), не знайшли — `snippet_mismatch`.
   Діапазон, що сам по собі неможливий (`line_start < 1`, довший за 40 рядків),
   не вбиває доказ: цитату шукають по файлу так само, і лише якщо її немає —
   `bad_lines`. Перший реальний скан втратив так 3 з 10 пропозицій. Пошук по
   всьому файлу працює лише для цитати від 10 символів — `});` є майже всюди.
4. Зберігається **перший** доказ, що пройшов; `evidence_snippet` береться з
   **файлу**, а не з відповіді моделі — на картці показуємо реальний код,
   а не переказ.
5. Дублікати всередині скану (однакове нормалізоване `rule`) — `duplicate`.

Лічильники відкинутих ідуть у `convention_scans.discarded` і в лог джоба; UI
показує їх одним рядком під заголовком («12 candidates · 3 discarded
without evidence»). Це чесніше за приховування і одразу показує якість моделі.

## Повторний скан (Re‑scan)

Стан користувача — цінніший за свіжий вивід моделі:

| Було | Після Re‑scan |
|---|---|
| `rejected` | лишається; той самий (нормалізований) `rule` у новому виводі відкидається як `rejected_before` |
| `accepted` (у т.ч. відредагований, у скілі) | лишається як є |
| `pending` попереднього скану | **видаляється** і замінюється новим набором |

Обидва списки («вже прийнято», «відхилено») передаються моделі в «Already
decided», тож новий скан шукає **нові** правила замість того, щоб повторювати
старі. Скан не запускається, поки попередній `running` (409).

## API

Модуль `server/src/modules/conventions/` (`routes`, `service`, `repository`,
`sampler`, `verifier`, `render-skill`, `constants`). Сервіс оголошує свій порт
`ConventionsDeps` (`db`, `git`, `repoIntel`, `tokenizer`, `jobs`, `llm()`,
`settingsRepo`, `skillsService`‑зріз), контейнер задовольняє його структурно —
за схемою `RepoIntelDeps` / `ReviewsDeps`. Джоб‑хендлер `conventions-extract`
реєструється у `routes.ts` при завантаженні модуля, як `repo-intel`.

| Метод і шлях | Тіло → відповідь | Примітки |
|---|---|---|
| `POST /repos/:id/conventions/extract` | — → `202 { scan_id }` | 409, якщо скан уже `running`; 404 — чужий/неіснуючий репо |
| `GET /repos/:id/conventions` | — → `ConventionsPage` | останній скан (будь‑якого статусу) + усі кандидати репо; клієнт полить кожні 2 с, поки `scan.status === 'running'` |
| `PATCH /conventions/:id` | `{ status?, rule?, category?, confidence? }` → `ConventionCandidate` | Accept / Reject / повернення в `pending` / inline‑edit; доказ **не** редагується — це доказ |
| `POST /repos/:id/conventions/skill/preview` | `{ candidate_ids }` → `{ name, description, type, body, evidence_files }` | нічого не пише; 422, якщо будь‑який id не `accepted` або не з цього репо |
| `POST /repos/:id/conventions/skill` | `{ candidate_ids, name, description, type, enabled, body, agent_id? }` → `201 Skill` | створює скіл `source='extracted'`, проставляє `conventions.skill_id`; з `agent_id` — одразу лінкує через `AgentsService.linkSkill` |

Усі роути workspace‑scoped через `getContext`; репозиторій перевіряється на
належність воркспейсу до будь‑якої дії. Валідація — Zod‑схеми на роуті, без
ручного `parse` у хендлері.

## Скіл із конвенцій

Двокроково, як імпорт: **preview → редагування → commit**. Тіло, яке бачить
користувач у модалці, — байт‑у‑байт те, що піде в промпт.

- Ім'я за замовчуванням — **`repo-conventions`** (критерій 42); користувач
  може змінити (`repo-conventions-testing` для другого скіла з іншої вибірки).
- Опис за замовчуванням: «Flags changes that violate N house conventions of
  `owner/name`; cites the offending file:line.» — директивно, як вимагає
  `skills.md`.
- `type = 'convention'`, `source = 'extracted'`, `enabled = true` (текст
  народжений у воркспейсі, не чужий), `evidence_files` = унікальні шляхи
  доказів, версія 1 з нотаткою `Created from N accepted conventions (scan …)`.
- До скіла потрапляють **тільки** `accepted` кандидати з переданого списку;
  `rejected`/`pending` серед `candidate_ids` → 422, а не мовчазне ігнорування.
- Тіло генерує чиста функція `renderConventionsSkill(repo, candidates, scan)`:

```markdown
# repo-conventions

House conventions for `acme/payments-api`, extracted from 14 sampled files at
`abc1234` on 2026-09-22. Flag any change that violates a rule below and cite
the offending `file:line`. Do not flag code the rule does not cover.

## Async
- **Always use async/await instead of `.then()` chains.**
  Evidence: `src/api/users.ts:23-31`
  ```ts
  const user = await db.users.find(id);
  const posts = await db.posts.findMany({ userId });
  ```

## API
- **Public route handlers return typed `Result<T, ApiError>`.**
  Evidence: `src/api/public/index.ts:14-20`
  …
```

Групування за категорією, у кожному правилі — доказ і сніпет (≤ 8 рядків).
Доказ у тілі — не декорація: агент отримує приклад, а людина, що читає скіл
через рік, бачить, звідки взялося правило.

Після створення кандидати лишаються `accepted` і отримують `skill_id` (бейдж
«in repo-conventions»). Другий скіл з іншої вибірки — «Deselect all», прийняти
інші, «Create skill» знову.

## Екрани

### Сайдбар

`NAV` у `client/src/vendor/ui/nav.ts`: **Agents** переїжджає з WORKSPACE до
SKILLS LAB (критерій 6); у SKILLS LAB додається **Conventions** →
`/repos/:repoId/conventions`, іконка `ListChecks`, шорткат `g c`.
`activeKeyFor` уже знає `/conventions`.

### `/repos/[repoId]/conventions`

| Стан | Що видно |
|---|---|
| немає сканів | порожній стан з `i/img_3.png`: заголовок, пояснення, кнопка **Run scan** |
| `running` | заголовок «Conventions in `<repo>`», підзаголовок «Scanning…», кнопки заблоковані, скелетони карток |
| `failed` | банер з `scan.error` (для `repo_not_indexed` — з кнопкою Re‑sync) і кнопка **Re‑scan** |
| `done` | підзаголовок «Detected from N sample files · last scan 1h ago · M discarded», справа **Re‑scan**; тулбар: **Deselect all**, «X of Y accepted», **Create skill** (є лише коли `accepted ≥ 1`, критерій 50); список карток |

«Run scan» і «Re‑scan» — дві різні кнопки з різними ключами копії
(критерій 45): перша живе у порожньому стані, друга — у заголовку, коли скан
уже був.

Порядок карток: `pending` за впевненістю ↓, потім `accepted`; `rejected`
сховані за перемикачем «Show rejected (n)» (вимкнений за замовчуванням) — вони
не «повертаються» після перезавантаження, але їх можна відновити.

### Картка кандидата (`i/img_1.png`)

- Заголовок — `rule`; чип категорії.
- Рядок доказу: `path:start-end` — **посилання** на
  `githubBlobUrl(repo.full_name, evidence_sha, path, start, end)` (є в
  `client/src/lib/github-urls.ts`), `target="_blank"`; поруч — Copy.
- Сніпет у моноблоці — реальний текст із файлу.
- «Confidence» — смужка + відсоток (`Math.round(confidence * 100)%`).
- Кнопки: **Accept**, **Reject**, **Edit** (критерій 47). Прийнята картка —
  зелена ліва межа, кнопка стає «Accepted» (повторний клік → `pending`);
  відхилена — приглушена, з «Restore».
- **Edit** — inline (критерій 49): заголовок стає текстовим полем, чип — селектом
  категорії, з'являються Save/Cancel; Save → `PATCH`. Доказ не редагується.
- Бейдж «in `<skill-name>`», якщо `skill_id` заповнений; клік веде на
  `/skills?skill=<id>`.

### Модалка «Create skill from conventions» (`i/img_2.png`)

Відкривається з «Create skill», спершу викликає `…/skill/preview` для
прийнятих кандидатів. Поля: банер «Merged from N accepted conventions in
`<repo>`. Everything below is editable before you save.», **Name**,
**Description**, **Type** (select), **Enabled** (toggle з підписом),
**Link to agent** (необов'язковий select з `useAgents()`), **Skill body** —
той самий `MarkdownEditor`, що в редакторі скіла (`≈N tokens`, «unsaved»).
Футер: «Saved as v1 · added to Skills Lab», **Cancel**, **Create skill**.
Успіх → toast із посиланням на новий скіл; список карток оновлюється
(бейджі). Порожнє ім'я або тіло — кнопка неактивна.

### Settings → Models

Рядок **Conventions** уже рендериться з `FEATURE_MODELS` із пошуковим
селектом (критерій 53). Змін в UI немає; змінюється лише дефолт у реєстрі.
На сторінці Conventions під заголовком показується `scan.model`, щоб було
видно, що вибір із Settings справді застосувався.

## Супутні правки з лабораторної

Звірка з [`hw2-criteria.md`](hw2-criteria.md) показала чотири розходження у
вже зробленому, які закриваються в цій же роботі:

1. **Agents у SKILLS LAB** (критерій 6) — див. «Сайдбар».
2. **Модалка підтвердження видалення** замість `window.confirm` — для агента
   (`AgentCard`, критерій 34) і для скіла (критерій 24): один спільний
   `ConfirmDialog` у `client/src/components/confirm-dialog/` з кнопками
   Confirm / Cancel і хрестиком; **Delete** з'являється і на картці скіла
   (критерій 23), не лише в шапці деталі.
3. **Маршрут `/skills/:id`** (критерії 10 і 25): список скілів живе в
   `client/src/app/skills/layout.tsx`, тож `/skills/:id` показує той самий
   список і скіл у бічній панелі з вкладками Config / Preview / Stats /
   Versions; `?tab=` зберігається. Клік по картці веде на `/skills/:id`, старі
   посилання `/skills?skill=<id>` переадресовуються. *Виправлено 2026-09-24:*
   перша реалізація дала окрему сторінку лише з деталлю, без списку, і клік у
   списку на неї не вів.
4. **Diff у Versions** (критерій 28): кнопка «Diff» біля кожної попередньої
   версії показує різницю з поточним тілом (рядковий diff у модалці, без нової
   залежності — власний LCS по рядках у `helpers.ts`).

## Продуктові покращення: більше знахідок і кращої якості

Додаткове завдання. Що реально підіймає якість, у порядку «дешево → дорого»:

Реалізовано: 1, 3, 5 і ремонт доказів (див. «Перевірка доказів»). Решта — наступні кроки.

1. **[зроблено] Зворотний зв'язок у промпт**: `accepted` і `rejected`
   правила в секції «Already decided» — модель не повторює відхилене і шукає
   нове. Найдешевший спосіб зробити другий скан кориснішим за перший.
2. **Задекларовані конвенції як вхід**: `CLAUDE.md` / `AGENTS.md` /
   `CONTRIBUTING.md` з клону — секція «Declared conventions». Модель має
   **підтвердити** їх доказом у коді або повідомити «declared but not
   observed» — це окремий, дуже корисний тип знахідки (правило є, коду під ним
   немає). Потребує лише читання файлів; варто зробити другим кроком.
3. **[зроблено] Стратифікована вибірка**: `interleaveByStratum` у
   `repo-intel/pipeline/convention-facts.ts` — див. «Відбір зразків», п. 2.
4. **Тести як окремий зразок**: `isJunkPath` викидає `*.test.ts`, тому
   конвенції тестування (іменування кейсів, `it.test.ts` для БД) недосяжні.
   Другий, менший семпл із топ‑5 тестових файлів під категорію `testing`.
5. **[зроблено] Кількісні докази з індексу**: `repoIntel.getConventionFacts` —
   див. «Відбір зразків», п. 4. Нової індексації не знадобилось: усе
   рахується з `file_rank`, `file_edges` і `symbols`.
6. **Перевірка «≥2 місця» кодом**: після верифікації шукати сніпет‑патерн
   (нормалізований) у інших семплах; кандидат з одним місцем отримує
   `confidence × 0.6` і позначку «single occurrence». Знімає найчастіший клас
   хибних правил — одиничний випадок, видатий за конвенцію.
7. **Прогін на власному робочому репозиторії** — обов'язкова частина завдання:
   імпортувати робочий репо, прогнати, записати у `INSIGHTS.md` (§ What
   Doesn't Work), які класи пропозицій були сміттям і чому — це і є вхідні
   дані для пунктів 3–6.

## Критерії приймання

Нумерація в дужках — рядки [`hw2-criteria.md`](hw2-criteria.md).

1. `POST /repos/:id/conventions/extract` запускає скан; кандидати і метадані
   скану лежать у Postgres і переживають перезавантаження сторінки й API (38).
2. Вибірка зразків — конфіги + `getConventionSamples(repoId, 12)` — без
   виклику моделі; тест доводить, що `MockLLMProvider` викликано **рівно один
   раз** за скан (39).
3. Відповідь моделі валідується схемою `ConventionExtraction`:
   `{category, rule, evidence[{path, line_start, line_end, snippet}], confidence}` (40).
4. Кандидат зберігається лише з доказом, що пройшов кодову перевірку; сніпет у
   БД — з файлу; посилання на картці відкриває GitHub на потрібних рядках
   (доказ «клікабельний і веде на реальний код»).
5. Сторінка Conventions у SKILLS LAB (44); Run scan / Re‑scan (45); картки з
   правилом, файлом‑джерелом і відсотком (46); Accept / Reject / Edit (47);
   Reject переживає перезавантаження і не потрапляє в скіл (48); Edit — inline (49);
   Create skill з'являється після першого Accept (50).
6. Модалка пояснює походження, має Name / Description, Cancel / Create (51) і
   дозволяє редагувати тіло й метадані (41); створений скіл видно на `/skills` (52).
7. Прийняті кандидати збираються у скіл `repo-conventions`, який лінкується до
   агента і рендериться блоком у промпті прогону (42); можна створити кілька
   скілів з різних вибірок.
8. Модель фічі береться з Settings → Models, рядок Conventions (53).
9. Agents — у SKILLS LAB (6); видалення агента і скіла — через модалку (24, 34);
   Delete є на картці скіла (23); `/skills/:id` відкривається (25); у Versions є
   Diff (28).

## Тести

- **server, hermetic**: `conventions-sampler.test.ts` (пошук конфігів у корені
  та пакетах, обрізання за бюджетом, нумерація рядків); `conventions-verifier.test.ts`
  (файл відсутній / рядки за межами / сніпет не збігається / self‑heal / дублікат);
  `conventions-render.test.ts` (rejected ніколи не в тілі; групування; ліміт
  сніпета).
- **server, `conventions.it.test.ts`**: extract з `MockLLMProvider`
  (`structuredBySchema.ConventionExtraction`) → рядки в БД, лічильники скану,
  одна модель‑виклик; PATCH статусів; Re‑scan зберігає rejected і не повертає
  той самий rule; `skill` → 422 на не‑accepted id; створений скіл має
  `source='extracted'` і лінкується до агента; прогін ревʼю з цим агентом несе
  блок `### Skill: repo-conventions`.
- **client**: сторінка у чотирьох станах; картка — три кнопки, href доказу,
  inline‑edit; «Create skill» невидимий без accepted; модалка — редагування
  тіла й метаданих, Cancel нічого не пише; `ConfirmDialog`.
- **e2e**: `10-conventions.flow.json` — порожній стан → Run scan недоступний
  без ключа моделі (детерміновано, без LLM); рядок Conventions у Settings → Models.

## Пакети та файли

| Пакет | Що зʼявляється / змінюється |
|---|---|
| `server/` | `src/modules/conventions/*`, `src/prompts/conventions.system.md`, `src/db/schema/knowledge.ts` (+ `conventionScans`), міграція `0013`, `src/modules/index.ts`, `src/platform/container.ts` (порт), `src/vendor/shared/contracts/{knowledge,platform}.ts`, `src/adapters/mocks.ts` (фікстура `ConventionExtraction`), `test/conventions*.test.ts` |
| `client/` | `src/app/repos/[repoId]/conventions/**`, `src/app/skills/[id]/page.tsx`, `src/components/confirm-dialog/`, `src/lib/hooks/conventions.ts`, `src/lib/feature-models.ts`, `src/vendor/ui/nav.ts`, `src/vendor/shared/contracts/knowledge.ts`, `messages/en/conventions.json`, `messages/en/shell.json`, `SkillCard`, `AgentCard`, `VersionsTab` |
| `reviewer-core/` | не змінюється (тайпчек проти оновленої серверної копії контрактів має лишитися зеленим) |
| `e2e/` | `specs/10-conventions.flow.json` |
| корінь | `README.md` § карта маршрутів, `specs/README.md` |

Контракти змінюються в **обох** копіях у одному коміті.

## Відкриті питання

Закриті 2026-09-23 — рішення й виміри в [`hw2-open-questions.md`](hw2-open-questions.md):
бюджет виміряно (24 тис.), `JobRunner` не повторює цей хендлер, вартість
пишеться (OpenRouter віддає її сам), кандидати не сидяться. Завислий скан
(рестарт, зависла модель) тепер закривається як `failed` через 10 хвилин —
інакше частковий індекс блокував би репозиторій назавжди.

Відкриті:

- **OpenRouter і таймаут.** Клієнт має власні 90 с і `maxRetries: 2`, поле
  `timeoutMs` запиту ігнорує; SDK повторює й після таймауту. Скан довший за
  90 с може піти до провайдера тричі. Стосується всього `reviewer-core`, тому
  рішення за власником рушія.
