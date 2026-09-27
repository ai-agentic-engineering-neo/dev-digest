# `modules/skills` — серверна половина фічі Skills

Загальна спека: [`../../specs/skills.md`](../../specs/skills.md).
Архітектурні правила (шари, порти): `.claude/skills/onion-architecture/`.

## Файли модуля

```
src/modules/skills/
  routes.ts       driving adapter: Zod-схеми + HTTP
  service.ts      use cases; бере SkillsDeps { db } (не Container)
  repository.ts   driven adapter: skills, skill_versions, agent_skills (read)
  helpers.ts      чисті: row→DTO, правило бампу версії, рендер блоку промпта
  extract.ts      чисті: frontmatter + markdown → ядро скіла
  archive.ts      чистий читач ZIP (node:zlib, без залежностей)
  community.ts    вбудований каталог community-скілів (константи)
  constants.ts    ліміти, дефолти, класифікація виконуваних файлів
```

## API

| Метод | Шлях | Призначення |
|---|---|---|
| GET | `/skills` | список воркспейса + `agent_count` одним IN-запитом |
| GET | `/skills/:id` | один скіл |
| POST | `/skills` | створення (`source='manual'`, знімок v1) |
| PUT | `/skills/:id` | оновлення; зміна тіла → `version+1` + знімок |
| DELETE | `/skills/:id` | видалення (зв'язки каскадом) |
| GET | `/skills/:id/versions` | історія, новіші перші |
| GET | `/skills/:id/versions/:version` | один знімок |
| POST | `/skills/:id/versions/:version/restore` | тіло знімка → **нова** версія |
| GET | `/skills/:id/agents` | агенти, що використовують скіл (вкладка Stats) |
| GET | `/skills/community` | вбудований каталог, фільтри `q`, `lang` |
| POST | `/skills/import/preview` | **нічого не пише**; віддає прев'ю |
| POST | `/skills/import` | створення після підтвердження |

`POST /skills/import/preview` приймає або файл
(`{ filename, content_base64 }`), або запис каталогу (`{ community_id }`), і
повертає `SkillImportPreview`: `name, description, type, source, body,
files_used[], files_skipped[], warnings[]`. Обидві гілки union'а — `.strict()`:
тіло з обома наборами полів не «виграє» першою гілкою, а відхиляється як
неоднозначне.

Обидва import-роути мають **власний `bodyLimit`**. Глобальний ліміт застосунку —
1 МБ, а base64 роздуває завантаження в ~4/3, тож без цього файл, дозволений
`MAX_UPLOAD_BYTES`, помирав би сирим 413 ще до хендлера.

## Імпорт

- `.md` → frontmatter (`name`, `description`) + тіло. Без frontmatter ім'я
  беремо з першого `#`-заголовка, інакше з імені файлу.
- `.zip` → читаємо central directory, розпаковуємо **тільки** кандидатів на ядро
  (`SKILL.md`, `skill.md`, `README.md`, перший `*.md` за глибиною шляху). Решта
  потрапляє у `files_skipped` з причиною (`executable` / `not-markdown`).
- Виконуваним вважається файл із розширенням `sh|bash|zsh|js|mjs|cjs|ts|py|rb|
  pl|ps1|bat|cmd|exe` або з каталогу `scripts/`, `bin/`, `hooks/`.
- Ліміти (`constants.ts`): архів ≤ 2 МБ, ≤ 200 записів, розпакований файл ≤ 512 КБ,
  тіло скіла ≤ 64 КБ. Перевищення → 422 з поясненням, а не мовчазна обрізка.
  Ліміт тіла продубльовано у Zod-схемах роутів, щоб межа спрацьовувала на краю.
- ZIP-бомба і path traversal: розпаковуємо лише вибрані markdown-записи, шлях
  нормалізуємо і відкидаємо `..`; нічого не пишемо на диск.
- **Розміри із заголовків архіву не є межею.** Вони контрольовані тим, хто
  зібрав архів: занижений `compressedSize` дав би мовчазно обрізаний скіл,
  завищений — прохід повз ліміт. Тому зріз перевіряється проти довжини буфера,
  а для нестиснених записів межа береться з фактичної довжини даних; для
  deflate межу тримає `maxOutputLength`.

## Цілісність версій

- `insert` пише `skills` і знімок v1 **в одній транзакції**: скіл із
  порожньою історією зламав би саме ту гарантію, заради якої версії існують.
- `update` — read-modify-write, тому теж транзакція **плюс** умова на прочитану
  версію (`WHERE version = <прочитана>`). Два одночасні збереження інакше
  порахували б ту саму наступну версію, і другий знімок було б утрачено.
- Порожній патч (`PUT /skills/:id {}` або тіло лише з `note`) — **no-op**, а не
  500: drizzle кидає `No values to set` на порожньому `set`, а всі поля схеми
  роуту опційні.
- `agent_skills` має індекс по `skill_id` (міграція `0012`): PK покриває
  напрямок «агент → скіли», а екран Skills і каскад при видаленні читають
  зворотний.

## Скіли в прогоні ревʼю

`modules/reviews/deps.ts` оголошує **власний вузький порт** (той самий прийом,
що `AgentsReader`), щоб не імпортувати data-layer чужого модуля:

```ts
export interface SkillsReader {
  linkedEnabled(agentId: string): Promise<
    { id: string; name: string; type: string; source: string; body: string }[]
  >;
}
```

`SkillsRepository` задовольняє його структурно; реєстрація — у композиційному
корені (`platform/container.ts`), як і `agentsRepo`.

`run-executor` перед викликом рушія:

1. `skillsRepo.linkedEnabled(agent.id)` — уже відсортовано за `agent_skills.order`
   і відфільтровано за `skills.enabled`;
2. `renderSkillBlocks()` (чистий, у `reviews/helpers.ts`) → `string[]`;
3. пише в лог прогону скільки блоків додано і які саме;
4. передає рушію `skills` (поле вже є в `ReviewInput`).

Вимкнений або не прив'язаний скіл не змінює жодного байта промпта — саме це
робить контрольний експеримент чесним.

## Тести

- `test/skills-extract.test.ts` — герметичні: frontmatter, вибір ядра з архіву,
  класифікація виконуваних файлів, ліміти, рендер блоку промпта.
- `test/skills.it.test.ts` — БД: CRUD, версії + restore, `agent_count`,
  прив'язка/порядок, імпорт (прев'ю нічого не пише → підтвердження пише),
  порожній патч як no-op, відмова неоднозначному тілу прев'ю.
- `test/reviews-skills.it.test.ts` — БД: прогін без скілів має
  `prompt_assembly.skills === null`; той самий прогін із двома прив'язаними
  скілами має обидва блоки в порядку `order`, а вимкнений скіл у промпт не
  потрапляє.
