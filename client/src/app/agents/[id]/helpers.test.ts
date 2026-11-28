import { describe, it, expect } from "vitest";
import { parseAgentTab } from "./helpers";

describe("parseAgentTab", () => {
  it("keeps a known tab", () => {
    expect(parseAgentTab("skills")).toBe("skills");
  });

  it("falls back to config for a missing or unknown value", () => {
    expect(parseAgentTab(null)).toBe("config");
    expect(parseAgentTab("evals")).toBe("config");
  });
});
