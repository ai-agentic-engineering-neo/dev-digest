import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { renderWithProviders, mockFetch, SKILL_ITEM } from "../../_test/harness";
import { SkillRow } from "./SkillRow";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FLAGGED = {
  ...SKILL_ITEM,
  id: "s13",
  name: "skil-13",
  enabled: false,
  injection_detected: true,
  injection_matches: [{ rule: "instruction-override", severity: "high" as const, line: 3, excerpt: "ignore previous instructions" }],
};

function renderRow(skill = SKILL_ITEM, extra: Partial<React.ComponentProps<typeof SkillRow>> = {}) {
  const props = { onClick: vi.fn(), onToggle: vi.fn(), onDeleted: vi.fn(), ...extra };
  renderWithProviders(<SkillRow skill={skill} {...props} />);
  return props;
}

describe("SkillRow", () => {
  it("shows name, type, description, source with version, and agent count", () => {
    renderRow();
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Rubric for evaluating overall PR quality")).toBeInTheDocument();
    expect(screen.getByText("Manual · v2")).toBeInTheDocument();
    expect(screen.getByText("3 agents")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("labels file imports 'Imported' and URL imports 'Imported (URL)'", () => {
    renderRow({ ...SKILL_ITEM, source: "extracted" });
    expect(screen.getByText("Imported · v2")).toBeInTheDocument();
    cleanup();
    renderRow({ ...SKILL_ITEM, source: "imported_url", version: 13 });
    expect(screen.getByText("Imported (URL) · v13")).toBeInTheDocument();
  });

  it("clicking the row calls onClick, but the toggle and trash do not", () => {
    const { onClick, onToggle } = renderRow();
    fireEvent.click(screen.getByText("pr-quality-rubric"));
    expect(onClick).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "Delete skill pr-quality-rubric" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  describe("delete", () => {
    it("trash opens a confirm dialog naming the skill and the agents it will be unlinked from", () => {
      renderRow();
      fireEvent.click(screen.getByRole("button", { name: "Delete skill pr-quality-rubric" }));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText('Delete "pr-quality-rubric"?')).toBeInTheDocument();
      expect(dialog).toHaveTextContent("unlinked from 3 agents");
      expect(dialog).toHaveTextContent("can’t be undone");
    });

    it("uses copy without an agent count for an unused skill", () => {
      renderRow({ ...SKILL_ITEM, used_by: 0 });
      fireEvent.click(screen.getByRole("button", { name: "Delete skill pr-quality-rubric" }));
      expect(screen.getByRole("dialog")).toHaveTextContent("not linked to any agent");
    });

    it("confirming sends DELETE and reports it; the row click never fires", async () => {
      const fetchMock = mockFetch({ "DELETE /skills/s1": { ok: true } });
      const { onClick, onDeleted } = renderRow();
      fireEvent.click(screen.getByRole("button", { name: "Delete skill pr-quality-rubric" }));

      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/skills/s1"),
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(onClick).not.toHaveBeenCalled();
      expect(await screen.findByText("Skill deleted")).toBeInTheDocument();
    });

    it("Cancel and ✕ close the dialog without deleting", () => {
      const fetchMock = mockFetch({});
      const { onDeleted, onClick } = renderRow();
      fireEvent.click(screen.getByRole("button", { name: "Delete skill pr-quality-rubric" }));
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Delete skill pr-quality-rubric" }));
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(onDeleted).not.toHaveBeenCalled();
      expect(onClick).not.toHaveBeenCalled();
    });

    it("keeps the dialog open when the server refuses", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "nope" } }), { status: 500 })));
      const { onDeleted } = renderRow();
      fireEvent.click(screen.getByRole("button", { name: "Delete skill pr-quality-rubric" }));
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
      await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" })).toBeEnabled());
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(onDeleted).not.toHaveBeenCalled();
    });
  });

  describe("injection", () => {
    it("shows the injection badge and a locked, off toggle", () => {
      const { onToggle } = renderRow(FLAGGED);
      expect(screen.getByText("Injection detected")).toBeInTheDocument();
      const lock = document.querySelector('[aria-disabled="true"]')!;
      expect(lock).toHaveAttribute("title", expect.stringContaining("cannot be enabled"));
      expect(lock).toHaveAttribute("inert");
      expect(within(lock as HTMLElement).getByRole("switch", { hidden: true })).toHaveAttribute("aria-checked", "false");
      fireEvent.click(within(lock as HTMLElement).getByRole("switch", { hidden: true }));
      expect(onToggle).not.toHaveBeenCalled();
    });

    it("does not show the badge for a clean skill", () => {
      renderRow();
      expect(screen.queryByText("Injection detected")).not.toBeInTheDocument();
      expect(document.querySelector('[aria-disabled="true"]')).toBeNull();
    });
  });
});
