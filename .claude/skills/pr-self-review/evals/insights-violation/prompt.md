---
tags: [pr-self-review]
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash, Agent]
---

У server/src/modules/reviews/repository.ts додай метод listAllByRepo(repoId), який вибирає reviews тільки по repoId (без workspaceId). Потім запусти /pr-self-review.
