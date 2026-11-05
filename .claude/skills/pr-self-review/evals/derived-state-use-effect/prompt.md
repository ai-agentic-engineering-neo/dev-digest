---
tags: [pr-self-review]
max_turns: 40
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash, Agent]
---

У client/src/components додай компонент PullCount.tsx, який отримує pulls: PullRequest[] і показує кількість відкритих: збережи відфільтрований масив у useState і онови його в useEffect([pulls]). Потім запусти /pr-self-review.
