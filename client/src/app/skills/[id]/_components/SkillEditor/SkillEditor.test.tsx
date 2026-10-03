import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../lib/toast";
import type { SkillImportPreview } from "../../../../../lib/hooks/skills";

const { createMutateSpy, updateMutateSpy, routerReplace } = vi.hoisted(() => ({
  createMutateSpy: vi.fn(),
  updateMutateSpy: vi.fn(),
  routerReplace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: routerReplace }),
}));

// Stand-in for the TanStack Query mutation objects: tracks pending/success via
// React state (so the component re-renders the way it would for real) without
// needing a QueryClientProvider, and records calls through the hoisted spies
// above so tests can assert on exactly what was sent to the API layer.
vi.mock("../../../../../lib/hooks/skills", async () => {
  const React = await import("react");
  function useFakeMutation<I, O>(spy: (input: I) => void, resolve: (input: I) => O) {
    const [state, setState] = React.useState<{ isPending: boolean; isSuccess: boolean; data?: O }>({
      isPending: false,
      isSuccess: false,
    });
    return {
      ...state,
      mutate: (input: I, opts?: { onSuccess?: (data: O) => void }) => {
        spy(input);
        const data = resolve(input);
        setState({ isPending: false, isSuccess: true, data });
        opts?.onSuccess?.(data);
      },
    };
  }
  return {
    useCreateSkill: () =>
      useFakeMutation(createMutateSpy, (input: Record<string, unknown>) => ({
        id: "new-id",
        version: 1,
        enabled: true,
        ...input,
      })),
    useUpdateSkill: () =>
      useFakeMutation(
        updateMutateSpy,
        ({ id, patch }: { id: string; patch: Record<string, unknown> }) => ({
          id,
          version: 2,
          enabled: true,
          name: "",
          description: "",
          type: "rubric",
          body: "",
          source: "manual",
          ...patch,
        }),
      ),
  };
});

import { SkillEditor } from "./SkillEditor";

afterEach(cleanup);
afterEach(() => {
  createMutateSpy.mockClear();
  updateMutateSpy.mockClear();
  routerReplace.mockClear();
});

const SKILL: Skill = {
  id: "sk1",
  name: "No console.log",
  description: "Flag any leftover console.log call",
  type: "convention",
  source: "manual",
  body: "# Rule\nNo console.log in committed code.",
  enabled: true,
  version: 1,
  evidence_files: null,
};

const PREVIEW: SkillImportPreview = {
  name: "No hardcoded secrets",
  description: "Flag any hardcoded secret or credential",
  type: "security",
  body: "# Rule\nFlag any hardcoded API key, token, or password literal.",
  source: "imported_url",
  evidence_files: ["security-notes.md", "auth/config.ts"],
};

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("SkillEditor — create", () => {
  it("creates a new skill from an empty form and navigates to it", async () => {
    renderWithProviders(<SkillEditor />);

    const nameInput = screen.getAllByRole("textbox")[0]!;
    fireEvent.change(nameInput, { target: { value: "My New Skill" } });
    fireEvent.click(screen.getByText("Create skill"));

    expect(createMutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: "My New Skill", enabled: true }),
    );
    expect(createMutateSpy.mock.calls[0]![0]).not.toHaveProperty("source");

    await screen.findByText("Skill created");
    expect(routerReplace).toHaveBeenCalledWith("/skills/new-id");
  });

  it("disables Create until a name is entered", () => {
    renderWithProviders(<SkillEditor />);
    expect(screen.getByText("Create skill").closest("button")).toBeDisabled();
  });
});

describe("SkillEditor — edit", () => {
  it("saves changes and shows the bumped version", async () => {
    renderWithProviders(<SkillEditor skill={SKILL} />);

    expect(screen.getByDisplayValue(SKILL.name)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Save skill"));

    expect(updateMutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sk1",
        patch: expect.objectContaining({ name: "No console.log" }),
      }),
    );
    await screen.findByText("Saved (v2)");
    await screen.findByText("Skill saved (v2)"); // toast
  });
});

describe("SkillEditor — import preview, then confirm", () => {
  it("pre-fills from the preview, marks it imported, and only persists on Save", () => {
    renderWithProviders(<SkillEditor importPreview={PREVIEW} />);

    // Pre-filled + flagged, nothing written yet.
    expect(screen.getByText("Imported — review before saving")).toBeInTheDocument();
    expect(screen.getByDisplayValue(PREVIEW.name)).toBeInTheDocument();
    // getByDisplayValue normalizes whitespace in the DOM value but not in the
    // matcher, so a multi-line body needs an exact-value check instead.
    const textboxes = screen.getAllByRole("textbox");
    expect(textboxes[textboxes.length - 1]).toHaveValue(PREVIEW.body);
    expect(screen.getByText("Imported")).toBeInTheDocument(); // source, read-only
    expect(screen.getByText("security-notes.md")).toBeInTheDocument();
    expect(screen.getByText("auth/config.ts")).toBeInTheDocument();
    expect(createMutateSpy).not.toHaveBeenCalled();
  });

  it("persists the previewed skill, carrying its source, only when Save is clicked", async () => {
    renderWithProviders(<SkillEditor importPreview={PREVIEW} />);

    fireEvent.click(screen.getByText("Create skill"));

    expect(createMutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: PREVIEW.name, body: PREVIEW.body, source: "imported_url" }),
    );
    await screen.findByText("Skill created");
    expect(routerReplace).toHaveBeenCalledWith("/skills/new-id");
  });
});
