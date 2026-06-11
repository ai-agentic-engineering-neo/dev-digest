# repo-intel Tier 3 — специфікація (graph · rank · repo-map · інтеграції)

> **Статус (2026-06-11):** активна. Продовження `docs/repo-intel-plan.md` (T3-секції).
> T1 + T2 уже в `main` (`45b9009`). Цей документ фіксує **рішення §9.5**,
> точні seam'и в наявному коді та план імплементації T3.
>
> Мова коду — англійська (як у репо); ця специфікація — українською, як основний
> план. Acceptance і eval-gate — наприкінці.

---

## 0. Рішення §9.5 (зафіксовано) — `rank = PageRank`, hotness викинуто з v1

Це блокуюче «вирішити-до-T3» питання. План §9.5 називав рекомендованою **Опцію A**
(поглибити shallow-клон заради hotness), збережена нотатка пам'яті — **Опцію B**.
Суперечність знята на користь **Опції B** після дослідження:

1. **Канонічний референс не використовує churn.** [Aider repo-map](https://aider.chat/2023/10/22/repomap.html)
   — патерн, який саме й викладається в курсі — ранжує файли **PageRank'ом по
   графу визначень/референсів**, з персоналізацією лише по chat-контексту. Hotness
   (git-churn) там немає взагалі. Опція B вірна тому, що ми вчимо; Опція A вигадує
   blend, якого в Aider нема.
2. **Churn наодинці — слабкий і шумний сигнал.** Він покращує ранжування лише в
   поєднанні зі складністю / історією дефектів / ownership / co-change, а не як
   голий множник `× (1 + log(commits))`. Цей наївний blend — рівно той «впевнено-
   неправильний індекс», від якого застерігає §3/§14.
3. **Вартість/ризик асиметричні.** Опція A = нові методи git-адаптера
   (`deepen`/`logSince` не існують), deepen-fetch wiring, якого ніде нема, **bump
   `INDEXER_VERSION` → повний реіндекс усіх репо**, тиск на 110-с soft-budget; до
   того ж `--deepen=180.days` не гарантує 180 днів на молодих/shallow-клонах.
   Опція B = ~30–50 LOC, без нових файлів, без зміни clone-шляху.
4. **Low-regret.** Колонка `file_rank.hotness` лишається в схемі. Hotness можна
   додати пізніше (`deepen` + `git.log`) **без зміни схеми**. B — чистий v1, A —
   задокументована майбутня опція. Це закриває й відкрите питання §15.4.

**Конкретика під B:**
- `hotness = 0` завжди; `rank = pagerank` (колонка `rank` = pagerank score).
- `repo_index_state.stats.hotnessAvailable = false`.
- Заголовок repo-map: `# Repo skeleton (top-ranked by import graph only, partial view)`.
- Clone-шлях НЕ чіпаємо (`CLONE_DEPTH = 1` лишається). Git-адаптер НЕ розширюємо
  методами історії.
- guard у `rank.ts`: hotness фіксовано `0` (не рахуємо `git.log` взагалі).

---

## 1. Що вже є (T1+T2) і де саме T3 під'єднується

| Артефакт | Файл | Стан | T3-дія |
|---|---|---|---|
| Facade | `modules/repo-intel/service.ts` | методи-стаби з `TODO(T3)` (рядки 263–477) | заповнити rank-методи |
| Пайплайн full | `modules/repo-intel/pipeline/full.ts` | walk→parse→persist; `status:'partial'` (197), `TODO(T3)` (16, 195, 206) | вставити graph→resolve→rank→repo-map; `status:'full'` на чистому проході |
| Пайплайн incremental | `pipeline/incremental.ts` | slice-reparse; `TODO(T3)` (195) | re-resolve + recompute rank + invalidate repo_map_cache |
| Repository | `modules/repo-intel/repository.ts` | symbols/references/index_state CRUD | **+** edges/rank/repo_map/file_facts методи |
| Схема T2 | `db/schema/repo-intel.ts` | `repoIndexState`, `fileEdges`, `fileFacts` | **+** `fileRank`, `repoMapCache` |
| symbols/references | `db/schema/context.ts` | колонки `endLine/exported/signature/contentHash` (symbols), `declFile/contentHash` (references) **вже є** | пишемо `declFile` у resolve |
| astgrep | `adapters/astgrep/index.ts` | `parseSymbols/References/Imports/InvocationHeads` готові (повертають `exported`, `signature`, import `source`) | переюз як є |
| Constants | `modules/repo-intel/constants.ts` | `BFS_DEPTH=2`, `HOTNESS_WINDOW_DAYS=180`, `DEFAULT_REPO_MAP_TOKEN_BUDGET=1500`, `MAX_SIGNATURE_CHARS=120` | hotness-константа не потрібна під B |

**Важливо:** T3-таблиці (`file_rank`, `repo_map_cache`) у схемі **ще немає** —
коментар у `repo-intel.ts` явно лишає їх «на окремий слайс/міграцію». Repository
**не має** жодного методу для `fileEdges`/`fileFacts` — їх теж додає T3.

---

## 2. Схема: міграція T3 (`0005`)

Додати у `db/schema/repo-intel.ts` (точно за планом §6.3):

```ts
// ------------------------- T3 -------------------------
export const fileRank = pgTable('file_rank', {
  repoId: uuid('repo_id').notNull().references(() => repos.id, { onDelete: 'cascade' }),
  filePath: text('file_path').notNull(),
  pagerank: doublePrecision('pagerank').notNull(),
  hotness: doublePrecision('hotness').notNull(),        // завжди 0 під Опцією B
  rank: doublePrecision('rank').notNull(),              // = pagerank під B
  percentile: smallint('percentile').notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.repoId, t.filePath] }) }));

export const repoMapCache = pgTable('repo_map_cache', {
  repoId: uuid('repo_id').notNull().references(() => repos.id, { onDelete: 'cascade' }),
  commitSha: text('commit_sha').notNull(),
  tokenBudget: integer('token_budget').notNull(),
  mapText: text('map_text').notNull(),
  tokenCount: integer('token_count').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.repoId, t.commitSha, t.tokenBudget] }) }));
```

- Доповнити barrel `db/schema.ts`: `export * from './schema/repo-intel'` уже є — додати
  `fileRank, repoMapCache` у константу `schema`.
- `pnpm --filter @devdigest/api db:generate` → `0005_<slug>.sql`; застосувати `db:migrate`.
- `ON DELETE CASCADE` від `repos.id` закриває acceptance #9 (каскад при видаленні репо).

---

## 3. Адаптери (in-process, лише під `modules/repo-intel/*`)

### 3.1 `adapters/depgraph/` — dependency-cruiser
- API: `cruise(paths, { tsConfig, exclude, doNotFollow })` (програмний, НЕ CLI).
- Експорт: `buildEdges(root: string, files: string[]): Promise<Array<{from:string; to:string}>>`.
- Шляхи — **репо-відносні** (як `symbols.path`/`file_edges.from_file`): нормалізуємо
  абсолютні шляхи cruise назад до relative від `root`.
- Резолв TS-aliases через `detectTsConfig(root)` якщо є `tsconfig.json`.
- Уся фаза в `try/catch`: падіння → `stats.graphFailed = msg`, edges=[], `status='partial'`,
  `rank` рахується по порожньому графу (всі pagerank рівні → percentile рівні).
- Фільтр: лишаємо лише ребра, обидва кінці яких — у проіндексованому файл-сеті
  (`SUPPORTED_EXT`, не в `EXCLUDED_DIRS`), бо граф рангуємо саме по цих вузлах.

### 3.2 `adapters/tokenizer/` — js-tiktoken
- Інтерфейс `Tokenizer { count(text: string): number }`.
- Дефолт `TiktokenTokenizer` на `cl100k_base`; **lazy-init** енкодера (важкий).
- Fallback (поки не під'єднано / помилка): `ceil(text.length / 4)`.
- Підмінний у тестах (мок-лічильник) через ContainerOverrides.

### 3.3 Wiring у Container (`platform/container.ts`)
`RepoIntelService` наразі бере лише `Container`. T3: додати lazy-getter'и
`container.depgraph`, `container.tokenizer` (за патерном існуючих), і прокинути їх
у сервіс/пайплайн через `Container` (не міняючи конструктор сервісу — пайплайн-
функції беруть `container`). Degraded-фолбек лишається `container.codeIndex`.

---

## 4. Пайплайн T3 (нові кроки + wiring)

Порядок у `runFullIndex` (після parse-persist, перед `upsertIndexState`):

**Крок 4 — graph** (`pipeline/graph.ts`): `depgraph.buildEdges(root, files)` →
`repository.replaceEdges(repoId, edges)`. try/catch → `stats.graphFailed`.

**Крок 5 — resolve** (`pipeline/resolve.ts`): для кожного `(fromPath, toSymbol)`
з `references` цього репо знайти `decl_file`:
- кандидати = файли `F`, де `(fromPath → F) ∈ file_edges` І `F` має
  `symbols.name = toSymbol AND exported = true`;
- рівно 1 кандидат → `UPDATE references SET decl_file = F`; 0 або >1 → лишити `NULL`.
- Реалізація — один SQL (join references×file_edges×symbols, `GROUP BY` з
  `COUNT(DISTINCT decl)=1`), не N+1.

**Крок 6 — rank** (`pipeline/rank.ts`):
- `graphology` directed graph: вузли = проіндексовані файли; ребро `from→to` за
  кожним `file_edges` рядком (importer→imported, щоб «фундаментальні» файли
  набирали rank).
- `pagerank(graph)` (graphology-metrics, дефолтні ітерації).
- `hotness = 0`; `rank = pagerank`.
- `percentile`: відсортувати rank DESC, `percentile = round(100 * (1 - idx/n))`
  (еквівалент `ntile(100)`); ізольовані вузли без ребер отримують мінімальний
  pagerank (graphology це робить сам).
- `repository.replaceFileRank(repoId, rows)`.

**Крок 7 — repo-map** (`pipeline/repo-map.ts`, плану §10):
- Кандидати: `symbols JOIN file_rank` `WHERE signature IS NOT NULL ORDER BY
  rank DESC, exported DESC, line ASC`.
- Бінарний пошук по `tokenizer.count` під `DEFAULT_REPO_MAP_TOKEN_BUDGET = 1500`.
- Заголовок: `# Repo skeleton (top-ranked by import graph only, partial view)`.
- Запис у `repo_map_cache (repoId, currentSha, 1500)`.

**Крок 8 — file_facts** (для blast T2-leftover, §6): на parse-фазі по кожному
файлу зібрати `extractEndpoints(src)` / `extractCrons(src)` (existing у
`adapters/codeindex/extract.ts`) → `repository.replaceFileFacts(repoId, rows)`.

**Крок 9 — status:** на чистому проході (немає `softBudgetReached`, `graphFailed`,
`bounded`) → `status = 'full'`; інакше лишається `'partial'`. Замінити рядок 197.

**Incremental (§9.3):** після reparse слайса — re-run graph для дельти (cruise
лише по changed ∪ їх імпортерах достатньо складно → для простоти/коректності
v1: повний `replaceEdges` по всьому файл-сеті дешевий на ≤5000), re-resolve
references з `decl_file IS NULL OR decl_file = ANY(changed)`, повний recompute
`file_rank` (мс), `DELETE FROM repo_map_cache WHERE repo_id=$1` (sha змінився).
Якщо це виявиться дорого — fallback на `runFullIndex` (вже є поріг >300 файлів).

**INDEXER_VERSION:** bump `1 → 2` (extractor поведінка не змінилась, але
з'являються rank/decl_file/edges, тож наявні `partial`-індекси мають
переіндексуватися повністю) — `runIncremental` зробить це автоматично (§9.3 крок 1).

---

## 5. Repository — нові методи

```
replaceEdges(repoId, edges)                 // DELETE+insert file_edges
replaceFileRank(repoId, rows)               // DELETE+insert file_rank
resolveReferences(repoId, changed?)         // UPDATE references.decl_file (SQL join)
replaceFileFacts(repoId, rows)              // DELETE+insert file_facts
getFileRankFor(repoId, paths)               // → {path, percentile}[]
getTopRanked(repoId, n, exclude)            // ORDER BY rank DESC, фільтр тестів/конфігів
getRepoMapCache(repoId, sha, budget)        // SELECT by PK
putRepoMapCache(repoId, sha, budget, text, tokens)
deleteRepoMapCache(repoId)
getRepoMapCandidates(repoId)                // symbols JOIN file_rank (репо-мап SQL §10)
getEdgesFrom(repoId, files) / getEdgesTo()  // BFS для getBlastRadius/getCriticalPaths
getFileFacts(repoId, files)                 // blast endpoints/crons
```

Усі DELETE+insert — батчево (`INSERT_CHUNK_SIZE = 500`, як існуючі).

---

## 6. Facade — заповнити стаби (`service.ts`)

| Метод | T3-реалізація | Degraded |
|---|---|---|
| `getRepoMap` | read `repo_map_cache` by (repo, HEAD sha, budget); hit → `cached:true`; miss → degraded `{text:'',…}` (рендер лише в пайплайні) | flag off / no row → `{text:'', degraded:true}` |
| `getFileRank` | `getFileRankFor` → `{path, percentile}[]` | `[]` |
| `getTopFilesByRank` | `getTopRanked(n, exclude)` | `[]` |
| `getCriticalPaths` | BFS по `file_edges`: найдовші шляхи від high-rank вузлів (top-K), глибина ≤ `BFS_DEPTH` | `[]` |
| `getConventionSamples` | `getTopRanked(n)` мінус тести/конфіги/міграції | `[]` |
| `getBlastRadius` | **rank з `file_rank`** (зараз `rank:0`), callers через `file_edges` reverse-lookup, endpoints з `file_facts` | поточний codeIndex-фолбек, `degraded:true` |
| `getCallerSignatures` | проставити реальний `rank` (зараз `rank:0`, рядок 386) | як є (T1 diff-scoped) |
| `getUnresolvedReferences` | studio: `references.decl_file IS NULL` з persistent; CI/degraded: diff-scoped (як T1) | поточний |

Degraded-контракт із `types.ts` лишається без змін (object-методи несуть
`degraded?`, array-методи → `[]`).

---

## 7. Інтеграції фіч (план §11) — кожна за degraded-guard'ом

| Фіча | Файл | Зміна |
|---|---|---|
| Reviewer prompt | `reviewer-core/src/prompt.ts` | `PromptParts.repoMap?: string`; секція `## Repo skeleton` у `userSections` **перед** `## Project context` |
| run-executor | `modules/reviews/run-executor.ts` | `getRepoMap(repoId,1500)` → slot; `getFileRank(changed)` → рядок «N із M змінених — топ-5%» у task-блок |
| Trace | `vendor/shared/contracts/trace.ts` | `PromptAssembly.repo_map?: string`; подія `repo_intel_read { tokens, cache_hit }` |
| smart-diff | `modules/reviews/smart-diff.ts` | `role==='core'` підтвердити `getFileRank(path).percentile ≥ 80`, інакше → `wiring` |
| conventions | `modules/conventions/extract-pipeline.ts` | `sampleFiles` → `getConventionSamples(repoId,12)`; старий шлях — degraded-фолбек |
| onboarding | `modules/onboarding/facts.ts` (`collectKeyFiles`) | reading path = `getTopFilesByRank(7,{exclude:['test','config']})` ∪ `getCriticalPaths`; grep — фолбек |
| **blast (T2-leftover)** | `modules/blast/service.ts` | `forPull()` → `repoIntel.getBlastRadius(repoId, changedFiles)`; чинна ripgrep-логіка лишається degraded-фолбеком; прибрати дубльований запис symbols/references коли індексатор — єдиний writer |
| Client | `client/src/lib/hooks/repo-intel.ts` (new) + `ProjectContextView` | `useRepoIntelStatus`/`useReindexRepoIntel`; бейдж `full/partial/degraded` + Reindex |

---

## 8. Acceptance (підмножина плану §13, T3)

4. `getRepoMap(repoId,1500)` → `tokenCount ≤ 1500`; повтор на тому ж `commit_sha`
   з `repo_map_cache` < 20 мс (подія `repo_map_cache_hit`).
5. Рев'ю demo-PR: у trace видно `repo_map` + `callers` з токенами; **доданий вхід ≤ 2500 ток.**
9. `DELETE FROM repos` каскадно чистить `file_rank`, `repo_map_cache`, `file_edges`,
   `file_facts` (+ T2 таблиці).
10. `repoIntelEnabled=false` → рев'ю/blast на ripgrep-фолбеку, без звернень до
    `file_edges`/`file_rank` на гарячому шляху; UI = degraded.
- **Новий T3:** чистий повний індекс DevDigest → `status='full'`; `file_rank`
  заповнено для всіх проіндексованих файлів; `references.decl_file` ненульовий
  для однозначних import-резолвів.

**Валідація:** `db:generate && db:migrate`; `typecheck`; `test` (vitest;
інтеграційні `describe.skip` без Docker — testcontainers `pgvector/pgvector:pg16`).
Unit-тести rank/resolve/repo-map — pure, без Docker.

---

## 9. T3 eval-gate (педагогічний ROI, не review-ROI)

T1 мав `docs/repo-intel-t1-eval-recipe.md` (крос-файловий recall ДО/ПІСЛЯ).
T3 додає **інший** клас сигналу — пріоритезацію/контекст, не нові знахідки:
- **Що міряти:** recall/precision на тому ж gold-set із `REPO_INTEL_ENABLED`
  flipped, але AFTER тепер включає `repo_map` у промпті + rank-driven onboarding/
  conventions. Очікування плану (§3): на крос-файлових — помірний приріст; на
  локальних — ~нуль. Якщо `repo_map` не рухає recall — це підтверджує, що T3
  виправданий **педагогічно**, не review-ROI (план §4 це прямо допускає).
- **Додатковий детермінований чек (no-LLM):** `repo_map` стабільний per
  `(commit_sha, budget)` (acceptance §10 плану) → тест на ідентичність тексту між
  двома прогонами на тому ж HEAD (живить prompt-cache).
- Передумови ті самі, що в T1-recipe: Docker + LLM-ключ (§1 того документа).

---

## 10. Відкриті питання

- **§15.4 (depth/hotness)** — ЗАКРИТО рішенням §0 (Опція B).
- **§15.2 (file_facts)** — приймаємо: пишемо `file_facts` у пайплайні (крок 8),
  blast читає звідти (acceptance #3 «нуль парсингу» в studio).
- **§15.3 (legacy ripgrep у blast)** — лишаємо паралельно як degraded-фолбек до
  кінця T3; прибираємо дубль-запис symbols/references, коли індексатор стає
  єдиним writer'ом.
- **§15.6 (indexer-core у спільний пакет для CI)** — НЕ блокує T3 у studio;
  перевідкрити коли repo-intel доїде в `agent-runner` (план §17).

---

## 11. Стан імплементації (2026-06-11) — гілка `feat/repo-intel-tier1`

**Зроблено й зелено** (server typecheck + reviewer-core typecheck чисті; 108
тестів проходять, 53 Docker-gated skip):

- **Схема:** `file_rank` + `repo_map_cache` додані (`db/schema/repo-intel.ts`),
  barrel оновлено, міграція `0005_gray_peter_parker.sql` згенерована (НЕ
  застосована — треба Postgres).
- **Адаптери:** `adapters/depgraph` (dependency-cruiser, repo-relative
  нормалізація, try/catch→[]), `adapters/tokenizer` (js-tiktoken `cl100k_base`
  + `ceil(chars/4)` фолбек); обидва wired у Container (lazy getters + overrides).
- **Пайплайн:** `pipeline/rank.ts` (PageRank, hotness=0, percentile з tie-групами),
  `pipeline/repo-map.ts` (бінарний пошук, dedup dual-emit, заголовок
  «top-ranked by import graph only»). graph+resolve+rank+repo-map+file_facts
  вбудовані у `full.ts` (status='full' на чистому проході) та `incremental.ts`
  (повна перебудова графа+рангу, reset-resolve, інвалідація map). INDEXER_VERSION 1→2.
- **Repository:** +16 методів (replaceEdges/FileRank/FileFacts, resolveReferences
  SQL-CTE, getRepoMapCandidates, getRankedPaths, getFileRankFor, getResolvedCallers,
  getRepoMapCache/put/delete, patchFileFacts, getEdges, getSymbolRows, getFileFacts).
- **Facade:** усі стаби заповнені — getRepoMap (cache by lastIndexedSha),
  getFileRank, getTopFilesByRank, getCriticalPaths (BFS), getConventionSamples,
  getSymbolsInFiles; **getBlastRadius** має persistent-шлях (`tryPersistentBlast`,
  precise callers через resolved decl_file), getCallerSignatures збагачено rank.
- **Інтеграції:** reviewer prompt `repoMap` слот + `## Repo skeleton` (reviewer-core
  prompt.ts + run.ts `ReviewInput.repoMap`); run-executor `buildRepoMapDigest` +
  `buildRankNote` («N з M змінених — топ-5%»); smart-diff `percentile ≥ 80`
  підтвердження core; conventions rank-driven samples; **blast write-gating**
  (коли `repoIntelEnabled` — indexer єдиний writer symbols/references, blast НЕ
  клобберить); onboarding reading-path відсортовано за rank.
- **Тести:** `test/repo-intel-rank-map.test.ts` (9 pure-тестів: PageRank-напрям,
  percentile-ties, budget-binary-search, dedup, tokenizer); `indexer-pipeline.test.ts`
  оновлено (status='full', T3-методи в stub, depgraph/tokenizer у container).

**Дороблено (друга ітерація, 2026-06-11):**

- **Client badge** — `client/src/lib/hooks/repo-intel.ts` (`useRepoIntelStatus` +
  `useReindexRepoIntel`) + бейдж стану (full/partial/degraded, dot+колір+N files) і
  кнопка «Re-index map» у `ProjectContextView`. Прихований у degraded-no-data
  (фіча off → сторінка без змін). Тест замокано; client typecheck + тест зелені.
- **Trace `repo_map` + `callers`** — додано поля `PromptAssembly.repo_map` і
  `.callers` (`vendor/shared/contracts/trace.ts`, `z.string().nullish()` —
  backward-compatible), заповнюються в `assemblePrompt`. Per-slot облік токенів
  (acceptance §5) тепер можливий, не лише сумарний user-каунт.
- **onboarding `∪ getCriticalPaths`** — reading-path = `getTopFilesByRank(7)` ∪
  `getCriticalPaths` (rank спершу, потім ланцюги), сортує існуючі keyFiles;
  degrade → евристичний порядок.

**Лишилось заблокованим:**

- **Eval-gate прогін** (§9) — потребує Docker daemon + LLM-ключ. У цьому
  середовищі **Docker недоступний** → testcontainers/Postgres не стартують
  (як і для T1-recipe). Код + проводка готові; вимір — коли буде Docker+ключ.
