# Skills: reusable prompt blocks shared across agents

## Context

Агенти вже мають власний промпт, але кожне правило живе всередині одного агента —
переписати «як ми перевіряємо тести» для другого рев'ювера можна лише копіпастом.
Скіл — це іменований markdown-блок, що зберігається окремо, редагується в UI і
прив'язується до багатьох агентів у заданому порядку. Скіл не виконує нічого: це
лише текст, який `assemblePrompt` вставляє в секцію `## Skills / rules`.

Бекенд наполовину готовий і цього **не треба переписувати**:

| Є вже | Де |
|---|---|
| `skills`, `skill_versions`, `agent_skills` (у `0000_init.sql`) | `server/src/db/schema/skills.ts`, `agents.ts:51` |
| Контракти `Skill`, `SkillType`, `SkillSource`, `AgentSkillLink` | `server/src/vendor/shared/contracts/knowledge.ts:114` |
| `GET/POST /agents/:id/skills` + `linkedSkills`/`setSkills` | `agents/routes.ts:119`, `agents/repository.ts:198` |
| Слот `skills` у промпті + `prompt_assembly.skills` у трасі | `reviewer-core/src/prompt.ts`, `contracts/trace.ts:41` |
| Рендер блоку скілів у трасі | `.../RunTraceDrawer/_components/TraceBody/TraceBody.tsx:76` |
| `messages/en/skills.json`, `agents.json → editor.tabs.skills` + `skills.*`, `activeKeyFor("/skills")` | клієнт |

Бракує: модуля `server/src/modules/skills/`, сторінки `/skills`, `lib/api/skills.ts`,
таба Skills у редакторі агента, імпорту та **однієї передачі `skills:` у
`run-executor.ts:191`** — без неї прив'язані скіли нікуди не доходять.

Рішення, прийняті з користувачем:

- Сторінка як у дизайні (артборд `skill-config`): список 290px зліва + табований редактор справа.
- Таби редактора скіла: **Config · Preview · Versions** (Context/Evals/Stats — наступні уроки).
- Імпорт: `.md` і `.zip`, **парсинг у браузері**, збереження звичайним JSON POST.
- `enabled` — **per-agent** (нова колонка `agent_skills.enabled`); глобальний `skills.enabled` лишається «звірений/ні».
- Імпортовані тіла йдуть у промпт через `wrapUntrusted`, ручні — сирими.
- Токени: рядок у `runLog` + бейдж у блоці траси (без зміни схеми траси).
- Два нові агенти в seed: Test Quality Reviewer, API Contract Reviewer.
- Контрольний експеримент — на синтетичних PR у seed (демо-репо `acme/payments-api`).

---

## Етап 1 — Контракти (обидві копії vendor/shared)

`server/src/vendor/shared/contracts/knowledge.ts` **і** `client/src/vendor/shared/contracts/knowledge.ts`
(файли вже розійшлися — звірити `diff` перед правкою, див. `server/INSIGHTS.md`):

- `SkillSource` += `'imported_file'` (колонка в PG — звичайний `text` без CHECK, міграція не потрібна).
- `Skill` += `created_at: z.string()` (дзеркало `AgentVersion`).
- Нові `CreateSkillInput` (`name`, `description`, `type`, `body`, `source?`, `enabled?`) і
  `UpdateSkillInput` (все опційне) — за зразком `CreateAgentInput`/`UpdateAgentInput` (`knowledge.ts:195`).
- `SkillVersion` = `{ skill_id, version, body, created_at }`.
- `AgentSkillLink` += `enabled: z.boolean()`.
- `AgentAttachedSkill` = `AgentSkillLink` + `name`, `type`, `source`, `skill_enabled` —
  щоб таб агента малював рядок без другого запиту.

Тест: додати кейси в `server/test/contracts.test.ts`.

## Етап 2 — Міграція + шар даних

- `agent_skills.enabled boolean NOT NULL DEFAULT true` — **тільки** через `pnpm db:generate`;
  конфлікти `meta/_journal.json` розв'язувати доповненням, ніколи заміною.
- `server/src/db/rows.ts`: `SkillRow`, `SkillVersionRow`.
- `server/src/modules/skills/` за зразком `modules/agents/` (без provider/model):
  - `repository.ts` — `list`, `byId`, `insert`, `update` (при зміні `body` бампає
    `version` і пише `skill_versions` через `.onConflictDoNothing()`, як
    `AgentsRepository.update:120-170`), `delete`, `listVersions`. Усі запити з
    `and(eq(t.skills.workspaceId, …), …)`.
  - `helpers.ts` — `toSkillDto(row)`, `isBodyChange(existing, patch)` (чисті, з юніт-тестом).
  - `service.ts`, `routes.ts` — `GET /skills`, `GET /skills/:id`, `POST /skills`,
    `PUT /skills/:id`, `DELETE /skills/:id`, `GET /skills/:id/versions`.
    `IdParams` з `_shared/schemas.ts`, `getContext`, `NotFoundError`, без response-схем.
- `modules/index.ts` — один імпорт + один запис (докблок модуля прямо називає `skills`).
- `platform/container.ts` — геттер `skillsRepo` (як `agentsRepo:95`), щоб `reviews` не ліз у чужий модуль.
- `agents/repository.ts` — `linkedSkills` повертає ще й `enabled` лінка; `setSkills`
  приймає `Array<{ id, enabled }>`, нові методи `setSkillEnabled(agentId, skillId, enabled)`.
- `agents/routes.ts` — `SetSkillsBody.skill_ids` розширити до
  `z.array(z.object({ id: uuid, enabled: boolean().default(true) }))`, залишивши
  сумісність із голим масивом id (`z.union`); `GET /agents/:id/skills` повертає `AgentAttachedSkill[]`.

## Етап 3 — Скіли в промпті (та сама зміна закриває «блок у трасі»)

`server/src/modules/reviews/run-executor.ts` (~191, поряд із `...(repoMap ? …)`):

```ts
const linked = await this.container.agentsRepo.linkedSkills(agent.id);
const bodies = linked
  .filter((l) => l.enabled && l.skill.enabled)
  .map((l) => (l.skill.source === 'manual'
    ? l.skill.body
    : wrapUntrusted(`skill:${l.skill.name}`, l.skill.body)));
...(bodies.length ? { skills: bodies } : {}),
```

- `wrapUntrusted` вже експортується з `reviewer-core/src/prompt.ts:30` — не дублювати.
- Один рядок логу поряд із прецедентом `repo map: … token(s) attached` (`run-executor.ts:375`):
  `runLog.info(\`skills: ${bodies.length} skill(s), ~${tokens} token(s) attached\`)`,
  де `tokens` рахує `this.container.tokenizer` (`platform/container.ts:128`).
- Порожній масив → секція промпта відсутня (контракт `assemblePrompt` уже такий).
- Оновити докблок `PromptParts.skills` у `reviewer-core/src/prompt.ts:42`: санітизація тепер вище за стеком.
- Тести: `reviewer-core/test/prompt.test.ts` — untrusted-обгортка і порядок блоків;
  `server/test/skills.it.test.ts` (за зразком `agents-versions.it.test.ts`) — CRUD,
  версіонування тіла, крос-воркспейсна 404, і що вимкнений лінк не потрапляє в промпт.

## Етап 4 — Клієнт: сторінка Skills

Дзеркалимо `agents` → `agents/[id]`: `/skills` (список + `page.selectPrompt`) і
`/skills/[id]` (список + редактор). Обидва `page.tsx` — тонкі серверні входи.

```
client/src/app/(shell)/skills/
  page.tsx · [id]/page.tsx
  _components/SkillsListView/{SkillsListView.tsx,styles.ts,constants.ts,helpers.ts,index.ts,*.test.tsx}
    _components/SkillCard/…            ← картка з дизайну: іконка типу, назва, опис, тип+джерело
    _components/ImportSkillDrawer/…    ← Drawer 480px, парсинг + прев'ю + підтвердження
  [id]/_components/SkillEditorView/…   ← лейаут за styles.ts з AgentEditorView (sidebar 280 + пане)
  [id]/_components/SkillEditor/…       ← Tabs: Config · Preview · Versions
    _components/{ConfigTab,PreviewTab,VersionsTab}/…
```

- `lib/api/skills.ts` — `skillKeys` + `useSkills/useSkill/useCreateSkill/useUpdateSkill/useDeleteSkill/useSkillVersions`
  точно за формою `lib/api/agents.ts`.
- ConfigTab: `FormField` + `TextInput`/`SelectInput`/`Textarea(mono, rows≥12)`, чернетка в одному
  `useState`, `key={skill.id}` замість ефекту-скидання. Підпис до опису (директивний
  інтерфейс скіла) — `hint` у `FormField`; текст дописати в `skills.json`.
- PreviewTab: `<Markdown>` з `@devdigest/ui` (**без `rehype-raw`** — саме екранування
  сирого HTML робить прев'ю чужого тіла безпечним) + бейдж `~N tokens`.
- VersionsTab: список знімків із `GET /skills/:id/versions`, поточна — `Badge`.
- Нав: додати `{ key: "skills", … href: "/skills", gKey: "s" }` у `src/vendor/ui/nav.ts`
  (файл у «do not touch» — правка свідома, звірити з `server/src/vendor/`; `activeKeyFor` і
  `shell.json → nav.skills` уже є).
- `.dependency-cruiser.cjs`: додати `skills` **в обидва** списки альтернацій правила
  `no-cross-route-internals`, інакше новий роут мовчки поза охороною. Спільного між
  сторінкою скілів і табом агента не виносити в чужий `_components/` — правило це заборонить.

## Етап 5 — Імпорт (.md / .zip, парсинг у браузері)

- Дроп-зона + `<input type="file" accept=".md,.markdown,.zip">` — у клієнті таких немає жодної, це новий код.
- `.md` → `file.text()`. `.zip` → `unzipSync` з **fflate** (~8 KB, менше за JSZip; додати в `client/package.json` через `pnpm add`, лок не правити руками).
- `helpers.ts` (чистий, з юніт-тестом):
  - `pickSkillEntry(entries)` — бере `SKILL.md`, інакше перший `*.md` за найменшою глибиною;
  - `parseSkillMarkdown(text)` — `name` з YAML-фронтматера або першого `# ` заголовка, `description` з `description:` або першого абзацу, `body` — увесь текст;
  - `listIgnoredEntries(entries)` — усе не-`.md` (scripts/, `*.sh`, `*.js`, бінарники) → показати списком «не оброблено».
- Виконувані частини **не читаються і не запускаються** — ні на клієнті, ні на сервері; у ZIP беремо лише вибраний markdown.
- Прев'ю в Drawer: назва/опис/тип (редаговані) + `<Markdown>` тіла + перелік проігнорованих файлів + нотатка `preview.untrustedNotice`.
- Зберігає тільки кнопка підтвердження → `POST /skills` з `source: 'imported_file'`, `enabled: false`.
- `apiFetch` не чіпаємо: тіло звичайний JSON, multipart не потрібен (це і є причина парсити в браузері).

## Етап 6 — Таб Skills у редакторі агента

Три точки, як і планувалося конструкцією редактора:
`VALID_TABS` у `AgentEditorView.tsx`, `TABS` у `AgentEditor/constants.ts`, гілка в `AgentEditor.tsx`.

- Новий `AgentEditor/_components/SkillsTab/` за артбордом `agent-skills`: рядок = ручка
  порядку + чекбокс прив'язки + назва + бейдж типу + `Toggle` (per-agent `enabled`);
  зверху `N of M enabled`, фільтр, `agents.skills.orderHint` (текст змінити з «Drag to
  reorder» на фактичну механіку).
- Порядок: кнопки ↑/↓ замість drag-n-drop — dnd-бібліотеки в проєкті немає, а
  порядок усе одно надсилається одним `POST /agents/:id/skills` із повним масивом.
- Дані: `useAgentSkills(agentId)` + `useSetAgentSkills` у `lib/api/agents.ts` (`agentKeys.skills(id)`).
- i18n `agents.skills.*` уже існує; дописати ключі для ↑/↓ і порожнього стану.

## Етап 7 — Seed: агенти, скіли, PR для експерименту

`server/src/db/seed.ts` + `seed-prompts.ts` (ідемпотентно — select-then-insert, як існуючі агенти):

- Промпти `TEST_QUALITY_REVIEWER_PROMPT`, `API_CONTRACT_REVIEWER_PROMPT` + дзеркала в `docs/agent-prompts/*.md`.
- 4 скіли (`source: 'manual'`, `enabled: true`): `test-coverage-rubric`,
  `test-smells` (надмірне мокування, флейки) — для Test Quality; `api-breaking-changes`,
  `api-versioning` — для API Contract. Тіла тримати в `seed-skills.ts` поруч із `seed-prompts.ts`.
- Прив'язки через `agent_skills` з `order` і `enabled: true`.
- Два PR у демо-репо `acme/payments-api` поряд із #482 (`seed.ts:97-127` — готовий зразок
  `pullRequests` + `prFiles` + `prCommits`):
  - **#483** — новий тест лише на happy-path (є непокрита гілка помилки + межовий випадок);
  - **#484** — зміна сигнатури роута (breaking change для наявних клієнтів).
- Один скіл завести **не сідом, а через імпорт у UI** під час демо — щоб пройти весь шлях
  (файл `docs/agent-prompts/skills/*.md` або міні-zip покласти в репо як матеріал для імпорту).

---

## Виконання

Делегуємо самодостатнє й механічне; лишаємо собі точки рішення (щоб сабагент не вигадав
власну архітектуру там, де її вже обрано).

| Етап | Виконавець |
|---|---|
| 1 контракти | Haiku |
| 2 міграція + `modules/skills/` | Sonnet |
| 3 скіли в промпт + лог токенів | сам |
| 4 сторінка `/skills` | Sonnet |
| 5 імпорт `.md`/`.zip` | сам |
| 6 таб Skills у редакторі агента | Sonnet |
| 7 seed: агенти, скіли, PR-фікстури | Haiku |

Етапи 1–3 послідовні (контракти → дані → промпт); 4 і 6 паралельні після 3; 5 — після 4; 7 — після 2.
Роботу сабагента перевіряю сам (гейти + читання дифа) перед комітом; правки на один рядок
не делегую — делегація там дорожча за роботу.
- Сабагенту в промпті завжди давати: конкретні шляхи-зразки з цього плану, правило про
  дві копії `vendor/shared`, заборону правити `db/migrations/meta/_journal.json` і лок-файли.
- **Кожен етап = окремий коміт** після того, як його гейти (`typecheck`/`test`/`arch`
  відповідного пакета) пройшли — не раніше. Формат Conventional Commits, тіло тільки
  там, де «чому» неочевидне.
- З першим етапом реалізації комітяться також `docs/cc-plans/2026-09-20+skills-feature.md`
  і **`docs/designs/DevDigest_Design.html`** (1.7 МБ, зараз untracked) — джерело артбордів
  `skill-config` і `agent-skills`, на які посилається план.
- Перед PR — `/pr-self-review` вручну.

## Перевірка

Гейти (кожен у своєму пакеті):

```bash
cd server && pnpm typecheck && pnpm test && pnpm arch
```

```bash
cd client && pnpm typecheck && pnpm test && pnpm arch && pnpm build
```

`pnpm build` у клієнті — **лише зі зупиненим dev-сервером** (інакше `.next` псується, див. `client/INSIGHTS.md`).
`pnpm arch` після додавання `skills` до `no-cross-route-internals` перевірити навмисно
зламаним імпортом — `exclude` у dependency-cruiser уміє давати хибний зелений.

Наскрізний прогін (Docker Postgres + `pnpm db:migrate && pnpm db:seed`, обидва dev-сервери, браузер):

1. `/skills` — список, створення скіла з нуля, редагування тіла → у Versions з'явилась `v2`.
2. Імпорт: `.md` і `.zip` → прев'ю показує тіло **і** перелік невиконаних файлів;
   до підтвердження в БД нічого немає (`GET /skills` до і після); імпортований приходить `enabled: false`.
3. Редактор агента → таб Skills: прив'язка, тогл, ↑/↓; перезавантаження зберігає порядок.
4. Контрольний експеримент, обидва агенти:
   - Test Quality на PR #483: скіли вимкнені → пропуск; увімкнені → флаг на непокриту гілку + межовий випадок.
   - API Contract на PR #484: без скілів → пропуск; зі скілами → breaking change.
5. Траса прогону → секція збірки промпта: блок Skills присутній лише коли скіли увімкнені,
   у логах рядок `skills: N skill(s), ~M token(s) attached`; вимкнений скіл не дає ні блоку, ні рядка.
6. `/pr-self-review` викликати вручну (автовиклик лишається вимкненим) і показати, що він
   підтягнув і фронтові, і бекендні скіли — це скіл Claude Code у `.claude/skills/`, код не змінюємо.

Наприкінці — `/engineering-insights`; план кладеться в `docs/cc-plans/2026-09-20+skills-feature.md`
і комітиться разом із реалізацією.
