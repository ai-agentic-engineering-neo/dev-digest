/**
 * Workflow-level evals — the SYSTEMIC tier. Unlike skill/agent evals (which inject an
 * artifact's content in isolation), these load the real on-disk harness
 * (settingSources:["project"] → CLAUDE.md + project skills/agents) and ask: does a subagent
 * actually get dispatched, does a skill actually activate, does CLAUDE.md change behavior?
 *
 * Note: in this harness a skill can influence behavior via auto-injection without always
 * emitting a discrete Skill event on small models — so activation is checked as
 * "invoked the Skill tool OR read the skill's SKILL.md", and a fidelity run may use
 * EVAL_MODEL=claude-sonnet-5.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { runClaude, workflowTask, type Result } from "../src/harness.js";

const AUTH_DIFF = "evals/agents/architecture-reviewer/fixtures/auth-route-violation.diff";
const API_DOC = "server/docs/api-contracts.md";

/** Did a skill engage? Either an explicit Skill tool-call, or reading its SKILL.md. */
function activated(result: Result, skill: string): boolean {
  const bySkill = result.skillsInvoked.some((s) => s === skill || s.endsWith(`:${skill}`));
  const byRead = result.filesRead.some((f) => f.includes(`skills/${skill}/SKILL.md`));
  return bySkill || byRead;
}

test("dispatches the architecture-reviewer subagent for a review task", async () => {
  const result = await workflowTask(
    `Use the architecture-reviewer subagent to audit the diff at ${AUTH_DIFF} against the ` +
      `project's structural contracts, then summarize its findings. Do not edit any files.`,
    { maxTurns: 6 },
  );
  expect(result.subagents, `subagents: ${result.subagents.join(", ")}`).toContain("architecture-reviewer");
  expect(result.numTurns).toBeLessThanOrEqual(6); // efficiency: no runaway turn loop
});

test("engineering-insights activates on a discovery-recording prompt", async () => {
  const result = await workflowTask(
    "I just figured out why the pgvector query returned nothing — turns out the column dimension " +
      "was never migrated. Record this non-obvious discovery for future sessions.",
    { maxTurns: 4 },
  );
  expect(
    activated(result, "engineering-insights"),
    `skills: ${result.skillsInvoked.join(", ")} | reads: ${result.filesRead.join(", ")}`,
  ).toBe(true);
});

test("NEGATIVE: engineering-insights does not activate on an unrelated question", async () => {
  const result = await workflowTask("What is 2 + 2? Answer in one word.", { maxTurns: 2 });
  expect(activated(result, "engineering-insights")).toBe(false);
});

test("CLAUDE.md routes an API-route task to the api-contracts doc (control vs treatment)", async () => {
  const prompt =
    "I'm about to add a new API route POST /reviews/:id/rerun to the server. Before writing any " +
    "code, follow this repository's own conventions for what documentation to consult first, and " +
    "actually read whatever those conventions tell you to read. Do NOT write any files.";
  const tools = ["Read", "Grep", "Glob"];

  // Treatment: real harness loaded → CLAUDE.md's "Read When" rule should route to the doc.
  const treatment = await workflowTask(prompt, { allowedTools: tools, maxTurns: 6 });
  // Control: an empty temp dir with NO on-disk config and none of the repo's docs, so the
  // session has neither the routing rule nor the file to open. (Running the control in the
  // repo doesn't isolate CLAUDE.md — a capable model finds the doc by search anyway.)
  const emptyCwd = mkdtempSync(join(tmpdir(), "eval-control-"));
  const control = await runClaude(prompt, { allowedTools: tools, maxTurns: 6, cwd: emptyCwd, settingSources: [] });

  const treatmentRead = treatment.filesRead.some((f) => f.includes(API_DOC));
  const controlRead = control.filesRead.some((f) => f.includes(API_DOC));
  expect(treatmentRead, `treatment reads: ${treatment.filesRead.join(", ")}`).toBe(true);
  // The measured value of CLAUDE.md: with the harness it routes to the right doc; the
  // control (no harness, no docs) cannot.
  expect(controlRead, `control reads: ${control.filesRead.join(", ")}`).toBe(false);
});
