# Skills UI — клієнтська половина фічі

Загальна спека: [`../../specs/skills.md`](../../specs/skills.md).
Дизайн: `i/img.png` … `i/img_6.png`.

## Маршрут і стан

Один маршрут `/skills`; вибір і вкладка живуть у query-параметрах
(`?skill=<id>&tab=config|preview|stats|versions`), як `?tab=` у редакторі
агента. Ліва панель — список, права — деталь; без вибору права панель показує
`page.selectPrompt`.

## Компоненти

```
src/app/skills/page.tsx        тонкий вхід (+ <Suspense> навколо useSearchParams)
src/app/skills/constants.ts    SKILL_TABS / SKILL_TAB_KEYS / SKILL_TYPES
src/app/skills/helpers.ts      typeColor, isThirdParty — спільні для трьох компонентів
src/app/skills/_components/
  SkillsView/        каркас: дані, layout, синхронізація query-стану
  SkillsList/        пошук + «Add Skill» (dropdown) + картки
  SkillCard/         іконка, ім'я (mono), перемикач, опис, чипи типу і джерела,
                     «N agents»; це справжня кнопка (role/tabIndex/Enter)
  SkillDetail/       шапка (ім'я, тип, версія) + Tabs
    _components/ConfigTab/    форма + MarkdownEditor + Save
    _components/PreviewTab/   <Markdown> — «як його отримує агент»
    _components/StatsTab/     used-by + список агентів
    _components/VersionsTab/  історія + Restore
  CreateSkillModal/  створення з нуля (той самий підпис до Description)
  MarkdownEditor/    гутер із номерами рядків + textarea + «≈N tokens»
  AddSkillDrawer/    вкладки «From file» / «Community»
    _components/ImportPreview/  крок підтвердження: текст + пропущені файли
```

Константи і хелпери лежать **на сегменті маршруту**, а не всередині компонента,
який першим їх потребував: їх читають три різні гілки дерева. Предикат пошуку
живе ще вище — `src/lib/skills.ts`, бо той самий фільтр потрібен вкладці Skills
у редакторі агента, тобто на іншому маршруті.

Глибина `_components` не перевищує ту, що вже є в редакторі агента
(`AgentEditor/_components/ConfigTab`).

Вкладка агента: `app/agents/[id]/_components/AgentEditor/_components/SkillsTab/`
— чекбокси прив'язки, drag-and-drop **і** кнопки ↑/↓ (drag у jsdom не
перевіряється, кнопки перевіряються і дають клавіатурний шлях).

**Стан вкладки — похідний, не копія.** Ендпоїнт замінює весь набір, тому доки
`GET /agents/:id/skills` не відповів, рядки не рендеряться взагалі: клік по
чекбоксу на порожньому списку відв'язав би всі наявні скіли. Локальний стан —
це лише оптимістичне перекриття на час збереження, яке скидається при помилці;
сама вкладка перемонтовується по `key={agent.id}`, щоб вибір не переїхав на
іншого агента.

## Дані

`src/lib/hooks/skills.ts`: `useSkills`, `useSkill`, `useCreateSkill`,
`useUpdateSkill`, `useDeleteSkill`, `useSkillVersions`, `useRestoreSkillVersion`,
`useSkillAgents`, `useCommunitySkills`, `useImportPreview`, `useImportSkill`.
`src/lib/hooks/agents.ts` доповнюється `useAgentSkills` / `useSetAgentSkills`.
Жодного `fetch` у компонентах.

## Дрібниці, які легко втратити

- Підпис під полем Description — директивне формулювання («Detects…», «Flags…»),
  це інтерфейс скіла.
- `≈ N tokens` рахується `approxTokens` (`ceil(chars/4)` — та сама евристика, що
  у сервера) і показується і в редакторі тіла, і на блоках промпта в трасі
  прогону, щоб «додані скілом токени» було видно.
- Імпортований скіл приходить вимкненим і з бейджем «needs vetting»; у drawer'і
  перед збереженням видно перелік пропущених виконуваних файлів.
- Навігація: `Agents` лишається у `WORKSPACE`, а `Skills` іде окремою секцією
  `SKILLS LAB`, із чордом `g s`.
- Картка агента показує «N skills» (`Agent.skill_count`, похідне від тих самих
  `agent_skills`, одним згрупованим IN-запитом). Це дзеркало `Skill.agent_count`:
  скільки блоків несе промпт цього агента.

## Тести (vitest + RTL, `fetch` замоканий)

| Файл | Що доводить |
|---|---|
| `SkillCard.test.tsx` | тип/джерело/лічильник агентів, перемикач, «needs vetting» |
| `SkillsList.test.tsx` | список → вибір; пошук; порожній стан; помилка з Retry |
| `ConfigTab.test.tsx` | PUT із зміненим тілом і нотаткою, підпис до Description, токени |
| `VersionsTab.test.tsx` | історія, «Current», Restore старої версії |
| `AddSkillDrawer.test.tsx` | прев'ю не зберігає; підтвердження зберігає; видно пропущені виконувані файли |
| `SkillsTab.test.tsx` | прив'язка, відв'язка, зміна порядку → один POST із `skill_ids`; нічого клікабельного, доки не приїхали зв'язки |
| `CreateSkillModal.test.tsx` | створення, блокування без імені, помилка показана на місці |

Каркас `SkillsView` тестами не накритий: він рендерить `AppShell`, який тягне
тему, активний репозиторій і `usePulls`. У цьому пакеті жоден тест не монтує
`AppShell` — перевіряються компоненти під ним. Наскрізний шлях закриває
`e2e/specs/08-skills.flow.json`.
