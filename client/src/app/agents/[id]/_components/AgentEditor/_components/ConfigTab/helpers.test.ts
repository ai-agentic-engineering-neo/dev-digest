import { describe, it, expect } from "vitest";
import { changedFields } from "./helpers";

const AGENT = {
  name: "A",
  description: "d",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "p",
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
} as const;

describe("changedFields", () => {
  it("returns only edited fields that differ from the agent", () => {
    expect(changedFields(AGENT, { name: "B", model: "gpt-4.1" })).toEqual({ name: "B" });
  });

  it("is empty when nothing was edited", () => {
    expect(changedFields(AGENT, {})).toEqual({});
  });
});
