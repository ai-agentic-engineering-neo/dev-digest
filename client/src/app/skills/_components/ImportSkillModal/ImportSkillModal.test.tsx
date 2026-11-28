import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { SkillImportPreview } from "@devdigest/shared";
import { mockApi, renderWithProviders } from "@/test/render";
import { ImportSkillModal } from "./ImportSkillModal";

afterEach(() => {
  cleanup();
});

const PREVIEW: SkillImportPreview = {
  name: "api-contract-compat",
  description: "Flag breaking API changes",
  type: "security",
  body: "# API contract",
  source_file: "api-contract/SKILL.md",
  skipped_files: [{ path: "api-contract/run.sh", size: 2150 }],
  warnings: ["Dropped frontmatter key allowed-tools"],
};

function api() {
  return mockApi((_method, path) =>
    path === "/skills/import/preview" ? PREVIEW : { ...PREVIEW, id: "sk9", source: "imported_file", enabled: false, version: 1, agent_count: 0 },
  );
}

const pick = (file: File) => fireEvent.change(screen.getByLabelText("Skill file (.md or .zip)"), { target: { files: [file] } });

describe("ImportSkillModal", () => {
  it("previews a .zip with the trust warning and skipped files, and saves only on Save skill", async () => {
    const calls = api();
    const onImported = vi.fn();
    renderWithProviders(<ImportSkillModal onClose={() => {}} onImported={onImported} />);
    pick(new File(["zip-bytes"], "api-contract.zip"));

    expect(await screen.findByText(/someone else's instructions to your reviewer/)).toBeInTheDocument();
    expect(screen.getByText("Skipped files (1)")).toBeInTheDocument();
    expect(screen.getByText("api-contract/run.sh")).toBeInTheDocument();
    expect(screen.getByText("2.1 KB")).toBeInTheDocument();
    expect(calls.map((c) => c.path)).toEqual(["/skills/import/preview"]);
    expect(calls[0]!.body).toMatchObject({ filename: "api-contract.zip" });

    fireEvent.click(screen.getByRole("button", { name: "Save skill" }));
    await waitFor(() => expect(onImported).toHaveBeenCalledWith("sk9"));
    expect(calls.at(-1)).toMatchObject({ method: "POST", path: "/skills/import", body: { name: "api-contract-compat", enabled: false } });
  });

  it("sends nothing more when cancelled at step 2", async () => {
    const calls = api();
    const onClose = vi.fn();
    renderWithProviders(<ImportSkillModal onClose={onClose} onImported={() => {}} />);
    pick(new File(["# x"], "skill.md"));
    await screen.findByText("Skipped files (1)");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(calls.some((c) => c.path === "/skills/import")).toBe(false);
  });

  it("rejects a 2 MB file without a request", () => {
    const calls = api();
    renderWithProviders(<ImportSkillModal onClose={() => {}} onImported={() => {}} />);
    pick(new File([new Uint8Array(2 * 1_048_576)], "big.zip"));
    expect(screen.getByRole("alert")).toHaveTextContent("big.zip is larger than 1 MB.");
    expect(calls).toHaveLength(0);
  });
});
