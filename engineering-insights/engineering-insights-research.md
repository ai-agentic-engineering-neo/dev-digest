# engineering-insights / LEARNINGS.md — дослідницька добірка

Усі матеріали, знайдені під час роботи над скілом engineering-insights (capture
learnings loop) для курсу. Згруповано за темами. Кожен запис: суть + що звідти
взяти + посилання.

---

## 1. Головні гайди по learnings loop (must-read)

### MindStudio — Self-Learning AI Skill System with Learnings.md + Wrap-Up Skill
24.03.2026. Найповніший практичний гайд. Прочитано повністю.
https://www.mindstudio.ai/blog/self-learning-ai-skill-system-learnings-md-wrap-up

Що взяти:
- **Готова структура файлу** (фіксовані секції): What Works · What Doesn't Work
  · Codebase Patterns · Tool & Library Notes · Recurring Errors & Fixes ·
  Session Notes (datestamped) · Open Questions.
- **Приклади vague vs useful:** «Promises can be tricky» (погано) →
  «Promise.all() на пайплайні інжесту таймаутить після 30 елементів — бери
  Promise.allSettled() з батчами по 10» (добре). «обережно з async» →
  «state checkout-флоу завжди через Zustand (cartStore.ts), бо кошик шарять 3
  компоненти».
- **Три способи тригерити wrap-up:** slash-команда `/wrap-up`
  (.claude/commands/wrap-up.md), автоматичний hook (PostToolUse/Stop), ручний
  промпт. Висновок: ручний ненадійний — «if you skip the wrap-up, the system
  doesn't learn».
- **Готовий текст для CLAUDE.md:** секція Session Context («before starting any
  work, read Learnings.md… treat as high-confidence guidance») + End of Session
  («run /wrap-up… Do not skip this step»).
- **Common mistakes:** не запускати wrap-up стабільно; надто generic записи;
  файл задовгий (>200 записів — сигнал/шум падає); конфліктні записи; пропуск
  секції What Doesn't Work.
- **Командний режим:** append-only в PR, designated maintainer консолідує;
  узгоджений формат записів; commit Learnings.md у репо.
- **Cadence:** wrap-up після кожної сесії >30 хв з проблемою/рішенням/відкриттям;
  тривіальні правки пропускати. Quarterly review для чистки.
- **FAQ:** wrap-up може зіпсувати базу (LLM хибно підсумовує) → LEARNINGS це
  чернетка під рев'ю, спот-чек за людиною; зв'язок з RAG (це «manual RAG without
  infrastructure»).

### MindStudio — How to Build a Learnings Loop for Claude Code Skills
19.03.2026.
https://www.mindstudio.ai/blog/how-to-build-learnings-loop-claude-code-skills

Що взяти:
- Протокол у CLAUDE.md (Session Protocol): на старті — read LEARNINGS.md +
  briefly summarize; у кінці — identify patterns/mistakes, append, do not
  overwrite (correct with dated note).
- **Примусове активне читання:** «Before we begin, confirm you've read
  LEARNINGS.md and summarize the top 3 most relevant points» — змушує обробку, а
  не пасивне завантаження; і це sanity-check, що файл узагалі прочитався.
- LEARNINGS ≠ CLAUDE.md (різні призначення); LEARNINGS ≠ реплей чату (витяг
  інсайту, не історія).

### MindStudio — Compounding Knowledge Loop in Claude Code
Механіка session lifecycle hooks + автооновлювана база.
https://www.mindstudio.ai/blog/compounding-knowledge-loop-claude-code

Що взяти:
- 5 типів хуків (PreToolUse, PostToolUse, Notification, Stop, SubagentStop);
  для capture найважливіший **Stop** (кінець сесії).
- Формулювання проблеми: агент у context window, по кінці сесії нічого не
  персиститься; «You repeat yourself constantly… makes the same class of mistakes
  as last week… institutional knowledge lives in your head, not the agent's».
- Базовий приклад hook-конфігу в .claude/settings.json.

### MindStudio — Self-Learning Claude Code Skill with Learnings.md
Чому патерн працює без RAG/векторів.
https://www.mindstudio.ai/blog/self-learning-claude-code-skill-learnings-md

Що взяти: «just a file that the previous version of Claude left notes in for the
current version to read»; markdown — правильний формат (Claude читає/пише
нативно); дослідження long-context показують, що моделі краще застосовують
структурований контекст, ніж відновлюють знання з нуля.

### MindStudio — Self-Evolving Claude Code Memory with Obsidian + Hooks
Stop-hook пише в Obsidian vault через Anthropic API.
https://www.mindstudio.ai/blog/self-evolving-claude-code-memory-obsidian-hooks

Що взяти:
- Повний потік Stop-hook: скрипт читає транскрипт сесії з локального сховища →
  шле в Claude з промптом на витяг → отримує структуровані інсайти → пише
  markdown у vault → майбутні сесії читають.
- **4 категорії capture:** Patterns · Mistakes · Decisions · Context (кожна — в
  свою підпапку + автоіндекс). Це база для наших 4 категорій.

### MindStudio — What Is Claude Code Auto-Memory
Як агент сам дописує знання між сесіями.
https://www.mindstudio.ai/blog/what-is-claude-code-auto-memory

Що взяти: огляд механізму auto-memory; що зберігати (build/test команди,
конвенції, архітектурні рішення, env-квірки); раннє рев'ю записів запобігає
накопиченню помилок.

---

## 2. Self-improving CLAUDE.md (дотичний патерн)

### dev.to / Aviad Rozenhek — Self-Improving AI: One Prompt That Makes Claude Learn From Every Mistake
https://dev.to/aviad_rozenhek_cba37e0660/self-improving-ai-one-prompt-that-makes-claude-learn-from-every-mistake-16ek

Що взяти:
- Ідея мета-правил: «we have thousands of tokens of cognition at the start of
  every session — why treat CLAUDE.md as static when we could turn it into a
  self-improving system».
- Компаундинг: сесія 1 — Claude робить 3 помилки, ти 3 рази застосовуєш промпт →
  3 нові правила; сесія 2 — читає правила на старті, цих помилок більше нема.
- Правила запису: лідь з «чому», NEVER/ALWAYS, концизно, оновлюй summary.

### dev.to / evoleinik — CLAUDE.md: Building Persistent Memory for AI Coding Agents
https://dev.to/evoleinik/claudemd-building-persistent-memory-for-ai-coding-agents-5322

Що взяти (найкращі живі цитати):
- «Add to Learnings: Prisma Accelerate has 5MB response limit — use select not
  include» — приклад запису одним рядком.
- Workflow: під час сесії флагуй ментально → після підтвердження фіксу додай;
  у кінці «Review this session and add any non-obvious findings… only if
  genuinely useful»; monthly — видали fixed bugs / дублікати / ніколи не
  потрібне.
- **Compounding effect:** «After 3 months… the agent feels like a team member
  who's been on the project for months, not a contractor starting fresh every
  morning».
- Межі: це не заміна документації; format optimized for LLM (terse, declarative);
  не милиця для поганого тулінгу (якщо агент забуває, як ганяти тести — можливо,
  тест-команда задовга, лагодь корінь).

---

## 3. Офіційне від Anthropic

### Anthropic — Lessons from building Claude Code: How we use skills
2 тижні тому. Скіли в активному вжитку всередині Anthropic (сотні).
https://claude.com/blog/lessons-from-building-claude-code-how-we-use-skills

Що взяти:
- «Common misconception: skills are just markdown files. They're folders that can
  include scripts, assets, data» — підпирає наш слайд про анатомію.
- **Dynamic hooks у скілах:** скіл може реєструвати хуки, що живуть лише поки
  скіл активний, лише цю сесію — «for opinionated hooks you don't want always
  on». Приклади: /careful (блокує rm -rf, DROP TABLE, force-push), /freeze
  (блокує Edit поза певною текою під час дебагу).

### Anthropic — Skill authoring best practices
https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices

Що взяти (правила написання, застосовні і до insights):
- description = інтерфейс discovery; включати «що робить» І «коли застосовувати»;
  завжди третя особа (інжектиться в системний промпт).
- тестувати на всіх моделях, з якими працюватимеш (Opus vs Haiku — різна
  деталізація); імена скілів — gerund form.
- skills act as additions to models — ефективність залежить від базової моделі.

---

## 4. Готові скіли-аналоги (приклади реалізації)

### glebis/claude-skills — retrospective skill
6 днів тому. Готовий скіл сесійної ретроспективи.
https://github.com/glebis/claude-skills

Що взяти: `/retrospective` (поточна сесія), `/retrospective today` (усі сесії за
день, мультисесійний режим), `/retrospective 2026-05-24` (конкретна дата);
«reviews conversations, extracts learnings, updates skills»; «Use when: end of
work day to capture learnings across all sessions».

### mcpmarket — Lessons Learned (AI Development Retro)
https://mcpmarket.com/tools/skills/lessons-learned-retrospectives

Що взяти: парсить build-summaries → пропонує уроки → формат у LESSONS.md →
опційно оновлює CLAUDE.md; «enforces high quality standards… prevents generic
platitudes… focuses on actionable, transferable technical knowledge».

### mcpmarket — CLAUDE.md Lessons Manager
https://mcpmarket.com/tools/skills/claude-md-lessons-manager

Що взяти: автоматичний витяг із chat history + terminal output; session-end
reminders; **duplicate detection і rule consolidation** (щоб тримати лін).

### omega-memory / Omega (MCP) — Reddit-драфт із реальним досвідом
https://glama.ai/mcp/servers/@omega-memory/Omega/blob/.../docs/reddit-drafts.md

Що взяти (реальний кейс r/ClaudeAI): «6 місяців daily driver; biggest friction —
context loss, 10-15 хв щосесії на перепояснення архітектури, code preferences,
past debugging». Before/After: «We chose PostgreSQL for ACID, not Redis» — раніше
пояснював щоразу, тепер агент стартує, вже знаючи рішення.

---

## 5. Дотичне (контекст-менеджмент, скіли-код)

### MindStudio — Claude Code Skills: Code Scripts vs Markdown Instructions
01.04.2026. Чому скрипти > markdown.
https://www.mindstudio.ai/blog/claude-code-skills-code-scripts-vs-markdown-instructions
Що взяти: executable scripts ріжуть токени до 90% і роблять задачі надійнішими —
підпирає Capability Uplift і ідею «детектор кодом надійніший за модель».

### MindStudio — Skills vs Hooks: difference and when to use each
30.04.2026.
https://www.mindstudio.ai/blog/claude-code-skills-vs-hooks-difference
Що взяти: «hooks aren't called by Claude — the system calls them»; три-рівнева
пам'ять (capture everything / curate what matters).

### MindStudio — Context Compounding Explained
https://www.mindstudio.ai/blog/claude-code-context-compounding-explained
Що взяти: коротші сфокусовані сесії = менший пік контексту; CLAUDE.md як
fixed-size system input (не компаундиться з історією).

---

## 6. Готова конструкція скіла для курсу (синтез усього вище)

**Назва:** engineering-insights. **Пише в:** LEARNINGS.md того модуля, якого
торкалась задача (apps/client, apps/server, packages/reviewer-core,
packages/repo-intel) — у кожного свій файл. **Режим:** append-only.

**Секції LEARNINGS.md** (з MindStudio, адаптовано до 4 категорій):
- What Works (Pattern) · What Doesn't Work (Mistake/antipattern) ·
  Codebase Patterns + Tool/Library Notes (Context) · Decisions (рішення з
  причиною) · Recurring Errors & Fixes · Session Notes (datestamped) ·
  Open Questions.

**Тригер:** подвійний — у кінці задачі (wrap-up) + capture as you go при
неочевидному. Cadence: сесії >30 хв з проблемою/рішенням/відкриттям.

**Формат запису:** дата + категорія + суть + доказ file:line. Actionable «cold».

**Анти-банальність:** тест «якби це було очевидно будь-кому, хто читає код, — не
пиши». Vague vs useful — приклади з MindStudio.

**Контроль:** monthly prune (застаріле = шкідливе); вирішення конфліктів; ліміт
~200 записів або дроблення на доменні файли; LEARNINGS — чернетка під спот-чек;
git-версіонування.

**Замикання петлі (CLAUDE.md):**
- Session Context: «before work, read LEARNINGS.md; treat as high-confidence
  guidance unless told otherwise».
- End of Session: «run /engineering-insights to update LEARNINGS.md; do not skip».
- Start-check, що форсить читання: «confirm you've read LEARNINGS.md and
  summarize top 3 relevant points».

**Арка курсу:** L01 пишемо скіл, бачимо ефект І ненадійність автоспрацювання →
L06 Stop-hook робить capture автоматичним і безвідмовним (бо «if it requires a
human trigger, it won't happen consistently enough to be useful»).
