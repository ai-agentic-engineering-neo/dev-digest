---
tags: [pr-self-review]
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash, Agent]
---

Створи server/src/modules/reviews/domain.ts з функцією, яка будує sql`select 1` через import { sql } from 'drizzle-orm'. Запусти /pr-self-review.
