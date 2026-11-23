---
tags: [onion-architecture]
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Add a new "labels" module to server/: CRUD for labels on a PR, with the rule that a PR can have at most 5 labels. What files do I create, where does the 5-label rule go, how is it tested, and how is the module registered?
