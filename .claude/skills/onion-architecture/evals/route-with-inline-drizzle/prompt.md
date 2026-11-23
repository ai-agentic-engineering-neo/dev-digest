---
tags: [onion-architecture]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

In server/, the GET /repos/:id/pulls handler in src/modules/pulls/routes.ts queries Drizzle directly and syncs from GitHub inline. I need to add an optional "author" filter to that endpoint. Where should the query change and the filter rule go, and should I refactor the whole handler while I am there? Tell me the files and the plan, do not edit anything.
