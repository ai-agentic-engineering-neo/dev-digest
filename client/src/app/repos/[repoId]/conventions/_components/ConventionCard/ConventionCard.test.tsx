import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { renderWithProviders, candidate } from "../../_test/harness";
import { ConventionCard } from "./ConventionCard";
import { githubEvidenceUrl } from "./helpers";

afterEach(cleanup);

const GH = "https://github.com/acme/api/blob/main/src/api/users.ts#L5";

const setup = (over = {}, href: string | null = GH) => {
  const onStatus = vi.fn();
  const onSave = vi.fn();
  renderWithProviders(
    <ConventionCard candidate={candidate(over)} evidenceHref={href} onStatus={onStatus} onSave={onSave} />,
  );
  return { onStatus, onSave };
};

describe("ConventionCard", () => {
  it("shows the rule, source file with a GitHub link, snippet and confidence percent", () => {
    setup();
    expect(screen.getByText("Throw NotFoundError for a missing row instead of returning null")).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:5")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open src\/api\/users\.ts:5 on github/i })).toHaveAttribute("href", GH);
    expect(screen.getByText(/throw new NotFoundError\("User not found"\)/)).toBeInTheDocument();
    expect(screen.getByTestId("confidence")).toHaveTextContent("90%");
    expect(screen.getByText("seen in 2 files")).toBeInTheDocument();
  });

  it("renders the path as plain text (no link) when there is no GitHub URL", () => {
    setup({}, null);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:5")).toBeInTheDocument();
  });

  it("has Accept, Reject and Edit buttons", () => {
    setup();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("Accept requests status accepted; Reject requests rejected", () => {
    const { onStatus } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onStatus).toHaveBeenLastCalledWith("accepted");
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onStatus).toHaveBeenLastCalledWith("rejected");
  });

  it("an accepted card is visually distinct and Accept toggles it back to pending", () => {
    const { onStatus } = setup({ status: "accepted" });
    expect(screen.getByRole("article")).toHaveAttribute("data-status", "accepted");
    const btn = screen.getByRole("button", { name: "Accepted" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(btn);
    expect(onStatus).toHaveBeenLastCalledWith("pending");
  });

  it("Edit is inline: fields appear on the card, Save sends the trimmed edit, no navigation", () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    fireEvent.change(screen.getByLabelText("Rule"), {
      target: { value: "  Throw NotFoundError for a missing row  " },
    });
    fireEvent.change(screen.getByDisplayValue(/Callers rely on the throw/), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith({ rule: "Throw NotFoundError for a missing row", rationale: null });
    // Back to read mode.
    expect(screen.queryByLabelText("Rule")).not.toBeInTheDocument();
  });

  it("Cancel discards the edit; Save is blocked for an empty rule", () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Rule"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Throw NotFoundError for a missing row instead of returning null")).toBeInTheDocument();
  });
});

describe("githubEvidenceUrl", () => {
  it("builds a blob link with a line anchor, encoding segments", () => {
    expect(githubEvidenceUrl("acme/api", "main", "src/a b/x.ts", 12)).toBe(
      "https://github.com/acme/api/blob/main/src/a%20b/x.ts#L12",
    );
  });

  it("falls back to HEAD, omits the anchor without a line, and is null without a repo or path", () => {
    expect(githubEvidenceUrl("acme/api", undefined, "a.ts")).toBe("https://github.com/acme/api/blob/HEAD/a.ts");
    expect(githubEvidenceUrl(undefined, "main", "a.ts")).toBeNull();
    expect(githubEvidenceUrl("acme/api", "main", "")).toBeNull();
  });
});
