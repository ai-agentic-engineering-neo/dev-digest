/* AgentCard — the card itself plus its delete flow: the trash button opens the
   DeleteAgentModal (never the native confirm) and only a confirm deletes. */
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderWithProviders, screen, cleanup, waitFor, within } from "@/test/render";
import { mockFetch } from "@/test/fetch-mock";
import { AGENT } from "@/test/skill-fixtures";
import { AgentCard } from "./AgentCard";

afterEach(cleanup);

describe("AgentCard", () => {
  it("shows name, description, model and the linked-skills count", async () => {
    mockFetch({ "GET /agents/ag1/skills": [{ agent_id: "ag1", skill_id: "sk1", order: 0 }] });
    renderWithProviders(<AgentCard ag={AGENT} />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Flags secrets and injection")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(await screen.findByText("1 skill")).toBeInTheDocument();
  });

  it("Delete opens the confirm modal instead of window.confirm, and deletes on confirm", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const api = mockFetch({ "GET /agents/ag1/skills": [], "DELETE /agents/ag1": { ok: true } });
    const onClick = vi.fn();
    const { user } = renderWithProviders(<AgentCard ag={AGENT} onClick={onClick} />);

    await user.click(screen.getByRole("button", { name: "Delete agent" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByText(/Delete "Security Reviewer"\?/)).toBeInTheDocument();

    await user.click(within(modal).getByRole("button", { name: "Delete agent" }));
    await waitFor(() => expect(api.requests("DELETE", "/agents/ag1")).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Cancel and the X close the modal without deleting", async () => {
    const api = mockFetch({ "GET /agents/ag1/skills": [], "DELETE /agents/ag1": { ok: true } });
    const { user } = renderWithProviders(<AgentCard ag={AGENT} />);

    await user.click(screen.getByRole("button", { name: "Delete agent" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(screen.getByRole("button", { name: "Delete agent" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.requests("DELETE")).toHaveLength(0);
  });
});
