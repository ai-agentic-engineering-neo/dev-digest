# План: скіл `pr-self-review`

## Context

Перед відкриттям PR у `otkachuk777/dev-digest` потрібна локальна самоперевірка: кожен змінений файл проганяється через ті проєктні скіли, які його стосуються (UI-скіли → `client/`, бекенд-архітектурні → `server/` / `reviewer-core/`). Якщо є хоч один **підтверджений critical** finding, PR не можна відкривати/мержити. Скіл також запускається вручну (`/pr-self-review`).

Рішення, погоджені з юзером:
- **Блокування:** PreToolUse hook на `gh pr create` / `gh pr merge` (лише для команд, які запускає Claude).
- **Мапінг скілів:** статична таблиця glob → скіли всередині скіла.
- **Обсяг diff:** гілка vs `merge-base main` + staged + unstaged + untracked.
- **Доповнення:** waiver, verify-pass для critical, інкрементальний кеш, детерміновані guard-и, summary в PR body, контроль покриття мапи, ліміти.

## Файли

Нове — `.claude/skills/pr-self-review/`:
```
SKILL.md                    # workflow (кроки нижче)
references/skill-map.md     # glob → скіли + skip-список згенерованих файлів
references/severity.md      # рубрика critical / major / minor
references/agent-prompt.md  # промпт рев'ю-агента і verify-агента, формат JSON
scripts/changed-files.sh    # змінені файли (обсяг diff) мінус skip-список
scripts/fingerprint.sh      # sha256(HEAD + повний diff + вміст untracked)
scripts/guards.sh           # детерміновані critical-перевірки без LLM
scripts/gate.sh             # PreToolUse hook: allow / deny
scripts/gate.test.sh        # runnable self-check: gate.sh + валідність skill-map
```
Стан (gitignored) — `.claude/.pr-self-review/`: `verdict.json`, `report.md`, `cache.json`.
Комітиться — `.claude/pr-self-review-waivers.json` (з'являється при першому waiver).

Змінити:
- `.claude/settings.json` — `PreToolUse` (matcher `Bash`) → `.claude/skills/pr-self-review/scripts/gate.sh`, поряд з наявним `SessionStart`.
- `.gitignore` — `.claude/.pr-self-review/`.
- `.claude/skills/README.md` — рядок у Catalog (Scope: Shared).

## Workflow у SKILL.md

1. **Зібрати зміни:** `scripts/changed-files.sh` = `git diff --name-only $(git merge-base main HEAD)` ∪ `--cached` ∪ `git ls-files --others --exclude-standard`, без видалених, мінус skip-список (`*.snap`, `server/.dependency-cruiser-known-violations.json`, `server/src/db/migrations/meta/*`, lock-файли — їх перевіряє guard, не LLM). Порожньо → PASS.
2. **Детерміновані guard-и** (`scripts/guards.sh`, кожне спрацювання = critical з `skill: guard`):
   - змінено lock-файл (`client/pnpm-lock.yaml`, `server/pnpm-lock.yaml`, `reviewer-core/package-lock.json`, `e2e/package-lock.json`), а відповідний `package.json` — ні;
   - у `server/src/db/migrations/meta/_journal.json` є видалені рядки (`git diff` з `^-` в entries — history лише append);
   - `diff -r` між копіями `*/src/vendor/shared/` розходиться у файлах, які зачеплені diff-ом;
   - зачеплено `server/`|`reviewer-core/` → `cd server && pnpm arch` (нове порушення dependency-cruiser; baseline не чіпати);
   - `pnpm typecheck` у кожному зачепленому модулі, де є цей script (`client`, `server`).
3. **Розкласти по скілах** за `references/skill-map.md` (файл може йти в кілька скілів; скіл без файлів не запускається):

   | Glob | Скіли |
   |---|---|
   | `client/src/**/*.{ts,tsx}` | `frontend-ui-architecture`, `react-best-practices` |
   | `client/src/app/**`, `client/next.config.*` | `next-best-practices` |
   | `client/**/*.test.tsx` | `react-testing-library` |
   | `server/src/**`, `reviewer-core/src/**` | `onion-architecture` |
   | `server/src/**/routes.ts`, `server/src/{app,server}.ts`, `server/src/platform/**` | `fastify-best-practices` |
   | `server/src/db/**`, `server/src/**/repository*` | `drizzle-orm-patterns` |
   | `server/src/db/schema/**`, `server/src/db/migrations/*.sql` | `postgresql-table-design` |
   | `*/src/vendor/shared/contracts/**` | `zod` |
   | усі `*.{ts,tsx,js,cjs,mjs}` поза тестами | `security` |

   Поза мапою свідомо: `mermaid-diagram`, `engineering-insights`, `typescript-expert` (надто загальний → шум).
   **Покриття:** файли, які не потрапили в жоден скіл (і не в skip), виводяться у звіті як «не перевірено скілами» — щоб мапа не застарівала непомітно.
4. **Інкрементальний кеш:** `cache.json` = `{ "<skill>|<git hash-object файлу>": [findings] }`. Для кожного скіла рев'юяться лише файли, яких немає в кеші; решта findings береться з кешу. Зміна `SKILL.md` скіла (його hash теж у ключі кеша скіла) інвалідує весь кеш цього скіла.
5. **Рев'ю по скілах:** один `Agent` (general-purpose, `model: sonnet`) на кожен скіл з некешованими файлами, **паралельно, одним повідомленням**. Промпт з `references/agent-prompt.md`: шлях до `SKILL.md` (прочитати повністю, references — за потреби), файли, їхній diff, `severity.md`. Рев'ю **лише змінених рядків**. Відповідь — JSON-масив `{skill, severity, file, line, rule, problem, scenario, fix}`. Великі diff (> ~1500 рядків на скіл) ділити на кілька агентів по файлах.
6. **Verify-pass:** кожен LLM-critical окремо перевіряє ще один sonnet-агент («прочитай код, підтверди конкретним сценарієм або спростуй»). Спростований → понижується до major з позначкою. Guard-critical не верифікуються (детерміновані).
7. **Waiver-и:** `.claude/pr-self-review-waivers.json` = `[{file, rule, reason, fingerprint_of_line?}]`, `reason` обов'язковий. Critical, що збігся з waiver (`file` + `rule`), не блокує, але йде у звіт і в PR body як «waived: reason». Waiver додається лише за явною командою юзера — скіл не створює їх сам.
8. **Агрегація:** дедуп за `file:line+rule`, сортування critical → major → minor. Звіт у чат (таблиця) + `report.md`.
9. **Вердикт:** `BLOCKED`, якщо ≥1 critical, що не waived, інакше `PASS`. `verdict.json` = `{status, fingerprint: $(scripts/fingerprint.sh), critical_count, waived_count, created_at}`.
10. **Далі:** `PASS` і скіл запущено перед PR → `gh pr create` (fork `otkachuk777/dev-digest`, base `main`), у body додати секцію `## Self-review` (кількість major/minor, waiver-и з reason, «не перевірено скілами»). `BLOCKED` → показати critical-и з фіксами, PR не відкривати.

Frontmatter `description`: тригери «before opening a pull request / gh pr create / перед PR / self-review».

## `references/severity.md`

- **critical** (блокує): security-вразливість (OWASP з `security`), секрет у коді, нове порушення dependency rule, втрата даних / деструктивна міграція, зламаний API-контракт client↔server, будь-яке спрацювання guard.
- **major** (не блокує, першим у звіті): порушення конвенцій зі скілів (placement, `'use client'` boundary, fat `routes.ts`, hooks misuse).
- **minor**: стиль, поради.
- Правило для агентів: у сумнівних випадках понижувати; critical лише з конкретним `file:line` і `scenario`.

## `scripts/gate.sh` (hook)

- stdin JSON → `tool_input.command` (`jq`). Не `gh pr create` / `gh pr merge` → `exit 0`.
- Немає `verdict.json` → deny «запусти /pr-self-review». `fingerprint` ≠ поточний → deny «зміни після рев'ю, перезапусти (кеш зробить це швидко)». `BLOCKED` → deny з кількістю critical і шляхом до `report.md`. Інакше allow.
- Deny = `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"…"}}`.

Свідома межа: hook не бачить `gh` / GitHub UI, які юзер запускає руками. Справжню заборону мержу на GitHub (status check + branch protection) додамо, якщо знадобиться.

## Порядок імплементації

**Модель:** імплементує Sonnet. Після затвердження: план → `docs/cc-plans/`, стоп. Юзер перемикає модель сесії на Sonnet і дає команду почати.

1. `superpowers:writing-skills` / `skill-creator` — структура і description.
2. Скрипти: `changed-files.sh`, `fingerprint.sh`, `guards.sh`, `gate.sh` + `gate.test.sh`. Прогнати.
3. `SKILL.md` + `references/*`.
4. `settings.json`, `.gitignore`, README catalog.
5. Plan-файл → `docs/cc-plans/2026-09-19+pr-self-review-skill.md`, в тому ж коміті.

## Verification

1. `bash .claude/skills/pr-self-review/scripts/gate.test.sh`:
   - не-PR команда → allow;
   - немає verdict → deny;
   - stale fingerprint → deny;
   - BLOCKED → deny;
   - PASS + свіжий fingerprint → allow;
   - кожен скіл із `skill-map.md` існує в `.claude/skills/`.
2. E2E на тимчасовій гілці: імпорт `drizzle-orm` у `server/src/modules/<m>/routes.ts` + `dangerouslySetInnerHTML` з user input у client-компоненті + ручна правка рядка в `client/pnpm-lock.yaml` → `/pr-self-review` → `BLOCKED`. Очікування:
   - у звіті є guard (lock-файл, `pnpm arch`) і підтверджений `security` critical;
   - UI-скіли отримали лише client-файли, бекенд-скіли — лише server-файли.
3. Claude запускає `gh pr create` → hook deny з поясненням.
4. Прибрати lock-правку і drizzle-імпорт, додати waiver для `security` finding → перезапуск:
   - повторно рев'юяться лише змінені файли (кеш);
   - `PASS` з «waived» у звіті;
   - hook пропускає.
5. Змінити будь-який файл → hook знову deny (stale). Гілку відкотити, нічого не пушити.
