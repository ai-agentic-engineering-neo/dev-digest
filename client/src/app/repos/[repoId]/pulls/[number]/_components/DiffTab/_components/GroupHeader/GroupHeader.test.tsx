import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GroupHeader } from "./GroupHeader";

const LABELS = {
  title: "Core changes",
  description: "Logic that matters most",
  files: "3 files",
  findingFiles: "● 1",
  findingFilesHint: "1 file with findings",
  toggleAll: "Expand all",
};

function renderHeader(props: Partial<React.ComponentProps<typeof GroupHeader>> = {}) {
  const onToggleAll = vi.fn();
  render(
    <GroupHeader
      color="var(--viz-1)"
      findingFiles={1}
      allOpen={false}
      onToggleAll={onToggleAll}
      stickyTop={0}
      labels={LABELS}
      {...props}
    />,
  );
  return { onToggleAll };
}

describe("GroupHeader", () => {
  it("lays out label + description left, then dot N, files, toggle on the right; toggles all", () => {
    const { onToggleAll } = renderHeader();
    const title = screen.getByRole("heading", { level: 3, name: "Core changes" });
    const description = screen.getByText("Logic that matters most");
    const dot = screen.getByText("● 1");
    const files = screen.getByText("3 files");
    const toggle = screen.getByRole("button", { name: "Expand all" });
    const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(title, description)).toBe(true);
    expect(follows(description, dot)).toBe(true);
    expect(follows(dot, files)).toBe(true);
    expect(follows(files, toggle)).toBe(true);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(onToggleAll).toHaveBeenCalledTimes(1);
  });

  it("hides the dot counter at 0 findings and reflects allOpen", () => {
    renderHeader({ findingFiles: 0, allOpen: true });
    expect(screen.queryByText(/●/)).not.toBeInTheDocument();
    // Nothing else (e.g. a stray "0" text node from `findingFiles && …`) may render next to files + toggle.
    const right = screen.getByText("3 files").parentElement;
    expect(right?.textContent).toBe("3 filesExpand all");
    expect(screen.getByRole("button", { name: "Expand all" })).toHaveAttribute("aria-expanded", "true");
  });

  it("is sticky below the offset given by stickyTop", () => {
    renderHeader({ stickyTop: 64 });
    const root = screen.getByRole("heading", { level: 3 }).parentElement;
    expect(root).toHaveStyle({ position: "sticky", top: "64px" });
  });
});
