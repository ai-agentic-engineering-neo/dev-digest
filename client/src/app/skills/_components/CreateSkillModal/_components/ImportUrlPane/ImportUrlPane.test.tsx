import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { fetchCalls, mockFetch, renderWithProviders } from "@/app/skills/_components/test-utils";
import { ImportUrlPane } from "./ImportUrlPane";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DRAFT = {
  name: "deprecation-policy",
  description: "Remove after a deprecation.",
  type: "custom",
  body: "# Deprecation policy\nRemove after a deprecation.",
  source_url: "https://raw.githubusercontent.com/acme/skills/main/deprecation.md",
  safety: { status: "clean", findings: [], scanner_version: 1, scanned_at: "t" },
};

function renderPane() {
  const onLoaded = vi.fn();
  renderWithProviders(<ImportUrlPane onLoaded={onLoaded} />);
  return onLoaded;
}

describe("ImportUrlPane", () => {
  it("Fetch is enabled only for an https URL; the draft is handed over (a typed name wins)", async () => {
    const spy = mockFetch({ "POST /skills/import-url": DRAFT });
    const onLoaded = renderPane();
    const fetchBtn = screen.getByRole("button", { name: "Fetch" });
    expect(fetchBtn).toBeDisabled();
    fireEvent.change(screen.getByLabelText("URL (https:// only)"), { target: { value: "http://x.dev/a.md" } });
    expect(fetchBtn).toBeDisabled();

    const url = "https://github.com/acme/skills/blob/main/deprecation.md";
    fireEvent.change(screen.getByLabelText("URL (https:// only)"), { target: { value: url } });
    fireEvent.change(screen.getByLabelText("Skill name"), { target: { value: "Our Deprecation Rules" } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));

    await waitFor(() =>
      expect(onLoaded).toHaveBeenCalledWith(
        { name: "our-deprecation-rules", description: DRAFT.description, type: "custom", body: DRAFT.body },
        DRAFT.source_url,
      ),
    );
    expect(fetchCalls(spy)).toContainEqual(["POST", "/skills/import-url", { url }]);
  });

  it("a refused URL shows the server's reason inline and loads nothing", async () => {
    mockFetch({
      "POST /skills/import-url": () => ({
        status: 422,
        body: { error: { code: "validation_error", message: "Private or local hosts cannot be imported from" } },
      }),
    });
    const onLoaded = renderPane();
    fireEvent.change(screen.getByLabelText("URL (https:// only)"), { target: { value: "https://10.0.0.1/a.md" } });
    fireEvent.click(screen.getByRole("button", { name: "Fetch" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Private or local hosts cannot be imported from");
    expect(onLoaded).not.toHaveBeenCalled();
  });
});
