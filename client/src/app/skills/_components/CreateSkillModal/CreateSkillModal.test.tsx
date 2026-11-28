import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import type { Skill } from "@devdigest/shared";
import { ApiErrorReply, mockApi, renderWithProviders } from "@/test/render";
import { CreateSkillModal } from "./CreateSkillModal";

const CREATED: Skill = {
  id: "sk7",
  name: "no-todo",
  description: "Flag TODO comments",
  type: "custom",
  source: "manual",
  body: "# Rule",
  enabled: true,
  version: 1,
  agent_count: 0,
};

function fill() {
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "no-todo" } });
  fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: "Flag TODO comments" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Skill body" }), { target: { value: "# Rule" } });
}

describe("CreateSkillModal", () => {
  it("creates the skill and hands its id to onCreated", async () => {
    const calls = mockApi((method, path) => (method === "POST" && path === "/skills" ? CREATED : []));
    const onCreated = vi.fn();
    renderWithProviders(<CreateSkillModal onClose={() => {}} onCreated={onCreated} />);
    const create = screen.getByRole("button", { name: "Create skill" });
    expect(create).toBeDisabled();

    fill();
    fireEvent.click(create);

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("sk7"));
    expect(calls.find((c) => c.method === "POST")).toEqual({
      method: "POST",
      path: "/skills",
      body: { name: "no-todo", description: "Flag TODO comments", type: "custom", body: "# Rule" },
    });
  });

  it("shows a server rejection inline and keeps the modal open", async () => {
    mockApi(() => new ApiErrorReply(400, { error: { code: "skill_name_taken", message: "A skill named no-todo exists." } }));
    const onCreated = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(<CreateSkillModal onClose={onClose} onCreated={onCreated} />);

    fill();
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A skill named no-todo exists.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByDisplayValue("no-todo")).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
