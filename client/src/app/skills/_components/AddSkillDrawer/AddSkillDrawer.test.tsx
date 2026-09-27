import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportPreview } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const PREVIEW: SkillImportPreview = {
  name: "flaky-test-heuristics",
  description: "Detects timing and ordering sources of flakiness.",
  type: "custom",
  source: "imported_url",
  body: "# Flaky test heuristics\n\nFlag sleep() used as synchronisation.",
  files_used: ["flaky/SKILL.md"],
  files_skipped: [
    { path: "flaky/scripts/install.sh", reason: "executable" },
    { path: "flaky/config.yml", reason: "not-markdown" },
  ],
  warnings: ["1 executable file(s) in the archive were listed but not unpacked."],
};

const previewMutate = vi.fn((_input: unknown, opts?: { onSuccess?: (p: SkillImportPreview) => void }) =>
  opts?.onSuccess?.(PREVIEW),
);
const commitMutate = vi.fn();

vi.mock("@/lib/hooks/skills", () => ({
  useImportPreview: () => ({ mutate: previewMutate, isPending: false }),
  useImportSkill: () => ({ mutate: commitMutate, isPending: false }),
  useCommunitySkills: () => ({
    data: [
      {
        id: "sql-injection-gate",
        name: "sql-injection-gate",
        repo: "secdev/agent-skills",
        stars: 690,
        lang: "any",
        desc: "Flags string-concatenated SQL.",
      },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { AddSkillDrawer } from "./AddSkillDrawer";

function renderDrawer(initialTab: "file" | "community" = "file") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <AddSkillDrawer initialTab={initialTab} onClose={vi.fn()} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

/** A picked file, as the input would hand it over. */
function pick(name: string, content = "# Skill\n\nbody") {
  const input = screen.getByLabelText("Markdown file or .zip archive") as HTMLInputElement;
  const file = new File([content], name, { type: "text/markdown" });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

afterEach(cleanup);
beforeEach(() => {
  previewMutate.mockClear();
  commitMutate.mockClear();
});

describe("AddSkillDrawer", () => {
  it("previewing a file stores nothing — no import call is made", async () => {
    renderDrawer();
    pick("flaky.zip");
    await waitFor(() => expect(previewMutate).toHaveBeenCalled());
    expect(commitMutate).not.toHaveBeenCalled();
  });

  it("the preview names the executable files it refused to unpack", async () => {
    renderDrawer();
    pick("flaky.zip");
    await screen.findByText("flaky/scripts/install.sh");
    expect(screen.getByText(/executable — never unpacked/)).toBeInTheDocument();
    expect(screen.getByText("flaky/SKILL.md")).toBeInTheDocument();
  });

  it("the preview spells out that imported text becomes instructions", async () => {
    renderDrawer();
    pick("flaky.md");
    await screen.findByRole("note");
    expect(screen.getByRole("note")).toHaveTextContent(/becomes instructions/i);
  });

  it("only confirming saves, with the previewed body", async () => {
    renderDrawer();
    pick("flaky.md");
    await screen.findByText("Save skill");
    fireEvent.click(screen.getByText("Save skill"));
    expect(commitMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "flaky-test-heuristics",
        source: "imported_url",
        body: PREVIEW.body,
      }),
      expect.anything(),
    );
  });

  it("the community tab says the catalog is bundled, not fetched", () => {
    renderDrawer("community");
    expect(screen.getByText(/Nothing is fetched from the network/)).toBeInTheDocument();
    expect(screen.getByText("sql-injection-gate")).toBeInTheDocument();
  });

  it("importing a catalog entry goes through the same preview step", async () => {
    renderDrawer("community");
    fireEvent.click(screen.getByText("Import"));
    await waitFor(() =>
      expect(previewMutate).toHaveBeenCalledWith(
        { community_id: "sql-injection-gate" },
        expect.anything(),
      ),
    );
    expect(commitMutate).not.toHaveBeenCalled();
  });
});
