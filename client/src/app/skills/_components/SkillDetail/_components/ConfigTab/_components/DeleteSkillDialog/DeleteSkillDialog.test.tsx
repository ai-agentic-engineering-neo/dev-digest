import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { makeSkill } from "@/app/skills/_components/fixtures";
import { fetchCalls, mockFetch, renderWithProviders } from "@/app/skills/_components/test-utils";
import { DeleteSkillDialog } from "./DeleteSkillDialog";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDialog() {
  const onClose = vi.fn();
  const onDeleted = vi.fn();
  renderWithProviders(<DeleteSkillDialog skill={makeSkill()} onClose={onClose} onDeleted={onDeleted} />);
  return { onClose, onDeleted };
}

describe("DeleteSkillDialog", () => {
  it("lists the agents using the skill and deletes on confirm", async () => {
    const spy = mockFetch({
      "GET /skills/sk1/agents": [
        { agent_id: "a1", agent_name: "Security Reviewer" },
        { agent_id: "a2", agent_name: "Style Reviewer" },
      ],
      "DELETE /skills/sk1": { ok: true },
    });
    const { onClose, onDeleted } = renderDialog();
    expect(screen.getByRole("dialog")).toHaveTextContent("Delete secret-leakage-gate?");
    expect(await screen.findByText("Used by 2 agents: Security Reviewer, Style Reviewer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(fetchCalls(spy)).toContainEqual(["DELETE", "/skills/sk1", undefined]);
    expect(await screen.findByText("Deleted secret-leakage-gate")).toBeInTheDocument();
  });

  it("says when no agent uses it, and stays open when the delete fails", async () => {
    const spy = mockFetch({
      "GET /skills/sk1/agents": [],
      "DELETE /skills/sk1": () => ({ status: 500, body: {} }),
    });
    const { onClose, onDeleted } = renderDialog();
    expect(await screen.findByText("No agent uses this skill.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete skill" }));
    await waitFor(() => expect(fetchCalls(spy).map(([method]) => method)).toContain("DELETE"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete skill" })).toBeEnabled());
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
