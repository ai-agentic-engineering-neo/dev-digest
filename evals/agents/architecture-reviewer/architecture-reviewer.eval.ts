import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { agentTask, llmJudge } from "../../src/harness.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const THRESHOLD = 0.6;

// Same shape as a skill eval: the agent's definition is injected as the system prompt and
// the agent reviews a fixture diff. Measures the agent's CONTENT, independent of routing
// (routing/dispatch is covered separately in workflow/).
test("finds layering + secret violations with cited rules", async () => {
  const diff = readFileSync(join(FIXTURES, "auth-route-violation.diff"), "utf8");
  const prompt =
    "Audit the following diff against the project's structural contracts. For each violation, " +
    "name it and cite the specific rule it breaks. Do not edit any files. Output only your review.\n\n" +
    diff;

  const result = await agentTask(prompt, "architecture-reviewer", { allowedTools: [] });
  const verdict = await llmJudge(result.text, [
    "identified business logic living in the route handler instead of a service",
    "flagged the direct process.env read that bypasses the injected secrets provider",
    "flagged the route talking to the database / ORM directly (infrastructure concern in the presentation layer)",
    "cited a specific structural contract or rule for each violation rather than vague opinion",
  ]);
  expect(verdict.score, JSON.stringify(verdict.results)).toBeGreaterThanOrEqual(THRESHOLD);
});
