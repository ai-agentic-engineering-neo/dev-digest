/* AddSkillMenu — the import entry points end in the preview modal; nothing is
   saved before Confirm. Real hooks over a stubbed API. */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderWithProviders, screen, cleanup, waitFor, within } from "@/test/render";
import { mockFetch, jsonResponse } from "@/test/fetch-mock";
import { makeSkill } from "@/test/skill-fixtures";
import type { SkillImportPreview, SkillImportRequest } from "@devdigest/shared";

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

import { AddSkillMenu } from "./AddSkillMenu";

const PREVIEW: SkillImportPreview = {
  name: "flaky-test-hunter",
  description: "Flag flaky tests.",
  type: "custom",
  body: "## Flaky\n\nNo sleeps.",
  source: "imported_file",
  source_ref: "flaky.zip",
  included_files: ["SKILL.md"],
  ignored_files: [{ path: "scripts/detect.sh", reason: "executable" }],
  warnings: [],
};

let api: ReturnType<typeof mockFetch>;
beforeEach(() => {
  nav.push.mockReset();
  api = mockFetch({
    "POST /skills/import/preview": (req) => {
      const body = req.body as SkillImportRequest;
      if (body.kind === "url") {
        return jsonResponse({ error: { code: "invalid_import", message: "The host resolves to a private address" } }, 422);
      }
      if (body.kind === "community") return { ...PREVIEW, source: "community", source_ref: `community:${body.id}` };
      return PREVIEW;
    },
    "GET /skills/community": [
      { id: "c1", name: "sql-injection-gate", repo: "acme/skills", stars: 120, lang: "ts", desc: "Flag string-built SQL", type: "security", tags: ["security"] },
    ],
    "POST /skills": makeSkill({ id: "new1" }),
  });
});
afterEach(cleanup);

async function openMenu(user: ReturnType<typeof import("@testing-library/user-event").default.setup>) {
  await user.click(screen.getByRole("button", { name: /Add Skill/ }));
}

describe("AddSkillMenu", () => {
  it("file import: reads the zip as base64, previews, saves nothing until Confirm", async () => {
    const { user } = renderWithProviders(<AddSkillMenu />);
    const zip = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "flaky.zip", { type: "application/zip" });
    await user.upload(screen.getByTestId("skill-import-file"), zip);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Review before importing")).toBeInTheDocument();
    expect(within(dialog).getByText("scripts/detect.sh — executable, never read")).toBeInTheDocument();
    const req = api.requests("POST", "/skills/import/preview")[0]!.body as SkillImportRequest;
    expect(req).toEqual({ kind: "file", filename: "flaky.zip", content_base64: "UEsDBA==" });
    expect(api.requests("POST", "/skills")).toHaveLength(0);

    await user.click(within(dialog).getByRole("button", { name: "Confirm import" }));
    await waitFor(() => expect(api.requests("POST", "/skills")).toHaveLength(1));
    expect(api.requests("POST", "/skills")[0]!.body).toMatchObject({ source: "imported_file", source_ref: "flaky.zip" });
  });

  it("URL import: a rejected URL shows the error inside the modal", async () => {
    const { user } = renderWithProviders(<AddSkillMenu />);
    await openMenu(user);
    await user.click(screen.getByRole("button", { name: "Import from URL" }));
    await user.type(screen.getByRole("textbox", { name: "URL" }), "https://10.0.0.1/SKILL.md");
    await user.click(screen.getByRole("button", { name: "Fetch preview" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The host resolves to a private address");
    expect(screen.getByText("Import from URL", { selector: "div" })).toBeInTheDocument();
  });

  it("community: search → Import → preview with the community source", async () => {
    const { user } = renderWithProviders(<AddSkillMenu />);
    await openMenu(user);
    await user.click(screen.getByRole("button", { name: "Search community skills…" }));
    await user.click(await screen.findByRole("button", { name: "Import sql-injection-gate" }));
    expect(await screen.findByText("Review before importing")).toBeInTheDocument();
    expect(screen.getByText("community:c1")).toBeInTheDocument();
    expect(api.requests("POST", "/skills/import/preview")[0]!.body).toEqual({ kind: "community", id: "c1" });
  });
});
