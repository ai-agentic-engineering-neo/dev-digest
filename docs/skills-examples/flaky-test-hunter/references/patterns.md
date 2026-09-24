# Flaky test patterns — reference

Background for humans. Not sent to the model: only `SKILL.md` is imported, and
this file is listed under `ignored_files` as a `reference_doc`.

| Pattern | Why it flakes | Deterministic fix |
|---|---|---|
| `await sleep(100)` before an assertion | CI machines are slower; 100 ms is sometimes not enough | Await the operation, or poll with a deadline |
| `expect(Date.now() - start).toBeLessThan(50)` | Timing depends on load | Fake timers; assert on calls, not durations |
| Tests share a DB row | Passes only in file order | Create the data inside each test; reset in `beforeEach` |
| `Promise.all` + asserting which finished first | Completion order is not guaranteed | Assert on the collected results |
| Random ids decide a branch | Different branch per run | Seed the generator or pass fixed data |
| Unit test calls a real URL | Network outages, rate limits | Inject a stub transport |
