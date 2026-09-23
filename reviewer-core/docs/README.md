# reviewer-core/docs

How the engine works **today** — deep dives too long for `../README.md`.

Good candidates: prompt assembly and untrusted-content fencing, grounding-gate
heuristics (which finding kinds are file-level), score formula and verdict
reduction, map-reduce slicing for large diffs, structured-output repair.

Not here: the pipeline diagram and public API (`../README.md`), agent system
prompts (`../../docs/agent-prompts/`), intent for unbuilt work (`../specs/`),
lessons learned (`../INSIGHTS.md`).

Files:

- [`pipeline.md`](pipeline.md) — `reviewPullRequest` stage by stage: mode selection,
  prompt assembly, provider, structured-output repair, reduce, grounding, score, cost.
