import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/settings.json";

const mutateAsync = vi.fn();
vi.mock("../../../../../../../lib/hooks", () => ({
  useTestConnection: () => ({ mutateAsync, isPending: false }),
  useSecretsStatus: () => ({
    data: { openai: true, anthropic: false, openrouter: false, github: true, gitlab: false },
  }),
}));

import { SettingsApiKeys } from "./SettingsApiKeys";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ settings: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SettingsApiKeys", () => {
  it("renders a GitLab key row alongside GitHub, reflecting its own configured status", () => {
    renderWithIntl(<SettingsApiKeys />);
    expect(screen.getByText("GitLab PAT (gitlab.com)")).toBeInTheDocument();
    expect(screen.getByText("GitHub PAT (fine-grained)")).toBeInTheDocument();

    const rows = screen.getAllByText(/Configured|Not set/);
    // openai + github are "Configured"; anthropic + openrouter + gitlab are "Not set".
    expect(rows.filter((r) => r.textContent === "Configured")).toHaveLength(2);
    expect(rows.filter((r) => r.textContent === "Not set")).toHaveLength(3);
  });
});
