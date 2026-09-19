# 05 Questions Round 1 – API Contract Reviewer

**Resolution (2026-09-19, chat):** Q1→A (spec 05 = API Contract Reviewer only). Q2→A (seed agent + 3 skills; `deprecation-policy` via import). Q3→A (seed PR #902). Q4→A (quality / insights analog = design notes, not built).

Перед спекою треба закрити розбіжності між уже зробленим extractor (spec 04), відкладеним лабораторним агентом і новим запитом «покращити якість знахідок / зробити як Claude Code `/insights`». Поставте `[x]` біля обраної опції (можна кілька, якщо питання це дозволяє) і збережіть файл.

**Що вже є (не треба вигадувати з нуля):**

- Spec 04 Conventions Extractor **реалізований**: `POST /repos/:id/conventions/extract`, grounding file+line+snippet, сторінка `/repos/:repoId/conventions`, accept/reject/edit, compose-модалка → скіл `source=extracted`, опційний `linkSkill`.
- Spec 01–03: Skills Lab, Create Skill, вкладка Skills агента (dual-gate), імпорт `.md` / zip, Create Agent modal, Test Quality Reviewer + контрольний PR **#901**.
- `docs/skill-fixtures/flaky-tests/` — шаблон імпорту; `seed.ts` сіє агентів ідемпотентно за `workspace + name`.
- `SkillType`: `rubric | convention | security | custom`. Промпти агентів живуть у `server/src/db/seed-prompts.ts` + `docs/agent-prompts/`.
- `reviewer-core` уже збирає `skills: string[]` у промпт. Нового рушія для API Contract **немає потреби**.

**Що бриф уже фіксує (не питаємо знову):** чотири іменовані скіли — `breaking-change`, `response-schema`, `semver-discipline`, `deprecation-policy`; кожен із директивним описом і парою добре/погано; принаймні один заводиться через імпорт; експеримент без скілів (агент пропускає) проти зі скілами (ловить breaking change); live LLM не є CI-гейтом.

**Оцінка розміру:** API Contract Reviewer за патерном spec 03 (агент + 3–4 скіли + імпорт + fixture PR + герметика промпта) — **just right**. Той самий спек плюс продуктові важелі якості extractor (більше семплів, confidence UI, «запиши в AGENTS.md») — **too large**, два продукти. Чистий UI-демо без засіяного PR і fixture-файлів — занадто тонкий для proof artifacts.

---

## 1. Scope

Spec 04 Q1 уже відповів: **04 = extractor, 05 = API Contract Reviewer**. Зараз у запиті знову змішані (а) лабораторний агент на breaking API і (б) «подумати / покращити extractor, щоб було більше або кращих знахідок», плюс аналог Claude Code `/insights` (внизу сторінки: дописати в CLAUDE.md, створити Custom Skill, новий шлях використання).

- [x] (A) Spec **05 лише API Contract Reviewer** (агент, 4 скіли, імпорт одного, fixture PR, експеримент без/зі скілами). Якість extractor — design notes у 05 (як Q8 spec 04), без нового коду extractor.
- [ ] (B) Один спек 05 на **обидва**: API Contract **і** 1–2 важелі якості Conventions (код + UI).
- [ ] (C) Два спеки: **05** API Contract Reviewer; **06** Conventions quality / insights-analog (окремий sufficiency pass після 05).
- [ ] (E) Other (describe)

**Current best-practice context:** Agent Skills ([agentskills.io best practices](https://agentskills.io/skill-creation/best-practices), 2026) радить одну coherent unit of work на скіл **і** не звалювати непов’язані домени в один пакет. Extractor і API-рев’юер — різні user stories.

**Recommended answer(s):** [(A)]

**Why:** «Скоуп якого не вистачає» після закритого 04 — це саме API Contract, який 03 і 04 винесли в non-goals. «Подумати» ≠ будувати другу систему семплінгу в тому ж спеку. (B) роздуває proof artifacts і змішує два демо. (C) правильний, якщо хочете **окремо заспекати** insights-аналог; тоді 05 усе одно пишеться без нього. Якщо оберете (B), коротко назвіть 1–2 важелі в питанні 4.

---

## 2. Як агент з’являється в студії

Бриф: «створіть агента **через UI** та функціонал лабораторної». Spec 03 для Test Quality зробив інакше: `pnpm db:seed` вставляє агента + 3 скіли, четвертий (`flaky-tests`) лише через імпорт.

- [x] (A) **Як Test Quality:** seed ідемпотентно вставляє агента `API Contract Reviewer` + 3 скіли; четвертий **не** в seed — fixture під `docs/skill-fixtures/` і путь Import → enable → вкладка Skills. Create Agent modal у демо не обов’язковий (агент уже є після seed).
- [ ] (B) **Лише UI:** агент і всі 4 скіли створюються руками (Create Agent + Create Skill / Import). Seed **не** вставляє цього агента. У seed лише fixture PR. Після `db:seed` з нуля агента немає, доки оператор не пройде UI.
- [ ] (C) **Подвійний шлях:** seed як у (A) для повторюваного стенду **і** окремий demo-чеклист «створити клона агента через Create Agent», щоб буквально закрити «через UI».
- [ ] (E) Other (describe)

**Current best-practice context:** Той самий agentskills.io: скіл має бути файл на диску (`SKILL.md` + description), який можна імпортувати; DevDigest уже так робить. Ідемпотентний seed — єдиний спосіб, щоб герметика і локальний стенд не роз’їхались після wipe Docker volume.

**Recommended answer(s):** [(A)]

**Why:** «Через UI» у брифі закривається вкладкою Skills + імпортом (як `flaky-tests`), а не новим екраном створення агента — Create Agent modal **уже існує**. (B) ламає `pnpm db:seed` як єдине джерело демо-стенду і ускладнює integration-тести. (C) дублює роботу без нового продукту. Якщо оберете (A), рекомендований import-скіл — `deprecation-policy` (найменш критичний для «без скілів пропускає / зі скілами ловить» експерименту на rename поля).

---

## 3. Контрольний PR для експерименту

Потрібен diff, що змінює сигнатуру публічного роуту **або** перейменовує поле у відповіді. Spec 03 засіяв **#901** з `docs/skill-fixtures/happy-path-only.diff`.

- [x] (A) Засіяти **#902** на `acme/payments-api` з committed unified diff (наприклад rename `userId` → `user_id` у відповіді публічного хендлера **або** зміна path/сигнатури роуту). Герметика: `assemblePrompt` містить тіла API-скілів коли вони передані, і `assembly.skills === null` коли ні. Live прогін — demo, не CI.
- [ ] (B) Не сіяти PR. Оператор створює/імпортує справжній PR на клоні. У спеку лише ручний чеклист.
- [ ] (C) Перевикористати #901 (happy-path тести) і для API Contract — без нового diff.
- [ ] (E) Other (describe)

**Current best-practice context:** Breaking change = споживач старого контракту ламається (видалення/rename поля відповіді, новий required у request, зміна path) — [oasdiff breaking-change rules](https://www.oasdiff.com/docs/breaking-changes) (2026). У цьому продукті рев’юер читає **diff коду**, не OpenAPI-файл; окремий `oasdiff` у CI **не** пропонується (це був би новий рушій). Скіли мають директивно назвати ті самі класи змін і дати добре/погано.

**Recommended answer(s):** [(A)]

**Why:** Без засіяного diff експеримент «без скілів пропускає / зі скілами ловить» не відтворюється після wipe. (C) неефективний: #901 не ламає API. (B) лишає proof artifacts на руках оператора. Точний текст diff — деталь імплементації, якщо він очевидно ламає публічний контракт `payments-api`.

---

## 4. Якість extractor / аналог Claude Code `/insights`

Більшість кандидатів extractor очікувано слабкі. Зараз семпл = кореневі eslint/tsconfig/prettier + топ-12 через `getConventionSamples`. Spec 04 уже записав важелі як design notes і **не** будував їх.

Claude Code `/insights` внизу сторінки пропонує: дописати рядки в `CLAUDE.md`, створити Custom Skill, або новий шлях використання інструмента. У DevDigest аналог міг би бути: після accept — «запиши в AGENTS.md/CLAUDE.md клону» / «створи скіл» (уже є) / «прив’яжи до агента» (частково є).

Це питання **обов’язкове, якщо в Q1 обрали (B)**. Якщо Q1 = (A) або (C), відповідь тут лише фіксує, **що записати як follow-on**, без коду в 05.

- [x] (A) У 05 лише короткий блок **Quality levers (not built)**. Не змінювати extractor. Insights-аналог не спекати, доки не буде окремого запиту.
- [ ] (B) У 05 (або в 06, якщо Q1=C) імплементувати **семплінг**: `AGENTS.md` / `CONTRIBUTING.md` як first-class зразки і/або збільшити N понад 12. Без нового «запиши в markdown репо».
- [ ] (C) Insights-аналог як продукт: після triage три CTA — дописати правила в `AGENTS.md` (або еквівалент у клоні), створити скіл (існуюча модалка), прив’язати до агента. Писати в чужий clone — окремий git write, не частина compose.
- [ ] (E) Other (describe)

**Current best-practice context:** agentskills.io «Synthesize from existing project artifacts»: найкращі скіли народжуються з `AGENTS.md`, style guides, review comments — не лише з топ-N ranked files. Anthropic-style grounding гарантує, що уривок **існує**, не що правило правильне — тому accept/reject лишається обов’язковим навіть після кращого семплу. Запис у `CLAUDE.md` клону — це мутація чужого git, інший trust boundary, ніж скіл у workspace DB.

**Recommended answer(s):** [(A)]

**Why:** Без живого прогону extractor на реальному репо вибір важеля — здогадка (те саме, що spec 04 Q8). (B) і (C) — окремий спек після спостережень. (C) зокрема небезпечний: write-back у clone легко сплутати з compose скіла і потребує окремого security pass.

Якщо оберете (B) або (C), допишіть 1–2 речення: який важіль перший і чи пишемо в clone.

>
>
