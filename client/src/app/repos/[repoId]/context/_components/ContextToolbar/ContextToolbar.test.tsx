import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ApiError } from "@/lib/api";
import type { DevdigestDoc } from "@/lib/types";
import contextMessages from "../../../../../../../messages/en/context.json";
import { ContextToolbar } from "./ContextToolbar";

const create = vi.fn();
const upload = vi.fn();

vi.mock("@/lib/hooks/devdigest-docs", () => ({
  useCreateDevdigestDoc: () => ({ mutateAsync: create }),
  useUploadDevdigestDoc: () => ({ mutateAsync: upload }),
}));

function doc(path: string): DevdigestDoc {
  return {
    id: "d1",
    repo_id: "r1",
    path,
    tokens: 1,
    copied_from: null,
    updated_at: "2026-01-01T00:00:00Z",
    content: "",
    used_by: [],
  };
}

function renderToolbar(props: Partial<Parameters<typeof ContextToolbar>[0]> = {}) {
  const full = {
    repoId: "r1",
    targetFolder: "auth",
    onFileCreated: vi.fn(),
    onFolderCreated: vi.fn(),
    resync: { start: vi.fn(), busy: false },
    ...props,
  };
  render(
    <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
      <ContextToolbar {...full} />
    </NextIntlClientProvider>,
  );
  return full;
}

function typeInto(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe("ContextToolbar", () => {
  beforeEach(() => {
    create.mockReset();
    upload.mockReset();
  });
  afterEach(() => cleanup());

  it("exposes four named icon buttons with tooltips naming the target folder", () => {
    renderToolbar();
    for (const name of ["New file", "New folder", "Upload .md files", "Resync repo docs"]) {
      expect(screen.getByRole("button", { name }).getAttribute("title")).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "New file" }).getAttribute("title")).toContain(
      ".devdigest/specs/auth",
    );
  });

  it("creates a file, and shows a rule error inline when the server rejects the name", () => {
    create.mockRejectedValueOnce(
      new ApiError("bad", 422, "validation_error", { reason: "invalid_name", rule: "dot_dot" }),
    );
    const props = renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    typeInto(/file name/i, "../x");
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    return screen.findByRole("alert").then(async (alert) => {
      expect(alert.textContent).toBe("Names can't contain “..”.");
      expect(props.onFileCreated).not.toHaveBeenCalled();

      create.mockResolvedValueOnce(doc(".devdigest/specs/auth/review-checklist.md"));
      typeInto(/file name/i, "review-checklist");
      fireEvent.click(screen.getByRole("button", { name: "Create" }));
      await waitFor(() => expect(props.onFileCreated).toHaveBeenCalledTimes(1));
      expect(create).toHaveBeenLastCalledWith({ folder: "auth", name: "review-checklist" });
    });
  });

  it("creates a folder client-side only and rejects backslashes", () => {
    const props = renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    typeInto(/folder name/i, "a\\b");
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(screen.getByRole("alert").textContent).toBe("Use / instead of \\.");
    typeInto(/folder name/i, "drafts");
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(props.onFolderCreated).toHaveBeenCalledWith("auth/drafts");
    expect(create).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("reports each upload outcome and resolves a conflict with Overwrite or Cancel", async () => {
    upload.mockImplementation(async (body: { filename: string; overwrite: boolean }) => {
      if (body.filename === "c.md") {
        throw new ApiError("x", 422, "validation_error", { reason: "not_text" });
      }
      if (body.filename === "d.md" && !body.overwrite) {
        throw new ApiError("x", 409, "conflict", { reason: "exists", path: ".devdigest/specs/auth/d.md" });
      }
      return doc(`.devdigest/specs/auth/${body.filename}`);
    });
    renderToolbar();
    const files = [
      new File(["# a"], "a.md", { type: "text/markdown" }),
      new File(["x"], "b.txt", { type: "text/plain" }),
      new File(["a".repeat(1_048_577)], "big.md", { type: "text/markdown" }),
      new File(["x"], "c.md", { type: "text/markdown" }),
      new File(["x"], "d.md", { type: "text/markdown" }),
    ];
    fireEvent.change(screen.getByTestId("upload-input"), { target: { files } });

    const region = await screen.findByRole("region", { name: "Upload" });
    await waitFor(() => expect(region.textContent).toContain("d.md already exists"));
    expect(region.textContent).toContain("Added .devdigest/specs/auth/a.md");
    expect(region.textContent).toContain("b.txt — Not a .md file.");
    expect(region.textContent).toContain("big.md — Over the 1 MB limit.");
    expect(region.textContent).toContain("c.md — Not a UTF-8 text file.");
    expect(upload).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByRole("button", { name: "Overwrite d.md" }));
    await waitFor(() =>
      expect(upload).toHaveBeenLastCalledWith(
        expect.objectContaining({ filename: "d.md", overwrite: true }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Upload" }).textContent).toContain(
        "Added .devdigest/specs/auth/d.md",
      ),
    );
  });

  it("Overwrite replaces the doc in the folder where the conflict happened, even after another folder is selected", async () => {
    upload.mockImplementation(async (body: { folder: string; filename: string; overwrite: boolean }) => {
      if (!body.overwrite) throw new ApiError("x", 409, "conflict", { reason: "exists", path: "p" });
      return doc(`.devdigest/specs/${body.folder}/${body.filename}`);
    });
    const props = {
      repoId: "r1",
      onFileCreated: vi.fn(),
      onFolderCreated: vi.fn(),
      resync: { start: vi.fn(), busy: false },
    };
    const ui = (targetFolder: string) => (
      <NextIntlClientProvider locale="en" messages={{ context: contextMessages }}>
        <ContextToolbar {...props} targetFolder={targetFolder} />
      </NextIntlClientProvider>
    );
    const { rerender } = render(ui("auth"));
    fireEvent.change(screen.getByTestId("upload-input"), {
      target: { files: [new File(["x"], "d.md", { type: "text/markdown" })] },
    });
    await screen.findByRole("button", { name: "Overwrite d.md" });

    rerender(ui("billing")); // the user picks another folder in the tree before resolving
    fireEvent.click(screen.getByRole("button", { name: "Overwrite d.md" }));

    await waitFor(() =>
      expect(upload).toHaveBeenLastCalledWith(
        expect.objectContaining({ folder: "auth", filename: "d.md", overwrite: true }),
      ),
    );
  });

  it("shows a generic failure, not a wrong reason, for an unexpected upload error", async () => {
    upload.mockRejectedValue(new Error("network down"));
    renderToolbar();
    fireEvent.change(screen.getByTestId("upload-input"), {
      target: { files: [new File(["x"], "e.md", { type: "text/markdown" })] },
    });
    const region = await screen.findByRole("region", { name: "Upload" });
    expect(region.textContent).toContain("e.md — Not saved: network down");
    expect(region.textContent).not.toContain("UTF-8");
  });

  it("uses the fileName text as the New file input placeholder", () => {
    renderToolbar();
    fireEvent.click(screen.getByRole("button", { name: "New file" }));
    expect(screen.getByPlaceholderText("File name, e.g. auth/login.md")).toBeTruthy();
  });

  it("sends nothing when a conflict is cancelled", async () => {
    upload.mockRejectedValue(new ApiError("x", 409, "conflict", { reason: "exists", path: "p" }));
    renderToolbar();
    fireEvent.change(screen.getByTestId("upload-input"), {
      target: { files: [new File(["x"], "d.md", { type: "text/markdown" })] },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Cancel d.md" }));
    expect(upload).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Overwrite d.md" })).toBeNull();
  });
});
