import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import ciMessages from "../../../../../../../../../../messages/en/ci.json";
import * as hooks from "@/lib/hooks/ci";
import * as coreHooks from "@/lib/hooks/core";
import { TargetStep } from "./TargetStep";

/**
 * specs/14-export-to-ci.md (D13/AC-2/AC-2a) — the Target step renders ONE
 * option per REGISTERED target, read from the server. Nothing about an
 * unregistered target (CircleCI/Jenkins/Generic CLI) should ever reach the
 * DOM, even though all four are valid `CiTarget` enum members and all four
 * have translated labels in `messages/en/ci.json`.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** The repo picker reads the workspace's imported repos; every case below
 *  states what that list holds so the select/free-text fallback is explicit. */
function mockRepos(fullNames: string[], isLoading = false) {
  vi.spyOn(coreHooks, "useRepos").mockReturnValue({
    data: fullNames.map((full_name, i) => ({ id: String(i), full_name })),
    isLoading,
  } as unknown as ReturnType<typeof coreHooks.useRepos>);
}

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ ci: ciMessages }}>{ui}</NextIntlClientProvider>);
}

function mockTargets(targets: { target: string; label_key: string }[] | undefined, isLoading = false) {
  vi.spyOn(hooks, "useCiTargets").mockReturnValue({
    data: targets,
    isLoading,
  } as unknown as ReturnType<typeof hooks.useCiTargets>);
}

describe("TargetStep", () => {
  it("AC-2 — renders only the registered target(s), never CircleCI/Jenkins/Generic CLI", () => {
    mockRepos([]);
    mockTargets([{ target: "gha", label_key: "exportWizard.targets.gha" }]);
    renderWithIntl(<TargetStep target="gha" onTarget={vi.fn()} repo="" onRepo={vi.fn()} />);

    const options = screen.getAllByRole("radio");
    expect(options).toHaveLength(1);
    expect(screen.getByText(ciMessages.exportWizard.targets.gha)).toBeInTheDocument();
    expect(screen.queryByText(ciMessages.exportWizard.targets.circle)).not.toBeInTheDocument();
    expect(screen.queryByText(ciMessages.exportWizard.targets.jenkins)).not.toBeInTheDocument();
    expect(screen.queryByText(ciMessages.exportWizard.targets.cli)).not.toBeInTheDocument();
  });

  it("marks the currently-selected target checked, and clicking another option calls onTarget", () => {
    mockRepos([]);
    mockTargets([{ target: "gha", label_key: "exportWizard.targets.gha" }]);
    const onTarget = vi.fn();
    renderWithIntl(<TargetStep target="gha" onTarget={onTarget} repo="" onRepo={vi.fn()} />);

    const option = screen.getByRole("radio", { name: new RegExp(ciMessages.exportWizard.targets.gha) });
    expect(option).toHaveAttribute("aria-checked", "true");

    fireEvent.click(option);
    expect(onTarget).toHaveBeenCalledWith("gha");
  });

  it("typing in the repo field calls onRepo with the new value", () => {
    mockRepos([]);
    mockTargets([{ target: "gha", label_key: "exportWizard.targets.gha" }]);
    const onRepo = vi.fn();
    renderWithIntl(<TargetStep target="gha" onTarget={vi.fn()} repo="" onRepo={onRepo} />);

    const input = screen.getByPlaceholderText(ciMessages.exportWizard.repoPlaceholder);
    fireEvent.change(input, { target: { value: "acme/payments-api" } });
    expect(onRepo).toHaveBeenCalledWith("acme/payments-api");
  });

  it("picks the target repo from the imported repositories, not free text", () => {
    mockRepos(["burnjohn/quick-blog", "acme/payments-api"]);
    mockTargets([{ target: "gha", label_key: "exportWizard.targets.gha" }]);
    const onRepo = vi.fn();
    renderWithIntl(
      <TargetStep target="gha" onTarget={vi.fn()} repo="burnjohn/quick-blog" onRepo={onRepo} />,
    );

    const select = screen.getByLabelText(ciMessages.exportWizard.repoLabel);
    expect(select.tagName).toBe("SELECT");
    expect(screen.queryByPlaceholderText(ciMessages.exportWizard.repoPlaceholder)).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "burnjohn/quick-blog" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "acme/payments-api" })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "acme/payments-api" } });
    expect(onRepo).toHaveBeenCalledWith("acme/payments-api");
  });

  it("preselects the first imported repo when nothing is chosen yet", () => {
    mockRepos(["burnjohn/quick-blog", "acme/payments-api"]);
    mockTargets([{ target: "gha", label_key: "exportWizard.targets.gha" }]);
    const onRepo = vi.fn();
    renderWithIntl(<TargetStep target="gha" onTarget={vi.fn()} repo="" onRepo={onRepo} />);
    expect(onRepo).toHaveBeenCalledWith("burnjohn/quick-blog");
  });

  it("renders no target options at all while the registry is loading", () => {
    mockRepos([]);
    mockTargets(undefined, true);
    renderWithIntl(<TargetStep target="gha" onTarget={vi.fn()} repo="" onRepo={vi.fn()} />);
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
});
