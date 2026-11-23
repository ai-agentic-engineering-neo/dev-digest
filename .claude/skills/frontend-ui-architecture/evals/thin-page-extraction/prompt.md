---
tags: [frontend-ui-architecture]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

client/src/app/repos/[repoId]/pulls/[number]/page.tsx has grown to ~185 lines with a pile of data hooks, derived findings and drawer/tab state. I need to add one more query and a derived value to it. Before I do, how would you restructure it, and where would the new logic go? Propose the file layout, do not edit.
