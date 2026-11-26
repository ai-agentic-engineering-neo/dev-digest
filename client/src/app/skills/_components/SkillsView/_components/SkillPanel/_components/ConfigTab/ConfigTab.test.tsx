import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/skills.json";
import type { Skill } from "@devdigest/shared";
import { ApiError } from "@/lib/api";

const mocks = vi.hoisted(() => ({ update: vi.fn(), toast: { success: vi.fn() } }));
vi.mock("@/lib/hooks/skills", () => ({ useUpdateSkill: () => ({ mutate: mocks.update, isPending: false }) }));
vi.mock("@/lib/toast", () => ({ useToast: () => mocks.toast }));

import { ConfigTab } from "./ConfigTab";

const skill: Skill = {
  id: "s1",
  name: "my-skill",
  description: "Apply when X; check Y.",
  type: "rubric",
  source: "manual",
  body: "# body",
  enabled: true,
  version: 2,
};

function renderTab() {
  const ui = (sk: Skill) => (
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ConfigTab skill={sk} />
    </NextIntlClientProvider>
  );
  const view = render(ui(skill));
  /** Simulate a refetch delivering a changed skill. */
  return (over: Partial<Skill>) => view.rerender(ui({ ...skill, ...over }));
}

beforeEach(() => {
  mocks.update.mockReset();
  mocks.toast.success.mockReset();
});
afterEach(cleanup);

describe("ConfigTab", () => {
  it("is pre-filled from the skill", () => {
    renderTab();
    expect(screen.getByDisplayValue("my-skill")).toBeTruthy();
    expect(screen.getByDisplayValue("# body")).toBeTruthy();
  });

  it("saves the edited fields and confirms the new version", () => {
    mocks.update.mockImplementation((_a, opts) => opts.onSuccess({ version: 3 }));
    renderTab();
    fireEvent.change(screen.getByDisplayValue("# body"), { target: { value: "# changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.update).toHaveBeenCalledWith(
      { id: "s1", patch: expect.objectContaining({ body: "# changed", enabled: true, name: "my-skill" }) },
      expect.any(Object),
    );
    expect(screen.getByText("Saved (v3)")).toBeTruthy();
    expect(mocks.toast.success).toHaveBeenCalledWith("Skill saved (v3)");
  });

  it("blocks saving a blank required field", () => {
    renderTab();
    fireEvent.change(screen.getByDisplayValue("my-skill"), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.update).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
  });

  it("shows a server 422 inline", () => {
    mocks.update.mockImplementation((_a, opts) =>
      opts.onError(new ApiError("Validation failed", 422, "validation", [{ message: "name too long" }])),
    );
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/Validation failed: name too long/)).toBeTruthy();
  });

  it("keeps unsaved edits when only enabled is refetched", () => {
    const refetch = renderTab();
    fireEvent.change(screen.getByDisplayValue("# body"), { target: { value: "# draft" } });
    refetch({ enabled: false });
    expect(screen.getByDisplayValue("# draft")).toBeTruthy();
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mocks.update).toHaveBeenCalledWith(
      { id: "s1", patch: expect.objectContaining({ body: "# draft", enabled: false }) },
      expect.any(Object),
    );
  });

  it("follows later refetches once an enabled change has been saved", () => {
    const refetch = renderTab();
    fireEvent.click(screen.getByRole("switch"));
    refetch({ enabled: false });
    refetch({ enabled: true });
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
  });

  it("resets the form on a new version", () => {
    const refetch = renderTab();
    fireEvent.change(screen.getByDisplayValue("# body"), { target: { value: "# draft" } });
    refetch({ version: 3, body: "# restored" });
    expect(screen.getByDisplayValue("# restored")).toBeTruthy();
  });

  it("keeps the saved message through the post-save refetch, until a newer version", () => {
    mocks.update.mockImplementation((_a, opts) => opts.onSuccess({ version: 3 }));
    const refetch = renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    refetch({ version: 3 });
    expect(screen.getByText("Saved (v3)")).toBeTruthy();
    refetch({ version: 4 });
    expect(screen.queryByText("Saved (v3)")).toBeNull();
  });
});
