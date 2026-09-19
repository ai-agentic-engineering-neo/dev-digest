# server insights

Append-only. One dated bullet per non-obvious fact: what, why it matters, where it applies.

- 2026-09-19: Migrations are not run on boot; run them explicitly. Applies to `src/db`.
- 2026-09-19: An unindexed repo silently degrades to diff-only review. Applies to `src/modules/repo-intel`, `src/modules/reviews`.
