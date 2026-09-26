import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@messages/en/conventions.json";
import type { ConventionCandidate } from "@devdigest/shared";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  category: "Naming",
  rule: "Exported functions use camelCase.",
  evidence_path: "src/index.ts",
  evidence_start_line: 1,
  evidence_end_line: 2,
  evidence_snippet: "export function helloWorld() {\n  return 'hi';\n}",
  confidence: 0.9,
  status: "pending",
};

function renderCard(candidate: ConventionCandidate, overrides: Partial<React.ComponentProps<typeof ConventionCard>> = {}) {
  const onAccept = vi.fn();
  const onReject = vi.fn();
  const onEdit = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard
        candidate={candidate}
        repoFullName="acme/widgets"
        sha="deadbeef"
        onAccept={onAccept}
        onReject={onReject}
        onEdit={onEdit}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );
  return { onAccept, onReject, onEdit };
}

describe("ConventionCard", () => {
  it("pending: shows Accept/Reject/Edit and a GitHub-blob link with the evidence line range", () => {
    const { onAccept, onReject } = renderCard(CANDIDATE);
    expect(screen.getByText("Exported functions use camelCase.")).toBeInTheDocument();
    expect(screen.getByText(/src\/index\.ts:1-2/)).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://github.com/acme/widgets/blob/deadbeef/src/index.ts#L1-L2",
    );

    fireEvent.click(screen.getByRole("button", { name: /Accept as Skill/ }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("accepted: shows the Accepted badge instead of Accept/Reject buttons", () => {
    renderCard({ ...CANDIDATE, status: "accepted" });
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accept as Skill/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });

  it("edit mode: Save calls onEdit with the edited rule and category, never touching evidence", () => {
    const { onEdit } = renderCard(CANDIDATE);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    const ruleInput = inputs.find((i) => i.value === CANDIDATE.rule)!;
    fireEvent.change(ruleInput, { target: { value: "Exported functions use snake_case." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onEdit).toHaveBeenCalledWith({ rule: "Exported functions use snake_case.", category: "Naming" });
  });
});
