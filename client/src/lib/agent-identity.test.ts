import { describe, it, expect } from "vitest";
import { agentIdentity } from "./agent-identity";

describe("agentIdentity (D21)", () => {
  it("is a pure function of the agent id — same id, same identity, every call", () => {
    expect(agentIdentity("agent-1")).toEqual(agentIdentity("agent-1"));
  });

  it("differs for at least some distinct ids (not a constant)", () => {
    const ids = ["agent-1", "agent-2", "agent-3", "agent-4", "agent-5"];
    const colors = new Set(ids.map((id) => agentIdentity(id).color));
    expect(colors.size).toBeGreaterThan(1);
  });
});
