import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  repo_id: "r1",
  rule: "Validate request bodies with a Zod schema.",
  rationale: "Every public shape is parsed at the edge.",
  category: "typing",
  evidence_path: "src/user.ts",
  evidence_line: 3,
  evidence_snippet: "export const UserSchema = z.object({",
  confidence: 0.82,
  status: "pending",
  created_at: "2026-09-22T10:00:00.000Z",
};

const handlers = () => ({
  onToggleSelected: vi.fn(),
  onStatus: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
});

function renderCard(
  over: Partial<ConventionCandidate> = {},
  h = handlers(),
  selected = false,
) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard
        candidate={{ ...CANDIDATE, ...over }}
        selected={selected}
        repoFullName="acme/payments-api"
        repoBranch="main"
        {...h}
      />
    </NextIntlClientProvider>,
  );
  return h;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ConventionCard", () => {
  it("shows the rule, its rationale, the category and the confidence", () => {
    renderCard();
    expect(screen.getByText("Validate request bodies with a Zod schema.")).toBeInTheDocument();
    expect(screen.getByText("Every public shape is parsed at the edge.")).toBeInTheDocument();
    expect(screen.getByText("typing")).toBeInTheDocument();
    expect(screen.getByLabelText("82% confidence")).toBeInTheDocument();
  });

  // The confidence bar's colour banding is unit-tested directly against
  // `confidenceColor()` in `../../helpers.test.ts` — asserting it here would
  // mean reaching into DOM structure and inline styles for logic that already
  // has a proper unit test.

  it("renders the verified snippet and deep-links the citation to that line", () => {
    renderCard();
    expect(screen.getByText("export const UserSchema = z.object({")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "src/user.ts:3" });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/main/src/user.ts#L3",
    );
  });

  it("accepts and rejects through the status callback", () => {
    const h = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(h.onStatus).toHaveBeenCalledWith("c1", "accepted");
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(h.onStatus).toHaveBeenCalledWith("c1", "rejected");
  });

  it("reports the state it is already in, on the button that would set it", () => {
    renderCard({ status: "accepted" });
    expect(screen.getByRole("button", { name: "Accepted" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();

    cleanup();
    renderCard({ status: "rejected" });
    expect(screen.getByRole("button", { name: "Rejected" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
  });

  // Regression: the rule was passed as the checkbox's VISIBLE label, so a long
  // one took the whole row's width and squeezed the content column into a
  // one-word-per-line strip. The accessible name has to stay out of the layout.
  it("keeps the checkbox's accessible name out of the visible layout", () => {
    renderCard();
    const name = screen.getByText("Select Validate request bodies with a Zod schema.");
    expect(name).toHaveStyle({ position: "absolute", overflow: "hidden" });
    // The rule itself is rendered exactly once, as the card's heading.
    const heading = screen.getByRole("heading", {
      name: "Validate request bodies with a Zod schema.",
    });
    expect(heading).toBeInTheDocument();
  });

  it("copies the snippet, not the model's text, from the evidence header", async () => {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Copy the evidence snippet" }));
    expect(writeText).toHaveBeenCalledWith("export const UserSchema = z.object({");
  });

  it("edits the rule and clears an emptied rationale to null", () => {
    const h = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    fireEvent.change(screen.getByDisplayValue("Validate request bodies with a Zod schema."), {
      target: { value: "Parse every request body with Zod." },
    });
    fireEvent.change(screen.getByDisplayValue("Every public shape is parsed at the edge."), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(h.onEdit).toHaveBeenCalledWith("c1", {
      rule: "Parse every request body with Zod.",
      rationale: null,
    });
  });

  it("leaves the candidate untouched when an edit is cancelled", () => {
    const h = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByDisplayValue("Validate request bodies with a Zod schema."), {
      target: { value: "Something else" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(h.onEdit).not.toHaveBeenCalled();
    expect(screen.getByText("Validate request bodies with a Zod schema.")).toBeInTheDocument();
  });

  it("toggles selection", () => {
    const h = renderCard();
    fireEvent.click(
      screen.getByLabelText("Select Validate request bodies with a Zod schema."),
    );
    expect(h.onToggleSelected).toHaveBeenCalledWith("c1");
  });

  describe("delete", () => {
    beforeEach(() => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("deletes only after the confirm", () => {
      const h = renderCard();
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      expect(h.onDelete).toHaveBeenCalledWith("c1");

      vi.spyOn(window, "confirm").mockReturnValue(false);
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      expect(h.onDelete).toHaveBeenCalledTimes(1);
    });
  });
});
