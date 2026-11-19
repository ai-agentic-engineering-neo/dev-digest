import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/settings.json";
import { SettingsApiKeys } from "./SettingsApiKeys";

/** S11 (security hardening) — a verified key leaves the input; a failed one stays for fixing. */

const mutateAsync = vi.fn();
vi.mock("@/lib/hooks", () => ({
  useTestConnection: () => ({ mutateAsync, isPending: false }),
  useSecretsStatus: () => ({ data: { openai: true, anthropic: false, openrouter: false, github: false } }),
}));

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ settings: messages }}>
      <SettingsApiKeys />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  mutateAsync.mockReset();
});

async function typeAndTest(value: string) {
  const input = screen.getAllByPlaceholderText(messages.apiKeys.placeholder)[0] as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
  fireEvent.click(screen.getAllByRole("button", { name: messages.apiKeys.testConnection })[0]!);
  return input;
}

describe("SettingsApiKeys", () => {
  it("clears the input after the key is verified and saved", async () => {
    mutateAsync.mockResolvedValue({ provider: "openai", ok: true, message: "OK — 3 models available" });
    renderView();
    const input = await typeAndTest("sk-new");
    await screen.findByText("OK — 3 models available");
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ key: "sk-new" }));
    await waitFor(() => expect(input.value).toBe(""));
  });

  it("keeps the input when the check fails, so the typo can be fixed", async () => {
    mutateAsync.mockResolvedValue({ provider: "openai", ok: false, message: "401 — key not saved" });
    renderView();
    const input = await typeAndTest("sk-typo");
    await screen.findByText("401 — key not saved");
    expect(input.value).toBe("sk-typo");
  });
});
