/* specs/13-multi-agent-review.md §8 — the multi-select extension
   (`checked` + `keepOpen`) must be additive: a plain row (neither field set)
   keeps closing the menu on activation exactly as before, while a `keepOpen`
   checked row does not. */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Dropdown } from "./Dropdown";

afterEach(cleanup);

describe("Dropdown", () => {
  it("a plain single-select row still dismisses the menu on activation", () => {
    render(<Dropdown trigger={<button>Open</button>} items={[{ label: "Item A", onClick: () => {} }]} />);
    fireEvent.click(screen.getByText("Open"));
    fireEvent.click(screen.getByText("Item A"));
    expect(screen.queryByText("Item A")).not.toBeInTheDocument();
  });

  it("a keepOpen checked row does not dismiss the menu on activation", () => {
    render(
      <Dropdown
        trigger={<button>Open</button>}
        items={[{ label: "Item B", checked: false, keepOpen: true, onClick: () => {} }]}
      />,
    );
    fireEvent.click(screen.getByText("Open"));
    fireEvent.click(screen.getByText("Item B"));
    expect(screen.getByText("Item B")).toBeInTheDocument();
  });

  it("a row with `checked` set renders menuitemcheckbox semantics", () => {
    render(
      <Dropdown
        trigger={<button>Open</button>}
        items={[{ label: "Item C", checked: true, keepOpen: true, onClick: () => {} }]}
      />,
    );
    fireEvent.click(screen.getByText("Open"));
    expect(screen.getByRole("menuitemcheckbox", { name: "Item C" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
