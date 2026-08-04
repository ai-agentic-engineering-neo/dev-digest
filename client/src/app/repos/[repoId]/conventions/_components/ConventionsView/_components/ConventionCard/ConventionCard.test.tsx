import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/conventions.json";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const CANDIDATE: ConventionCandidate = {
  id: "c1",
  category: "async-await",
  rule: "Always use async/await instead of .then() chains.",
  evidence_path: "src/api/users.ts",
  evidence_start_line: 23,
  evidence_end_line: 31,
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.91,
  status: "pending",
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("ConventionCard", () => {
  it("renders the rule, evidence file:line, snippet and confidence", () => {
    renderWithIntl(
      <ConventionCard
        candidate={CANDIDATE}
        repoFullName="acme/payments-api"
        sourceSha="a1b2c3d4"
        onAccept={() => {}}
        onReject={() => {}}
      />,
    );
    expect(
      screen.getByText("Always use async/await instead of .then() chains."),
    ).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23-31")).toBeInTheDocument();
    expect(screen.getByText("const user = await db.users.find(id);")).toBeInTheDocument();
    expect(screen.getByText("91% confidence")).toBeInTheDocument();
  });

  it("links evidence to the real file:line on GitHub, pinned to the scan's sha", () => {
    renderWithIntl(
      <ConventionCard
        candidate={CANDIDATE}
        repoFullName="acme/payments-api"
        sourceSha="a1b2c3d4"
        onAccept={() => {}}
        onReject={() => {}}
      />,
    );
    const link = screen.getByText("src/api/users.ts:23-31").closest("a");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/a1b2c3d4/src/api/users.ts#L23-L31",
    );
  });

  it("fires accept/reject", () => {
    const onAccept = vi.fn();
    const onReject = vi.fn();
    renderWithIntl(
      <ConventionCard
        candidate={CANDIDATE}
        repoFullName="acme/payments-api"
        sourceSha="a1b2c3d4"
        onAccept={onAccept}
        onReject={onReject}
      />,
    );
    fireEvent.click(screen.getByText("Accept"));
    fireEvent.click(screen.getByText("Reject"));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("shows an Accepted badge and no link once accepted with no repo context", () => {
    renderWithIntl(
      <ConventionCard
        candidate={{ ...CANDIDATE, status: "accepted" }}
        repoFullName={null}
        sourceSha={null}
        onAccept={() => {}}
        onReject={() => {}}
      />,
    );
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:23-31").closest("a")).toBeNull();
  });
});
