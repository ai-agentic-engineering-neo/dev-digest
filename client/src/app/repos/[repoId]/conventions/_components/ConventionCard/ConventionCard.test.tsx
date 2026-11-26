import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { ConventionCard, type ConventionCardProps } from "./ConventionCard";
import { makeCandidate, renderWithProviders } from "../../test-utils";

afterEach(cleanup);

function renderCard(over: Partial<ConventionCardProps> = {}) {
  const props: ConventionCardProps = {
    candidate: makeCandidate(),
    repoFullName: "acme/payments-api",
    commitSha: "abc1234",
    selected: false,
    onToggleSelect: vi.fn(),
    onStatus: vi.fn(),
    onEdit: vi.fn(),
    ...over,
  };
  renderWithProviders(<ConventionCard {...props} />);
  return props;
}

describe("ConventionCard", () => {
  it("shows the rule, category, every evidence with a pinned GitHub link, the counter-example and confidence", () => {
    renderCard();
    expect(screen.getByText("Use async/await instead of .then() chains")).toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23-24")).toBeInTheDocument();
    expect(screen.getByText("src/api/orders.ts:2")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: /GitHub/ });
    expect(links[0]).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/abc1234/src/api/users.ts#L23-L24",
    );
    expect(links[1]).toHaveAttribute("href", "https://github.com/acme/payments-api/blob/abc1234/src/api/orders.ts#L2");
    expect(screen.getByText("db.users.find(id).then((u) => u);")).toBeInTheDocument();
    expect(screen.getByText("91%")).toBeInTheDocument();
  });

  it("has no GitHub link without a repo name, and no checkbox while pending", () => {
    renderCard({ repoFullName: null });
    expect(screen.queryByRole("link", { name: /GitHub/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("accept / reject / edit call back; clicking the active status does nothing", () => {
    const props = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(props.onStatus).toHaveBeenLastCalledWith("accepted");
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(props.onStatus).toHaveBeenLastCalledWith("rejected");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(props.onEdit).toHaveBeenCalled();

    cleanup();
    const acc = renderCard({ candidate: makeCandidate({ status: "accepted", accepted: true }) });
    expect(screen.getByRole("button", { name: "Accepted" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Accepted" }));
    expect(acc.onStatus).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(acc.onStatus).toHaveBeenLastCalledWith("rejected");
  });

  it("pins GitHub links to the given SHA, and a legacy row links the file without lines", () => {
    renderCard({
      candidate: makeCandidate({ evidence: undefined, evidence_path: "src/old.ts", evidence_snippet: "old()" }),
      commitSha: "rowsha1",
    });
    expect(screen.getByText("src/old.ts")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /GitHub/ })).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/rowsha1/src/old.ts",
    );
  });

  it("an accepted card is selectable and shows the skills it went into", () => {
    const props = renderCard({
      candidate: makeCandidate({ status: "accepted", accepted: true, skill_names: ["payments-api-conventions"] }),
      selected: true,
    });
    const box = screen.getByRole("checkbox", { name: "Select for a skill" });
    expect(box).toHaveAttribute("aria-checked", "true");
    fireEvent.click(box);
    expect(props.onToggleSelect).toHaveBeenCalled();
    expect(screen.getByText("in payments-api-conventions")).toBeInTheDocument();
  });

  it("copies a snippet", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderCard();
    fireEvent.click(screen.getAllByRole("button", { name: "Copy snippet" })[0]!);
    expect(writeText).toHaveBeenCalledWith("const user = await db.users.find(id);");
    expect(await screen.findByText("Snippet copied")).toBeInTheDocument();
  });
});
