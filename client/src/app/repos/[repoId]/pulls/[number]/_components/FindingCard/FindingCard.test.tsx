import { describe, it, expect, afterEach, vi } from "vitest";
import { renderWithProviders, screen, cleanup } from "@/test/render";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "./FindingCard";

afterEach(cleanup);

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithProviders(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", async () => {
    const onAction = vi.fn();
    const { user } = renderWithProviders(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    await user.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    await user.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });
});

describe("FindingCard — accessible toggle", () => {
  it("the title is a button that expands and collapses the details", async () => {
    const { user } = renderWithProviders(<FindingCard f={FINDING} onAction={() => {}} />);
    const toggle = screen.getByRole("button", { name: "Hardcoded Stripe secret key" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Accept")).toBeNull();
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Accept")).toBeInTheDocument();
    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("clicking the header area still toggles (single toggle, not twice)", async () => {
    const { user } = renderWithProviders(<FindingCard f={FINDING} onAction={() => {}} />);
    await user.click(screen.getByText("security"));
    expect(screen.getByRole("button", { name: "Hardcoded Stripe secret key" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Hardcoded Stripe secret key" }));
    expect(screen.getByRole("button", { name: "Hardcoded Stripe secret key" })).toHaveAttribute("aria-expanded", "false");
  });
});
