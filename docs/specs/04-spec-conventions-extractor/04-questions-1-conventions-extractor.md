# 04 Questions Round 1 – Conventions Extractor

**Resolution (2026-09-19, after answers + mockups):** Q1→B (spec 04 = extractor only; API Contract = spec 05). Q2→B interpreted via mockup selection: Create skill merges **selected accepted** cards into one skill; repeat with another subset for more skills (no split-toggle in the modal). Q3→A status enum. Q4→A `/repos/:repoId/conventions`. Q5→B optional agent attach on compose (append via existing `linkSkill`, even though the mockup omits the picker). Q6→A re-scan replaces pending only. Q7→A edit candidate + compose body. Q8→A Quality levers as design notes, not extra product surface.

Перед спекою треба закрити розбіжності між брифом лабораторної, уже наявним каркасом у репозиторії і двома окремими продуктами в одному чеклисті. Поставте `[x]` біля обраної опції (можна кілька, якщо питання це дозволяє) і збережіть файл.

**Що вже є в коді (не треба вигадувати з нуля):**

- Таблиця `conventions` (`rule`, `evidence_path`, `evidence_snippet`, `confidence`, `accepted`); **немає** `category`, номера рядка, статусу reject.
- Zod `ConventionCandidate`; i18n `client/messages/en/conventions.json` (порожній стан, Run extraction / Re-scan, Accept as Skill).
- `repoIntel.getConventionSamples(repoId, n)` — топ-N файлів за rank, **без** eslint/tsconfig/prettier (вони зараз у `JUNK_PATH_PATTERNS`).
- Feature model `conventions` у Settings (дешева модель на вибір).
- `repoBlobUrl` (GitHub + GitLab, файл + рядок). Skills CRUD, Create Skill modal, вкладка Skills агента, імпорт (spec 03), Create Agent modal.
- Модуля `server/src/modules/conventions`, роута `POST /repos/:id/conventions/extract` і сторінки `/repos/:id/conventions` **немає**. Сайдбар ще не має пункту Conventions, але `activeKeyFor` уже розпізнає `/conventions`.

**Що бриф уже фіксує (не питаємо знову):** відбір зразків — кодом, не моделлю; модель вертає кандидатів з evidence; кандидати без доказу у файлі відкидаються; rejected не потрапляють у скіл; клік по доказу відкриває файл на code host; live LLM не є CI-гейтом.

**Оцінка розміру:** разом Conventions Extractor (новий модуль + grounded LLM + triage UI + створення скіла) **і** API Contract Reviewer (агент + 3–4 скіли + імпорт + контрольний PR) — це ближче до «цілого кабінету», ніж до однієї user story. Spec 03 уже виніс API Contract у non-goals.

---

## 1. Scope

Лабораторний чеклист вимагає демо-відео **обох** частин і один PR. Це два різні продукти: (1) витяг конвенцій → скіл, (2) спеціалізований агент на breaking API.

- [ ] (A) Один спек на обидва: Conventions Extractor + API Contract Reviewer (агент створюється через уже існуючий UI, без нового рушія).
- [x] (B) Два спеки: **04** лише Conventions Extractor; **05** API Contract Reviewer + fixture PR + експеримент без/зі скілами.
- [ ] (C) Лише Conventions Extractor у 04. API Contract лишається non-goal, доки не буде окремого запиту.
- [ ] (E) Other (describe)

**Current best-practice context:** Agent Skills ([agentskills.io/skill-creation/best-practices](https://agentskills.io/skill-creation/best-practices), 2026) радить одну coherent unit of work на скіл; це не вимагає пакувати extractor і спеціалізованого рев’юера в одну поставку.

**Recommended answer(s):** [(B)]

**Why:** Extractor — повний вертикальний зріз (API, grounded LLM, UI, persist, skill compose). API Contract не потребує нового коду рушія: Create Agent + Skills tab + import з spec 01–03. В одному спеку батьківські задачі роздуються; у двох — той самий демо-PR можна зібрати послідовно. (A) лишає один чеклист, але збільшує ризик розмитих proof artifacts. (C) ламає критерії приймання лабораторної.

---

## 2. Один скіл чи багато зі знахідок

Бриф: зібрати approved у `repo-conventions` **або** «обернути фічу ширше і створювати багато скілів». Критерій приймання: «1 скіл чи декілька».

- [ ] (A) Завжди **один** скіл `repo-conventions` (type `convention`): тіло = markdown-список лише accepted-кандидатів.
- [x] (B) Користувач обирає в compose-модалці: **один збірний скіл** або **по скілу на accepted-кандидата** (чи на категорію). Rejected ніколи не входять.
- [ ] (C) Завжди багато: один скіл на кожен accepted-кандидат.
- [ ] (E) Other (describe)

**Current best-practice context:** agentskills.io: занадто вузькі скіли дають overhead і конфлікти; занадто широкі важко активувати. Anthropic Citations (docs 2026): цитата гарантує, що уривок **існує** в джерелі, не що інтерпретація правильна — тому ручний triage перед записом у скіл лишається обов’язковим у будь-якому варіанті.

**Recommended answer(s):** [(B)]

**Why:** Закриває критерій «1 або декілька» без здогадок на імплементації. За замовчуванням — один збірний скіл (менше шуму в промпті агента); багато скілів — opt-in, коли категорії справді різні (naming vs error-handling). (A) і (C) відрізають половину чеклиста.

---

## 3. Accept / reject і схема рядка

Зараз `accepted boolean default false`. Немає різниці між «ще не дивились» і «відхилили». Користувач хоче бачити всі знахідки й accept/reject кожну.

- [x] (A) Нова колонка `status`: `pending | accepted | rejected` (через нову міграцію). Старий `accepted` лишаємо синхронізованим (`true` iff accepted) **або** прибираємо в тій же міграції, якщо Drizzle дозволяє без ручного edit старих файлів.
- [ ] (B) Лише boolean: Accept → `accepted=true`; Reject → **видалити** рядок. Pending = `accepted=false`.
- [ ] (C) Лише boolean: Reject ховає рядок в UI, у БД лишається `accepted=false` (pending і rejected нерізні).
- [ ] (E) Other (describe)

**Recommended answer(s):** [(A)]

**Why:** Інакше Re-scan і «rejected не в скілі» неможливо довести: pending знову потрапить у compose. Видалення (B) знищує аудит і суперечить «бачити всі знахідки». (C) змішує чергу з відмовою.

---

## 4. Де живе UI extractor

i18n уже написаний як сторінка репозиторію («Conventions in {repo}»). Claude Code `/insights` показує пропозиції **внизу** іншої сторінки. Бриф: запустити аналіз репо → список → модалка скіла.

- [x] (A) Окрема сторінка `/repos/:repoId/conventions` + пункт сайдбара Skills Lab (виняток на `client/src/vendor/ui/nav.ts`, як для Skills у spec 01).
- [ ] (B) Блок унизу `/skills` (як Claude Code insights), без окремого роута.
- [ ] (C) Вкладка на сторінці репо поруч із Pull Requests, без пункту Skills Lab.
- [ ] (E) Other (describe)

**Recommended answer(s):** [(A)]

**Why:** Конвенції прив’язані до **клону репо**, не до глобальної бібліотеки скілів. Готовий i18n і `activeKeyFor("/conventions")` уже очікують цей роут. (B) ховає extractor від репо-контексту (який clone сканувати?). (C) дублює навігацію без виграшу: PR list уже займає цей слот.

---

## 5. Куди кріпиться згенерований скіл

«Згенерований скіл можна прилінкувати до агента (механізмом з лабораторної)» — can, не must-auto.

- [ ] (A) Compose зберігає скіл (`type=convention`, `enabled` на вибір). Прив’язка — лише потім на вкладці Skills агента (spec 02). Модалка агента не пропонує.
- [x] (B) Compose зберігає скіл **і** опційно прив’язує до обраного існуючого агента тим самим `POST /agents/:id/skills`.
- [ ] (C) Автостворення окремого агента «Repo Conventions» і автолінк. Користувач не обирає.
- [ ] (E) Other (describe)

**Recommended answer(s):** [(B)]

**Why:** Чеклист вимагає, що скіл **можна** прилінкувати і запустити на рев’ю в тому ж демо. (A) змушує другий екран без потреби. (C) вигадує агента, якого бриф не описує, і змішує extractor з API Contract Reviewer.

---

## 6. Re-scan

У i18n уже є «Re-scan». Поведінка не описана.

- [x] (A) Новий прогін **замінює лише `pending`**. `accepted` і `rejected` лишаються. Нові pending, що дублюють rule+path уже існуючого рядка, не вставляються.
- [ ] (B) Повний wipe таблиці репо і новий витяг з нуля.
- [ ] (C) Лише append; дублікати дозволені.
- [ ] (E) Other (describe)

**Recommended answer(s):** [(A)]

**Why:** Інакше повторний скан зносить triage або засмічує список клонами. Wipe (B) суперечить accept/reject. Append без дедупу (C) ламає «бачити всі знахідки» шумом.

---

## 7. Редагування: інсайт vs майбутній скіл

Потік користувача: accept/reject → редагувати інсайт → модалка скіла з текстом і метаданими → зберегти або відмовитись.

- [x] (A) Обидва шари: inline/modal edit `rule` (і category, якщо додамо) на кандидаті **до або після** accept; потім compose-модалка (name, description, type, body зібране з accepted). Cancel compose нічого не пише в `skills`.
- [ ] (B) Кандидати тільки accept/reject. Редагується лише зібране тіло в compose-модалці.
- [ ] (C) Редагується лише кандидат. Тіло скіла генерується без прев’ю і одразу `POST /skills`.
- [ ] (E) Other (describe)

**Recommended answer(s):** [(A)]

**Why:** Бриф окремо назиє «едитувати конкретний інсайт» і «едитувати майбутній текст скіла». (B) і (C) викидають один із двох кроків. Compose має перевикористати поля Create Skill modal, не новий редактор.

---

## 8. Якість витягу: подумати vs зробити в цьому спеку

Додаткове завдання: «подумати, як продуктово покращити фічу, щоб було більше знахідок або вищої якості». Більшість кандидатів очікувано невалідні; evidence-gate це вже ріже.

- [x] (A) У спеку — секція **Quality levers** (дизайн, non-goals до імплементації), окрім того, що бриф уже наказав: конфіги (eslint/tsconfig/prettier) + топ-12 через `getConventionSamples` + перевірка file+line. Жодних нових важелів у коді 04.
- [ ] (B) У 04 імплементувати ще 1–2 важелі зараз (наприклад: мін. confidence-поріг у UI; групування карток за category; другий прохід моделі лише по accepted).
- [ ] (C) Окремий follow-on спек після першого живого прогону extractor.
- [ ] (E) Other (describe)

**Recommended answer(s):** [(A)]

**Why:** «Подумати» ≠ «побудувати другу систему ранжування». Без живих знахідок вибір важеля — здогадка. (A) фіксує ідеї для демо/опису PR і не роздуває scope. (B) додає поверхню, яку не можна довести без датасету. (C) можна зробити пізніше, якщо (A) виявиться мало.

Якщо оберете (B), коротко напишіть які 1–2 важелі:

>
>
