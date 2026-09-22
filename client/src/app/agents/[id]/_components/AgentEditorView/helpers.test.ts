import { describe, it, expect } from "vitest";
import { agentHref, resolveTab } from "./helpers";

describe("AgentEditorView helpers", () => {
  it("resolveTab keeps a known tab and falls back to config otherwise", () => {
    expect(resolveTab("config")).toBe("config");
    expect(resolveTab(undefined)).toBe("config");
    expect(resolveTab("nope")).toBe("config");
    expect(resolveTab(["config", "skills"])).toBe("config");
  });

  it("agentHref puts the tab in the query string", () => {
    expect(agentHref("ag1", "config")).toBe("/agents/ag1?tab=config");
  });
});
