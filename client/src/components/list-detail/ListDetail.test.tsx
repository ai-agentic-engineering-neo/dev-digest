import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { ListDetail } from "./ListDetail";

afterEach(cleanup);

describe("ListDetail", () => {
  it("renders the header and list in a labelled column and the pane beside it", () => {
    render(
      <ListDetail listLabel="Things" listHeader={<h1>Things</h1>} list={<p>item one</p>}>
        <p>selected item</p>
      </ListDetail>,
    );
    const column = screen.getByRole("complementary", { name: "Things" });
    expect(within(column).getByRole("heading", { name: "Things" })).toBeInTheDocument();
    expect(within(column).getByText("item one")).toBeInTheDocument();
    expect(within(column).queryByText("selected item")).not.toBeInTheDocument();
    expect(screen.getByText("selected item")).toBeInTheDocument();
  });
});
