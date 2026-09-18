# 01 — Skills (series)

Reusable markdown skills, bound onto review agents, assembled into the prompt.

Split into three specs (answers in [`01-questions-1-skills.md`](./01-questions-1-skills.md)):

| Spec | Folder | What it delivers |
|---|---|---|
| 1 | this folder | [Skills library](./01-spec-skills.md) — CRUD, list, editor (Config / Preview / Versions) |
| 2 | [`../02-spec-skills-agent-binding`](../02-spec-skills-agent-binding/02-spec-skills-agent-binding.md) | Agent Skills tab, enable/order, prompt + trace |
| 3 | [`../03-spec-skills-import-and-test-quality`](../03-spec-skills-import-and-test-quality/03-spec-skills-import-and-test-quality.md) | File/archive import, seeded catalog, Test Quality Reviewer, control experiment |

Implement in that order. Spec 2 needs spec 1’s API. Spec 3 needs spec 2’s prompt wiring.
