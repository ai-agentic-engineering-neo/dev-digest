---
paths:
  - "server/src/db/migrations/**"
---

# Міграції БД — лише генерувати

Файли в `server/src/db/migrations/` (SQL + `meta/` зі snapshot'ами) створює drizzle-kit.

- Змінюєте схему в `server/src/db/schema/*.ts`, потім `cd server && pnpm db:generate`.
- Не редагувати, не перейменовувати й не видаляти наявні файли, навіть застосовані: snapshot'и в `meta/`
  розсинхронізуються, а свіжа БД (CI, колега) отримає іншу схему, ніж ваша.
- `0000_init.sql` вмикає розширення pgvector (`CREATE EXTENSION vector`); без нього не створяться таблиці з `vector(1536)`.
- Застосувати: `pnpm db:migrate` (на Windows див. `INSIGHTS.md` у корені — скрипт мовчки нічого не робить).
