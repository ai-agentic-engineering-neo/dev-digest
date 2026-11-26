import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../messages/en/skills.json";
import { RestoreConfirmModal } from "./RestoreConfirmModal";

afterEach(cleanup);

describe("RestoreConfirmModal", () => {
  it("explains the new version and wires confirm / cancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <RestoreConfirmModal version={1} nextVersion={4} isPending={false} onConfirm={onConfirm} onCancel={onCancel} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Restore v1?")).toBeInTheDocument();
    expect(screen.getByText(/This creates v4 with the body of v1/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
