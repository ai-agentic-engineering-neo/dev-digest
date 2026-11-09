import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import briefMessages from "../../../../../../../../../../../../messages/en/brief.json";
import { VerdictProvenance } from "./VerdictProvenance";

function renderIt(agentName: string | null) {
  return render(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={{ brief: briefMessages }}>
      <VerdictProvenance agentName={agentName} reviewedAt="2026-11-09T10:00:00Z" />
    </NextIntlClientProvider>,
  );
}

describe("VerdictProvenance", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("exposes provenance in the name and shows the tooltip on focus, hover and hides on blur, delay, Escape", () => {
    vi.useFakeTimers();
    renderIt("Security Reviewer");
    const button = screen.getByRole("button", { name: /Security Reviewer's review run of/ });
    expect(button).toHaveAccessibleName(/Nov 9, 2026/);
    expect(button).toHaveAccessibleName(/come from the brief/);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.focus(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent(/Security Reviewer's review run of/);
    fireEvent.blur(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.mouseEnter(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.mouseLeave(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.focus(button);
    fireEvent.keyDown(button, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("falls back to a generic agent name", () => {
    renderIt(null);
    expect(screen.getByRole("button", { name: /an agent's review run of/ })).toBeInTheDocument();
  });
});
