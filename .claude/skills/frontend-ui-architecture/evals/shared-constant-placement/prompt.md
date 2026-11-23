---
tags: [frontend-ui-architecture]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

I am working in client/. FindingCard and FindingsPanel (both under app/repos/[repoId]/pulls/[number]/_components) now need the same severity ordering. FindingsPanel/constants.ts already has SEVERITY_ORDER. Where should it live so we do not duplicate it? Just tell me the files to touch, no need to edit anything.
