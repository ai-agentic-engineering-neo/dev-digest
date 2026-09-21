# specs — reviewer-core

One feature = one `YYYY-MM-DD-<kebab-name>.md`, written **before** the code and updated when
scope changes. A spec says what "done" means and how to check it — never how to build it: no file
paths, no function names, no code. That belongs in the plan that follows.

Sections: Problem & why · Goals / Non-goals · User stories · Acceptance criteria (EARS) ·
Edge cases · Non-functional · Cross-module interactions · Contracts · Untrusted inputs ·
Open questions. Each criterion is `AC-N`, phrased in EARS (`WHEN…SHALL`, `IF…THEN…SHALL`,
`WHILE…SHALL`, `WHERE…SHALL`, or a plain `shall`), and carries the observation that proves it.
A criterion nobody can check is a bug in the spec.

**A feature touching two or more packages belongs in the repository-root `specs/`, not here.**

This package changes rarely — most features land in `server/` or `client/` and only pass data into
slots that already exist. A spec belongs here when the engine's own behaviour changes: prompt
assembly, grounding, scoring, structured output.
