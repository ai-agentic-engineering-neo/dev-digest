import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { llmJudge, skillTask } from "../../src/harness.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const THRESHOLD = 0.6;

test("review flags widget-module layering violations", async () => {
  const diff =
    `### service.ts\n${readFileSync(join(FIXTURES, "widgets-service.ts"), "utf8")}\n\n` +
    `### routes.ts\n${readFileSync(join(FIXTURES, "widgets-routes.ts"), "utf8")}`;
  const prompt =
    "You are reviewing a backend module in a Fastify 5 + Drizzle ORM codebase organised as " +
    "onion-architecture modules under server/src/modules/. Below are two files from a new " +
    "modules/widgets/ directory. Review them for architectural / layering problems only. For " +
    "each problem: name the violation, say which layer the code sits in vs where it belongs, " +
    "and state the concrete fix. Output only your review.\n\n" + diff;

  const result = await skillTask(prompt, "onion-architecture", { allowedTools: [] });
  const verdict = await llmJudge(result.text, [
    "flagged the direct Drizzle DB query inside service.ts as a layering violation and said DB access belongs in a repository / infrastructure layer",
    "flagged that the service leaks the Drizzle row type out of infrastructure and should return a domain / shared-contract DTO instead",
    "flagged that an adapter is instantiated inside the service and said adapters must be constructed in the DI container / composition root and injected",
    "flagged the branching business logic and the direct DB lookup inside the route handler as violations of the thin-route rule",
    "gave a concrete fix (move the query into a repository) rather than only saying the code is wrong",
  ]);
  expect(verdict.score, JSON.stringify(verdict.results)).toBeGreaterThanOrEqual(THRESHOLD);
});

test("advises correct layer placement for validation, invariant, and adapter", async () => {
  const prompt =
    "In a Fastify 5 + Drizzle + Zod codebase using onion-architecture modules under " +
    "server/src/modules/, I'm adding a modules/reviews/ module. It needs: (1) a Zod schema " +
    "validating the POST /reviews body, (2) an invariant that a Review can never be created " +
    "with an empty diff, (3) a call to GitHub via a GitHubAdapter to fetch the PR. For each, " +
    "tell me exactly which layer and file it belongs in, and how it should be wired. Output only your answer.";

  const result = await skillTask(prompt, "onion-architecture", { allowedTools: [] });
  const verdict = await llmJudge(result.text, [
    "said the HTTP request/response Zod schema belongs in the presentation layer (routes.ts or a shared schemas file), not in the service",
    "said the empty-diff invariant should be a guard clause that throws in the domain layer with no Zod import",
    "said the GitHubAdapter must be instantiated in the composition root (container) and injected into the service, not constructed inside it",
    "kept the domain layer free of Fastify / Drizzle / Zod imports, consistent with dependencies pointing inward",
  ]);
  expect(verdict.score, JSON.stringify(verdict.results)).toBeGreaterThanOrEqual(THRESHOLD);
});
