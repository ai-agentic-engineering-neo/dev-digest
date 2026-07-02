import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { llmJudge, patternMatch, skillTask } from "../../src/harness.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const THRESHOLD = 0.6;

test("records the pgvector dimension-mismatch insight faithfully", async () => {
  const session = readFileSync(join(FIXTURES, "session-pgvector-dim.md"), "utf8");
  const prompt =
    "Here is a trace of a debugging session I just finished. Produce the INSIGHTS.md entry that " +
    "should be recorded for it. Output only the entry text you would append.\n\n" + session;

  const result = await skillTask(prompt, "engineering-insights", { allowedTools: [] });

  // Cheap deterministic tier first — do not pay the judge for what a substring check settles.
  // The concrete evidence (both dimensions, the right module) must be present verbatim.
  const grounded = patternMatch(result.text, ["1536", "3072", "reviewer-core"]);
  expect(grounded, `missing concrete evidence; output:\n${result.text}`).toBe(1);

  const verdict = await llmJudge(result.text, [
    "captured the concrete root cause (a dimension mismatch causing silent zero rows), not just the symptom",
    "recorded the specific dimensions involved (1536 vs 3072) as evidence rather than a vague statement",
    "noted the rejected alternative (a dimension-agnostic vector column) and why it was rejected",
    "left the unmeasured re-embedding cost as an explicit follow-up / n-a instead of inventing a number",
  ]);
  expect(verdict.score, JSON.stringify(verdict.results)).toBeGreaterThanOrEqual(THRESHOLD);
});
