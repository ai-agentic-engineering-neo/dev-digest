import { describe, it, expect } from "vitest";
import { queryKeys } from "./keys";

// Keys are cache identity: renaming one silently orphans cached data and
// breaks invalidation between hooks. Changing a value here must be deliberate.
describe("queryKeys", () => {
  it("keeps the exact key arrays", () => {
    expect(queryKeys.settings()).toEqual(["settings"]);
    expect(queryKeys.secretsStatus()).toEqual(["secrets-status"]);
    expect(queryKeys.providerModelsAll()).toEqual(["provider-models"]);
    expect(queryKeys.providerModels("openrouter")).toEqual(["provider-models", "openrouter"]);
    expect(queryKeys.repos()).toEqual(["repos"]);
    expect(queryKeys.pulls("r1")).toEqual(["pulls", "r1"]);
    expect(queryKeys.pull("p1")).toEqual(["pull", "p1"]);
    expect(queryKeys.context("r1")).toEqual(["context", "r1"]);
    expect(queryKeys.repoIntelState("r1")).toEqual(["repo-intel-state", "r1"]);
    expect(queryKeys.agents()).toEqual(["agents"]);
    expect(queryKeys.agent("a1")).toEqual(["agent", "a1"]);
    expect(queryKeys.prActiveRuns("p1")).toEqual(["pr-active-runs", "p1"]);
    expect(queryKeys.prRuns("p1")).toEqual(["pr-runs", "p1"]);
    expect(queryKeys.reviews("p1")).toEqual(["reviews", "p1"]);
    expect(queryKeys.prComments("p1")).toEqual(["pr-comments", "p1"]);
    expect(queryKeys.runTrace("t1")).toEqual(["run-trace", "t1"]);
  });

  it("keeps the provider-models prefix a prefix of every provider key", () => {
    expect(queryKeys.providerModels("openai").slice(0, 1)).toEqual(queryKeys.providerModelsAll());
  });
});
