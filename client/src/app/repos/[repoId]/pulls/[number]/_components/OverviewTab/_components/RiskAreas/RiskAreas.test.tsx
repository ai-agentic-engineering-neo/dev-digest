import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { Risk } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/brief.json";
import { RiskAreas } from "./RiskAreas";

afterEach(cleanup);

const RISKS = [
  { kind: "auth", title: "Secret committed", explanation: "A key sits in config.", severity: "high", file_refs: ["src/config.ts:12-14"] },
  { kind: "mystery", title: "Odd kind", explanation: "x", severity: "low", file_refs: [] },
] as unknown as Risk[];

function renderRisks(onOpenRef = vi.fn(), risks = RISKS) {
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <RiskAreas risks={risks} onOpenRef={onOpenRef} />
    </NextIntlClientProvider>,
  );
  return onOpenRef;
}

describe("RiskAreas", () => {
  it("renders nothing without risks", () => {
    renderRisks(vi.fn(), []);
    expect(screen.queryByText("Risk areas")).not.toBeInTheDocument();
  });

  it("expands a chip to its explanation and severity, opens a ref at its start line, tolerates an unknown kind", async () => {
    const user = userEvent.setup();
    const open = renderRisks();
    expect(screen.getByRole("heading", { name: "Risk areas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Show details for Odd kind/ })).toBeInTheDocument();
    expect(screen.queryByText("A key sits in config.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Show details for Secret committed/ }));
    expect(screen.getByText("A key sits in config.")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Open src\/config.ts:12-14/ }));
    expect(open).toHaveBeenCalledWith("src/config.ts", 12);
  });
});
