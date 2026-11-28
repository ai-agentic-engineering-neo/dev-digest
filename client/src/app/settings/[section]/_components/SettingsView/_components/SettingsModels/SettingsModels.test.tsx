import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { FEATURE_MODELS } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/settings.json";

const state = vi.hoisted(() => ({
  settings: { data: undefined, isLoading: true, isError: false } as {
    data: unknown;
    isLoading: boolean;
    isError: boolean;
  },
  mutate: vi.fn(),
}));

vi.mock("../../../../../../../lib/hooks", () => ({
  useSettings: () => ({ ...state.settings, refetch: vi.fn() }),
  useUpdateSettings: () => ({ mutate: state.mutate }),
}));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useProviderModels: () => ({ data: [] }),
}));

import { SettingsModels } from "./SettingsModels";

afterEach(() => {
  cleanup();
  state.mutate.mockReset();
});

function renderModels() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ settings: messages }}>
      <SettingsModels />
    </NextIntlClientProvider>,
  );
}

describe("SettingsModels", () => {
  it("shows no pickers while settings load, so nothing can overwrite the saved choices", () => {
    state.settings = { data: undefined, isLoading: true, isError: false };
    renderModels();
    expect(screen.getByText("Feature Models")).toBeInTheDocument();
    expect(screen.queryByText(FEATURE_MODELS[0]!.label)).not.toBeInTheDocument();
  });

  it("shows an error, not the pickers, when settings fail to load", () => {
    state.settings = { data: undefined, isLoading: false, isError: true };
    renderModels();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load settings");
    expect(screen.queryByText(FEATURE_MODELS[0]!.label)).not.toBeInTheDocument();
  });

  it("keeps the other features' choices when one picker changes", () => {
    const [first, second] = FEATURE_MODELS;
    state.settings = {
      data: { feature_models: { [second!.id]: { provider: "openrouter", model: "kept/model" } } },
      isLoading: false,
      isError: false,
    };
    renderModels();
    expect(screen.getByText(first!.label)).toBeInTheDocument();

    // Open the first picker and confirm its highlighted option.
    fireEvent.click(screen.getAllByText(first!.defaultModel)[0]!);
    fireEvent.keyDown(screen.getByPlaceholderText("Search models…"), { key: "Enter" });

    expect(state.mutate).toHaveBeenCalledTimes(1);
    const arg = state.mutate.mock.calls[0]![0] as { feature_models: Record<string, { model: string }> };
    expect(arg.feature_models[second!.id]!.model).toBe("kept/model");
    expect(arg.feature_models[first!.id]!.model).toBe(first!.defaultModel);
  });
});
