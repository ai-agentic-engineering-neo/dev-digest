import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/conventions.json";
import type { ConventionCandidate } from "@devdigest/shared";
import { ConventionCard } from "./ConventionCard";

afterEach(cleanup);

const candidate: ConventionCandidate = {
  id: "c1",
  rule: "Always use async/await",
  evidence_path: "src/api/users.ts",
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.91,
  accepted: false,
};

function setup(over: Partial<ConventionCandidate> = {}) {
  const handlers = { onAccept: vi.fn(), onReject: vi.fn(), onEditRule: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard candidate={{ ...candidate, ...over }} {...handlers} />
    </NextIntlClientProvider>,
  );
  return handlers;
}

describe("ConventionCard", () => {
  it("shows rule, evidence path, snippet and confidence", () => {
    setup();
    expect(screen.getByText("Always use async/await")).toBeTruthy();
    expect(screen.getByText("src/api/users.ts")).toBeTruthy();
    expect(screen.getByText("const user = await db.users.find(id);")).toBeTruthy();
    expect(screen.getByText("91%")).toBeTruthy();
  });

  it("accept toggles on, and off when already accepted", () => {
    const a = setup();
    fireEvent.click(screen.getByRole("button", { name: "Accept as Skill" }));
    expect(a.onAccept).toHaveBeenCalledWith(true);
    cleanup();
    const b = setup({ accepted: true });
    fireEvent.click(screen.getByRole("button", { name: "Accepted" }));
    expect(b.onAccept).toHaveBeenCalledWith(false);
  });

  it("reject calls onReject", () => {
    const h = setup();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(h.onReject).toHaveBeenCalled();
  });

  it("edits the rule and saves on Enter; empty or unchanged text is not saved", () => {
    const h = setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit rule" }));
    const input = screen.getByLabelText("Rule text") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  Await everything  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(h.onEditRule).toHaveBeenCalledWith("Await everything");

    fireEvent.click(screen.getByRole("button", { name: "Edit rule" }));
    fireEvent.change(screen.getByLabelText("Rule text"), { target: { value: "   " } });
    fireEvent.keyDown(screen.getByLabelText("Rule text"), { key: "Enter" });
    expect(h.onEditRule).toHaveBeenCalledTimes(1);
  });

  it("Escape cancels the edit without saving", () => {
    const h = setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit rule" }));
    const input = screen.getByLabelText("Rule text");
    fireEvent.change(input, { target: { value: "changed" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(h.onEditRule).not.toHaveBeenCalled();
    expect(screen.getByText("Always use async/await")).toBeTruthy();
  });
});
