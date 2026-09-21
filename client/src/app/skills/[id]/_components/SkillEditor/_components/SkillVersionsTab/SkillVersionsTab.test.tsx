import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { renderWithProviders, mockFetch, SKILL_ITEM } from "../../../../../_test/harness";
import { SkillVersionsTab } from "./SkillVersionsTab";
import { availableViews, resolveView } from "./helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ver = (version: number, body: string, restored_from: number | null = null) => ({
  skill_id: "s1",
  version,
  body,
  created_at: `2026-0${version}-01T10:00:00.000Z`,
  restored_from,
});

const VERSIONS = [ver(1, "# Old heading"), ver(2, "# New heading")];
const rows = () => screen.findAllByRole("button", { name: /Show or hide version/ });
const restoreButtons = () => screen.queryAllByRole("button", { name: /^Restore version/ });

describe("SkillVersionsTab", () => {
  it("lists versions newest first, marks the latest current, and expands a body", async () => {
    mockFetch({ "GET /skills/s1/versions": VERSIONS });
    renderWithProviders(<SkillVersionsTab skillId="s1" />);

    const r = await rows();
    expect(r).toHaveLength(2);
    expect(r[0]).toHaveTextContent("v2");
    expect(r[1]).toHaveTextContent("v1");
    expect(r[0]).toHaveTextContent("current");
    expect(r[1]).not.toHaveTextContent("current");
    expect(screen.queryByText("Old heading")).not.toBeInTheDocument();

    fireEvent.click(r[1]!);
    fireEvent.click(await screen.findByRole("button", { name: "Rendered" }));
    expect(await screen.findByRole("heading", { name: "Old heading" })).toBeInTheDocument();
    expect(r[1]).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(r[1]!);
    expect(screen.queryByText("Old heading")).not.toBeInTheDocument();
  });

  describe("diff", () => {
    const THREE = [
      ver(1, "# Rule\nkeep\nold line"),
      ver(2, "# Rule\nkeep\nmiddle line"),
      ver(3, "# Rule\nkeep\nnew line\nextra"),
    ];

    it("an older version diffs against the CURRENT version by default", async () => {
      mockFetch({ "GET /skills/s1/versions": THREE });
      renderWithProviders(<SkillVersionsTab skillId="s1" />);
      const r = await rows(); // v3, v2, v1

      fireEvent.click(r[2]!); // v1
      expect(await screen.findByText("Changes from v1 to current (v3)")).toBeInTheDocument();
      expect(screen.getByText("+2")).toBeInTheDocument();
      expect(screen.getByText("−1")).toBeInTheDocument();
      expect(document.querySelector('[data-diff="del"]')).toHaveTextContent("old line");
      const added = [...document.querySelectorAll('[data-diff="add"]')].map((n) => n.textContent);
      expect(added).toEqual([expect.stringContaining("new line"), expect.stringContaining("extra")]);
      expect(screen.getByRole("button", { name: "Diff vs current" })).toHaveAttribute("aria-pressed", "true");
    });

    it("can switch an older version to the per-step diff against its previous version", async () => {
      mockFetch({ "GET /skills/s1/versions": THREE });
      renderWithProviders(<SkillVersionsTab skillId="s1" />);
      const r = await rows();

      fireEvent.click(r[1]!); // v2
      expect(await screen.findByText("Changes from v2 to current (v3)")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Diff vs previous" }));
      expect(await screen.findByText("Changes from v1")).toBeInTheDocument();
      expect(document.querySelector('[data-diff="del"]')).toHaveTextContent("old line");
      expect(document.querySelector('[data-diff="add"]')).toHaveTextContent("middle line");

      fireEvent.click(screen.getByRole("button", { name: "Rendered" }));
      expect(screen.queryByText("Changes from v1")).not.toBeInTheDocument();
      expect(await screen.findByRole("heading", { name: "Rule" })).toBeInTheDocument();
    });

    it("the current version only offers diff vs previous (nothing to compare it to) and Rendered", async () => {
      mockFetch({ "GET /skills/s1/versions": THREE });
      renderWithProviders(<SkillVersionsTab skillId="s1" />);
      const r = await rows();

      fireEvent.click(r[0]!); // v3 = current
      expect(await screen.findByText("Changes from v2")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Diff vs current" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Diff vs previous" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Rendered" })).toBeInTheDocument();
    });

    it("says so when an older version is identical to the current one", async () => {
      mockFetch({ "GET /skills/s1/versions": [ver(1, "same"), ver(2, "different"), ver(3, "same")] });
      renderWithProviders(<SkillVersionsTab skillId="s1" />);
      const r = await rows();
      fireEvent.click(r[2]!);
      expect(await screen.findByText("v1 is identical to the current version (v3).")).toBeInTheDocument();
    });

    it("a lone version has nothing to diff: no view toggle, rendered body", async () => {
      mockFetch({ "GET /skills/s1/versions": [ver(1, "# Only")] });
      renderWithProviders(<SkillVersionsTab skillId="s1" />);
      const r = await rows();
      fireEvent.click(r[0]!);
      expect(await screen.findByRole("heading", { name: "Only" })).toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "Version view" })).not.toBeInTheDocument();
    });
  });

  describe("restore", () => {
    const HISTORY = [ver(1, "# A"), ver(2, "# B"), ver(3, "# A", 1)];

    it("offers Restore on every version except the current one", async () => {
      mockFetch({ "GET /skills/s1/versions": HISTORY });
      renderWithProviders(<SkillVersionsTab skillId="s1" />);
      await rows();
      expect(restoreButtons().map((b) => b.getAttribute("aria-label"))).toEqual([
        "Restore version 2",
        "Restore version 1",
      ]);
    });

    it("marks a version created by a restore with 'Restored from vN'", async () => {
      mockFetch({ "GET /skills/s1/versions": HISTORY });
      renderWithProviders(<SkillVersionsTab skillId="s1" />);
      const r = await rows();
      expect(r[0]).toHaveTextContent("Restored from v1");
      expect(r[1]).not.toHaveTextContent("Restored from");
    });

    it("confirming POSTs the restore, toasts, and stays on the tab", async () => {
      const fetchMock = mockFetch({
        "GET /skills/s1/versions": HISTORY,
        "POST /skills/s1/versions/1/restore": { ...SKILL_ITEM, version: 4, body: "# A" },
      });
      renderWithProviders(<SkillVersionsTab skillId="s1" />);
      await rows();

      fireEvent.click(screen.getByRole("button", { name: "Restore version 1" }));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("Restore v1?")).toBeInTheDocument();
      expect(dialog).toHaveTextContent("This creates v4 with v1’s body. The current body is kept in history.");
      // Asking is not doing.
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);

      fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining("/skills/s1/versions/1/restore"),
          expect.objectContaining({ method: "POST" }),
        ),
      );
      expect(await screen.findByText("Restored v1 — now at v4")).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Version history" })).toBeInTheDocument();
    });

    it("refetches the version list after a restore", async () => {
      let served = 0;
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        const body = url.endsWith("/versions")
          ? [...HISTORY, ...(served++ > 0 ? [ver(4, "# A", 1)] : [])]
          : { ...SKILL_ITEM, version: 4 };
        return new Response(JSON.stringify(method === "POST" ? { ...SKILL_ITEM, version: 4 } : body), { status: 200 });
      });
      vi.stubGlobal("fetch", fetchMock);
      renderWithProviders(<SkillVersionsTab skillId="s1" />);
      await rows();
      fireEvent.click(screen.getByRole("button", { name: "Restore version 1" }));
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restore" }));
      await waitFor(() => expect(screen.getAllByRole("button", { name: /Show or hide version/ })).toHaveLength(4));
    });

    it("Cancel closes the dialog without restoring", async () => {
      const fetchMock = mockFetch({ "GET /skills/s1/versions": HISTORY });
      renderWithProviders(<SkillVersionsTab skillId="s1" />);
      await rows();
      fireEvent.click(screen.getByRole("button", { name: "Restore version 2" }));
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
    });

    it("keeps the dialog open when the restore fails", async () => {
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
        init?.method === "POST"
          ? new Response(JSON.stringify({ error: { message: "conflict" } }), { status: 409 })
          : new Response(JSON.stringify(HISTORY), { status: 200 }),
      );
      vi.stubGlobal("fetch", fetchMock);
      renderWithProviders(<SkillVersionsTab skillId="s1" />);
      await rows();
      fireEvent.click(screen.getByRole("button", { name: "Restore version 1" }));
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Restore" }));
      await waitFor(() => expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Restore" })).toBeEnabled());
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });
});

describe("version view helpers", () => {
  it("offers diff-vs-current only to non-latest versions and diff-vs-previous only when a previous exists", () => {
    expect(availableViews(true, true)).toEqual(["previous", "rendered"]);
    expect(availableViews(false, true)).toEqual(["current", "previous", "rendered"]);
    expect(availableViews(false, false)).toEqual(["current", "rendered"]);
    expect(availableViews(true, false)).toEqual(["rendered"]);
  });

  it("falls back to the first available view", () => {
    expect(resolveView("current", ["previous", "rendered"])).toBe("previous");
    expect(resolveView("rendered", ["current", "rendered"])).toBe("rendered");
  });
});
