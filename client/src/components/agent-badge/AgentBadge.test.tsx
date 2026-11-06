import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AgentBadge, agentColorVar, agentTint } from "./index";

afterEach(cleanup);

describe("AgentBadge", () => {
  it("exposes the label as an image role, and is decorative without one", () => {
    render(<AgentBadge colorIndex={2} label="Security agent" />);
    expect(screen.getByRole("img", { name: "Security agent" })).toBeInTheDocument();
    cleanup();
    render(<AgentBadge colorIndex={2} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("maps the color index to --viz variables and clamps out-of-range values", () => {
    expect(agentColorVar(3)).toBe("var(--viz-3)");
    expect(agentColorVar(0)).toBe("var(--viz-1)");
    expect(agentColorVar(99)).toBe("var(--viz-6)");
    expect(agentTint(4)).toBe("color-mix(in srgb, var(--viz-4) 12%, transparent)");
  });
});
