import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Skill } from "@devdigest/shared";
import { mockFetch, renderWithProviders, userEvent } from "@/test/render";
import { SkillConfigTab } from "./SkillConfigTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const SKILL: Skill = {
  id: "s1",
  name: "pr-rubric",
  description: "Rubric for PR quality",
  type: "rubric",
  source: "manual",
  body: "# Title\n\nline three\nline four",
  enabled: true,
  version: 5,
};

const setup = (routes: Record<string, unknown> = {}, onDeleted = vi.fn()) => {
  const calls = mockFetch(routes);
  renderWithProviders(<SkillConfigTab skill={SKILL} onDeleted={onDeleted} />);
  return { calls, onDeleted };
};
const nameInput = () => screen.getByLabelText(/^Name/);
const bodyInput = () => screen.getByLabelText(/^Skill body/);
const save = () => screen.getByRole("button", { name: "Save" });

describe("SkillConfigTab", () => {
  it("shows the fields, version chip and a clean state", () => {
    setup();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("v5")).toBeInTheDocument();
    expect(nameInput()).toHaveValue("pr-rubric");
    expect(screen.getByLabelText("Description")).toHaveValue("Rubric for PR quality");
    expect(screen.getByLabelText("Type")).toHaveValue("rubric");
    expect(screen.getByText(/skill’s interface/)).toBeInTheDocument();
    expect(screen.getByText("pr-rubric.md")).toBeInTheDocument();
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it("renders a token estimate and one gutter number per line", async () => {
    setup();
    expect(screen.getByText(`${Math.ceil(SKILL.body.length / 4)} tokens`)).toBeInTheDocument();
    const gutter = screen.getByTestId("line-gutter");
    expect(gutter).toHaveAttribute("aria-hidden", "true");
    expect(Array.from(gutter.children).map((c) => c.textContent)).toEqual(["1", "2", "3", "4"]);
    await userEvent.type(bodyInput(), "a\nb\nc\nd\ne\nf");
    expect(gutter.children).toHaveLength(6);
    expect(screen.getByText("3 tokens")).toBeInTheDocument();
  });

  it("marks the form unsaved when it differs, and Discard restores it", async () => {
    setup();
    await userEvent.type(nameInput(), "renamed");
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    expect(save()).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(nameInput()).toHaveValue("pr-rubric");
    expect(screen.queryByText("unsaved")).not.toBeInTheDocument();
  });

  it("Save PUTs only the changed fields and confirms", async () => {
    const { calls } = setup({ "PUT /skills/s1": { ...SKILL, body: "new body", version: 6 } });
    await userEvent.type(bodyInput(), "new body");
    await userEvent.click(save());
    await waitFor(() => expect(calls.find((c) => c.method === "PUT")).toBeDefined());
    expect(calls.find((c) => c.method === "PUT")).toMatchObject({ path: "/skills/s1", body: { body: "new body" } });
    expect(Object.keys(calls.find((c) => c.method === "PUT")!.body as object)).toEqual(["body"]);
    expect(await screen.findByText(/saved\./)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("unsaved")).not.toBeInTheDocument());
  });

  it("invalid input shows errors and blocks Save", async () => {
    const { calls } = setup();
    await userEvent.type(nameInput(), "");
    expect(within(nameInput().parentElement!).getByRole("alert")).toHaveTextContent("This field is required.");
    expect(save()).toBeDisabled();
    await userEvent.type(nameInput(), "bad/name");
    expect(screen.getByRole("alert")).toHaveTextContent("Use letters, digits");
    await userEvent.type(nameInput(), "ok-name");
    await userEvent.type(screen.getByLabelText("Description"), "x".repeat(501));
    expect(screen.getByRole("alert")).toHaveTextContent("at most 500");
    expect(save()).toBeDisabled();
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("the Enabled switch PUTs { enabled }", async () => {
    const { calls } = setup({ "PUT /skills/s1": { ...SKILL, enabled: false } });
    fireEvent.click(within(screen.getByRole("group", { name: "Enable skill pr-rubric" })).getByRole("switch"));
    await waitFor(() => expect(calls.find((c) => c.method === "PUT")).toBeDefined());
    expect(calls.find((c) => c.method === "PUT")!.body).toEqual({ enabled: false });
  });

  it("Delete asks for confirmation, then calls onDeleted", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { calls, onDeleted } = setup({ "DELETE /skills/s1": {} });
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith("s1"));
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});
