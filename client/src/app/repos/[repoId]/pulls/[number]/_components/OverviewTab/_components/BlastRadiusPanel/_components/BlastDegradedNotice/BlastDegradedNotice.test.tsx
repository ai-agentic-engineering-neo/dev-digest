import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../../../messages/en/blast.json";
import type { BlastDegradedReason } from "@/lib/types";
import { BlastDegradedNotice } from "./BlastDegradedNotice";

interface Props {
  reason: BlastDegradedReason;
  onResync?: () => void;
  resyncing: boolean;
  timedOut: boolean;
}

function renderNotice(props: Props) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages }}>
      <BlastDegradedNotice {...props} />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("BlastDegradedNotice", () => {
  it("shows the reason and lets the user resync a partial index", () => {
    const onResync = vi.fn();
    renderNotice({ reason: "index_partial", onResync, resyncing: false, timedOut: false });

    expect(screen.getByRole("status")).toHaveTextContent(/code index is partial/i);
    fireEvent.click(screen.getByRole("button", { name: /resync index/i }));
    expect(onResync).toHaveBeenCalledTimes(1);
  });

  it("shows no button when resync is not offered", () => {
    renderNotice({ reason: "no_data", resyncing: false, timedOut: false });

    expect(screen.getByRole("status")).toHaveTextContent(/no code index yet/i);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("disables the button while resyncing", () => {
    renderNotice({ reason: "index_failed", onResync: vi.fn(), resyncing: true, timedOut: false });

    expect(screen.getByRole("button", { name: /resyncing/i })).toBeDisabled();
  });

  it("tells the user to reload when the resync timed out", () => {
    renderNotice({ reason: "index_failed", onResync: vi.fn(), resyncing: false, timedOut: true });

    expect(screen.getByText(/still running/i)).toBeInTheDocument();
  });
});
