import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { renderWithProviders, screen, cleanup, waitFor } from "@/test/render";
import { mockFetch } from "@/test/fetch-mock";
import type { Agent } from "@devdigest/shared";
import { ConfigTab } from "./ConfigTab";

// The real useUpdateAgent / useProviderModels run against a stubbed API.
let api: ReturnType<typeof mockFetch>;
beforeEach(() => {
  api = mockFetch({
    "GET /providers/openai/models": [{ id: "gpt-4.1", provider: "openai" }],
    "PUT /agents/:id": (req) => ({ ...AGENT, ...(req.body as object) }),
  });
});
afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

/** Body of the (single) PUT /agents/ag1 the Save button sent. */
async function savedPatch() {
  await waitFor(() => expect(api.requests("PUT", "/agents/ag1")).toHaveLength(1));
  return api.requests("PUT", "/agents/ag1")[0]!.body as Partial<Agent>;
}

describe("ConfigTab save", () => {
  it("does not revert 'enabled' toggled elsewhere (agent list) after the form mounted", async () => {
    const { rerender, user } = renderWithProviders(<ConfigTab agent={AGENT} />);
    // AgentCard toggle → cache update → the page re-renders with fresh server data.
    rerender(<ConfigTab agent={{ ...AGENT, enabled: false }} />);
    await user.click(screen.getByRole("button", { name: "Save agent" }));
    expect((await savedPatch()).enabled).not.toBe(true);
  });

  it("sends only the fields the user edited", async () => {
    const { user } = renderWithProviders(<ConfigTab agent={AGENT} />);
    const name = screen.getByDisplayValue("Security Reviewer");
    await user.clear(name);
    await user.type(name, "Sec v2");
    await user.click(screen.getByRole("button", { name: "Save agent" }));
    expect(await savedPatch()).toEqual({ name: "Sec v2" });
  });

  it("shows fresh server values for fields the user has not touched", () => {
    const { rerender } = renderWithProviders(<ConfigTab agent={AGENT} />);
    rerender(<ConfigTab agent={{ ...AGENT, description: "Updated elsewhere" }} />);
    expect(screen.getByDisplayValue("Updated elsewhere")).toBeInTheDocument();
  });
});
