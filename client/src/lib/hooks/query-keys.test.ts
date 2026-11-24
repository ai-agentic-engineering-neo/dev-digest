/* Guards the query-key VALUES: hooks, invalidations and other call sites rely on
   these exact arrays, so a factory refactor must never change them silently. */
import { describe, expect, it } from "vitest";
import { agentQueries } from "./agents";
import { coreQueries } from "./core";
import { repoIntelQueries } from "./repo-intel";
import { reviewQueries } from "./reviews";
import { traceQueries } from "./trace";

describe("query key factories keep the legacy key literals", () => {
  it("core", () => {
    expect(coreQueries.settings().queryKey).toEqual(["settings"]);
    expect(coreQueries.secretsStatus().queryKey).toEqual(["secrets-status"]);
    expect(coreQueries.repos().queryKey).toEqual(["repos"]);
    expect(coreQueries.pulls("r1").queryKey).toEqual(["pulls", "r1"]);
    expect(coreQueries.pullDetail(7).queryKey).toEqual(["pull", 7]);
    expect(coreQueries.contextFiles("r1").queryKey).toEqual(["context", "r1"]);
  });

  it("agents", () => {
    expect(agentQueries.list().queryKey).toEqual(["agents"]);
    expect(agentQueries.detail("a1").queryKey).toEqual(["agent", "a1"]);
    expect(agentQueries.providerModels("openai").queryKey).toEqual(["provider-models", "openai"]);
    expect(agentQueries.providerModelsAll()).toEqual(["provider-models"]);
  });

  it("reviews", () => {
    expect(reviewQueries.activeRuns("p1").queryKey).toEqual(["pr-active-runs", "p1"]);
    expect(reviewQueries.runs("p1").queryKey).toEqual(["pr-runs", "p1"]);
    expect(reviewQueries.forPull("p1").queryKey).toEqual(["reviews", "p1"]);
    expect(reviewQueries.comments("p1").queryKey).toEqual(["pr-comments", "p1"]);
  });

  it("repo-intel", () => {
    expect(repoIntelQueries.state("r1").queryKey).toEqual(["repo-intel-state", "r1"]);
  });

  it("trace", () => {
    expect(traceQueries.run("run1").queryKey).toEqual(["run-trace", "run1"]);
  });

  it("keeps a nullish id in the key (disabled queries keep their old identity)", () => {
    expect(reviewQueries.runs(null).queryKey).toEqual(["pr-runs", null]);
    expect(coreQueries.pulls(undefined).queryKey).toEqual(["pulls", undefined]);
  });
});
