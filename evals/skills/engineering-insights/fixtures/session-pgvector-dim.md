# Session trace — reviewer-core embeddings returning zero matches

Context: worked ~40 min on why `findSimilarFindings()` in `reviewer-core/` always returned an
empty list even though rows existed in the `findings` table.

What happened, in order:

1. First assumed the query was wrong. Rewrote the pgvector `<=>` distance query three times.
   No change — still zero rows back.
2. Added a log of the embedding length. The stored embeddings were length **1536**, but the new
   query embedding coming from the injected `LLMProvider` was length **3072**.
3. Root cause: we switched the embedding model from `text-embedding-3-small` (1536 dims) to
   `text-embedding-3-large` (3072 dims) two weeks ago, but the `vector(1536)` column type in the
   Drizzle schema was never migrated. pgvector silently returns no rows when dimensions mismatch
   inside a distance comparison rather than throwing — that silence is what cost the time.
4. Fix: added migration `alter column embedding type vector(3072)` and re-embedded existing rows.
   Considered making the column dimension-agnostic (`vector` with no length) but rejected it — the
   ivfflat index requires a fixed dimension, and we would lose the index.

Decision recorded: pin the embedding model id and its dimension together in one config constant so
they can never drift apart again.

Unknowns: did not measure the re-embedding cost for the full table; left as a follow-up.
