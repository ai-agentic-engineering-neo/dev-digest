/* CreateAgentModal — the model is picked from the selected provider's live
   model list (real hooks over a stubbed API), not typed by hand. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderWithProviders, screen, cleanup, waitFor } from "@/test/render";
import { mockFetch } from "@/test/fetch-mock";

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

import { CreateAgentModal } from "./CreateAgentModal";

let api: ReturnType<typeof mockFetch>;
beforeEach(() => {
  api = mockFetch({
    "GET /providers/openai/models": [{ id: "gpt-4.1", provider: "openai" }],
    "GET /providers/openrouter/models": [
      { id: "openai/gpt-4.1", provider: "openrouter" },
      { id: "qwen/qwen3-coder", provider: "openrouter" },
    ],
    "POST /agents": (req) => ({ id: "ag1", ...(req.body as object) }),
  });
});
afterEach(cleanup);

describe("CreateAgentModal model picker", () => {
  it("lists the selected provider's models and creates the agent with the picked one", async () => {
    const { user } = renderWithProviders(<CreateAgentModal onClose={() => {}} />);
    await user.selectOptions(screen.getByRole("combobox"), "openrouter");

    // The openai default is not an OpenRouter id: the model is cleared and Create waits for a pick.
    expect(screen.queryByText("gpt-4.1")).not.toBeInTheDocument();
    const create = screen.getByRole("button", { name: "Create agent" });
    expect(create).toBeDisabled();

    await user.click(screen.getByText("Search models…"));
    await user.click(await screen.findByText("qwen/qwen3-coder"));
    await user.click(create);

    await waitFor(() => expect(api.requests("POST", "/agents")).toHaveLength(1));
    expect(api.requests("POST", "/agents")[0]!.body).toMatchObject({
      provider: "openrouter",
      model: "qwen/qwen3-coder",
    });
  });
});
