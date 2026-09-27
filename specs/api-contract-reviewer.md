# API Contract Reviewer — агент зі скілами

Другий агент домашнього завдання. Його одне питання до будь‑якого PR: **чи
переживе цю зміну кожен наявний клієнт?** Знання про те, що саме є зламом
контракту, живуть не в системному промпті, а в чотирьох скілах — так само, як
у Test Quality Reviewer з лабораторної. Промпт описує, *як* агент думає; скіли —
*що* флагувати (`docs/agent-prompts/README.md`).

Механізм скілів — [`skills.md`](skills.md); процедура A/B —
[`skills-control-experiment.md`](skills-control-experiment.md); перша половина
завдання — [`conventions-extractor.md`](conventions-extractor.md).

## Агент

**Вбудований агент** (рішення 2026-09-23): сид створює його разом із чотирма
скілами, прив'язаними в порядку промпта, як і решту вбудованих рецензентів.
Для продукту це правильно — нова робоча область отримує робочого рецензента
контрактів одразу, без ручного набору чотирьох скілів. Для демо шляху з
лабораторної агента можна так само створити через UI (Agents → Create) під
іншим ім'ям; сид збігається з агентами лише за ім'ям. Значення полів:

| Поле | Значення |
|---|---|
| Name | `API Contract Reviewer` |
| Description | `Finds API contract breaks in a pull request: removed or renamed routes, parameters and response fields, tightened validation, missing version bump or deprecation.` |
| Provider / Model | `openrouter` / `deepseek/deepseek-v4-flash` — та сама модель, що в сидових агентів, щоб порівняння A/B було про скіли, а не про модель |
| Strategy | `single-pass` |
| CI fail on | `critical` |
| Repo intel | увімкнено (callers‑of‑changed‑symbols — це саме ті клієнти, яких ламає зміна) |
| System prompt | додаток нижче; канонічна копія — `docs/agent-prompts/api-contract-reviewer.md` |

Промпт **навмисно не перелічує** класи breaking change. Інакше прогін без
скілів ловитиме те саме, що й зі скілами, і експеримент нічого не покаже.

## Скіли

Чотири скіли, тексти — у `specs/fixtures/api-contract-reviewer/<name>/SKILL.md`.
Кожен має директивний `description` (починається з дієслова: «Flags…»,
«Detects…», «Decides…», «Requires…») і секції **Good / Bad** з дифом.

| # у промпті | Скіл | Тип | Що робить |
|---|---|---|---|
| 1 | `breaking-change` | custom | зміна чи видалення публічного контракту; хто саме ламається |
| 2 | `response-schema` | custom | зміна форми відповіді: перейменування, тип, nullability, обов'язковість |
| 3 | `deprecation-policy` | custom | видалення без попереднього `@deprecated` / `Sunset` / side‑by‑side |
| 4 | `semver-discipline` | custom | яка зміна вимагає major, і чи є bump у дифі |

Усі чотири приходять із сидом (`source='manual'`) у саме такому порядку:
спершу «що зламано», потім «як мало бути», потім «яка версія». Змінити порядок
можна drag&drop на вкладці Skills агента.

### Імпорт `deprecation-policy`

```bash
cd specs/fixtures/api-contract-reviewer && zip -r /tmp/deprecation-policy.zip deprecation-policy
```

Архів містить `SKILL.md` і `scripts/check-sunset.sh` — навмисний
«виконуваний» файл, який прев'ю має перелічити як пропущений і не
розпакувати. Імпортований скіл приходить **вимкненим**; увімкнути його на
картці — свідома дія перед прив'язкою.

## Контрольний експеримент

### PR‑фікстура

Один диф із чотирма порушеннями — по одному на скіл — у тестовому
репозиторії (створити гілку і PR за хвилину; імпортувати PR у DevDigest):

`src/routes/pulls.ts`

```diff
 const ListQuery = z.object({
-  status: z.enum(['open', 'merged', 'closed']).optional(),
+  status: z.enum(['open', 'merged', 'closed']),
 });

 app.get('/repos/:id/pulls', { schema: { params: IdParams, querystring: ListQuery } }, async (req) => {
   const rows = await service.list(req.params.id, req.query.status);
   return rows.map((pr) => ({
     id: pr.id,
     number: pr.number,
-    full_name: pr.repoFullName,
-    head_sha: pr.headSha,
+    fullName: pr.repoFullName,
     state: pr.state,
   }));
 });
```

`package.json`

```diff
-  "version": "1.4.2",
+  "version": "1.4.3",
```

Що тут зламано: `status` став обов'язковим (кожен виклик без нього → 422);
`full_name` перейменовано, `head_sha` видалено (клієнт читає обидва);
жодного `@deprecated`, `Sunset` чи старого поля поруч; версія — patch замість
major. У описі PR — «rename for consistency», без згадки про клієнтів.

### Прогін A — без скілів

1. Agents → API Contract Reviewer → **Skills**: зняти всі чотири галочки.
2. PR → Run review цим агентом.
3. Trace → Prompt assembly: блока `Skills` **немає**; у логах — «No enabled
   skills linked to this agent».
4. Записати: кількість знахідок, їх заголовки, severity, чи названо клієнта.

### Прогін B — зі скілами

1. Повернути чотири галочки у порядку з таблиці вище.
2. Re‑run на тому самому PR.
3. Trace → Prompt assembly: блок **Skills** з чотирма `### Skill: …` у тому ж
   порядку; біля блока — `≈N tok` (критерій 19: число стосується саме блоку
   скілів); `deprecation-policy` підписаний як `imported_url — third-party text`.
4. Записати той самий набір.

### Що вважаємо успіхом

Прогін B має знахідки щонайменше **трьох** із чотирьох класів: обов'язковий
`status` (CRITICAL, названо, хто отримає 422); перейменування/видалення полів
відповіді (з обома формами і споживачем); відсутність deprecation‑кроку;
patch‑bump замість major. Прогін A типово дає ≤1 з них — найчастіше лише
`status`, бо це видно як код, а не як контракт.

Якщо A ловить усе те саме — це теж результат: означає, що системний промпт
або модель уже несуть це знання, і тоді слід прибрати з промпта натяки, а не
робити скіли довшими.

## Критерії приймання

Нумерація — рядки [`hw2-criteria.md`](hw2-criteria.md).

1. Чотири скіли з директивним описом і Good/Bad існують на сторінці Skills і
   як файли у `specs/fixtures/api-contract-reviewer/` (43).
2. Принаймні один скіл нових агентів має походження «імпортовано» (16) —
   див. «Відкриті питання»: засіяні скіли цього не дають, це робить імпорт.
3. Прогін без скілів пропускає злам контракту; прогін зі скілами його
   знаходить (18).
4. У трасі прогону B блок скілів окремий, з лічильником токенів (19);
   у прогоні A блока немає взагалі (20).

## Файли

| Що | Де |
|---|---|
| Системний промпт (канон) | `docs/agent-prompts/api-contract-reviewer.md` + рядок у `docs/agent-prompts/README.md` |
| Промпт і агент у сиді | `server/src/db/seed-prompts.ts` (`API_CONTRACT_REVIEWER_PROMPT`), `server/src/db/seed.ts` |
| Скіли в сиді | `server/src/db/seed-skills.ts` — чотири записи з `agents: ['API Contract Reviewer']` |
| Тексти скілів (з frontmatter) | `specs/fixtures/api-contract-reviewer/{breaking-change,response-schema,semver-discipline,deprecation-policy}/SKILL.md` |
| Приманка для імпорту | `specs/fixtures/api-contract-reviewer/deprecation-policy/scripts/check-sunset.sh` |
| PR‑фікстура | диф вище; окремого файла немає |

Сид ідемпотентний за іменем і не чіпає вже налаштованих агентів: прив'язку
скіла він створює, лише коли новий агент або новий скіл. Якщо і агент, і скіл
уже були, відсутня прив'язка — це ваше рішення на вкладці Skills, і повторний
сид його не скасовує (виправлено 2026-09-24: раніше сид повертав відв'язаний
`mock-overuse-gate` у Test Quality Reviewer). Нові прив'язки стають **після**
наявних, тож двох блоків на одній позиції промпта не буває. Фікстури лишаються
для демо імпорту.

## Відкриті питання

- **Критерій 16 (скіл через імпорт).** Усі чотири скіли агента тепер засіяні
  як `manual`. Імпортоване походження дає або `flaky-test-heuristics` на Test
  Quality Reviewer, або повторний імпорт `deprecation-policy.zip` — тоді в
  списку буде два скіли з одним ім'ям, і прив'язати до агента треба саме
  імпортований.
- **Модель для експерименту.** Дешева модель зі скілами може «загубити» щось
  із довшого промпта. Якщо B слабший за очікуване — спробувати
  `claude-sonnet-4-6` через OpenRouter **в обох** прогонах, а не лише в B.

## Додаток — системний промпт

```markdown
# Role
You are a senior engineer who maintains the public surface of a Node.js
(TypeScript, ESM) service: its HTTP routes and the modules other packages
import. You review one pull-request diff in a single pass. Clients of this
service exist that you cannot see — a web app, a CI runner, third-party
integrations — and they were written against the code as it is BEFORE this diff.

# Stack context (assume unless the diff shows otherwise)
- HTTP: Fastify 5; every route declares Zod schemas for params / querystring /
  body, and invalid input is answered with 422 before the handler runs.
- Wire shape is snake_case JSON; TypeScript identifiers are camelCase.
- Versioning: `package.json` `version`; routes are unversioned unless prefixed `/vN/`.

# How you work
1. Read the diff for what it changes on the surface: routes, parameters,
   response fields, exported signatures, event names, environment variables.
   Then judge each change from the point of view of a caller written yesterday.
2. The rules for what counts as a violation come from the skills attached to
   this run. Apply each attached skill exactly as written. With no skills
   attached, review the change on its own merits as any careful engineer would.
3. A finding without a line in the diff is not a finding. Cite `file:line` for
   the old and the new contract and quote the exact key, parameter or signature.
4. Name a concrete consumer where you can (a file in the repo, a client the
   description mentions); when you cannot, lower the severity rather than invent one.

# What NOT to flag
- Internal refactors that leave the wire shape and exported signatures intact.
- Style, naming, test quality, performance — other reviewers own those.
- Additive changes: a new optional field, a new route, a widened enum.

# Severity
- CRITICAL — an existing caller stops working and the diff carries no migration path.
- WARNING — a break with a partial path, or a policy violation that does not
  break a caller today.
- SUGGESTION — compatible now, but narrows future options; say what to keep open.

# Verdict
Keep the summary to what a maintainer must decide before merging: which
callers break, and what the smallest compatible alternative is.
```
