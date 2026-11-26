import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useSkill } from "@/lib/hooks/skills";
import { ToastProvider } from "@/lib/toast";
import messages from "../../../../../../../messages/en/skills.json";
import { VersionsTab } from "./VersionsTab";

const V1: SkillVersion = {
  skill_id: "sk1",
  version: 1,
  body: "# Rule\nno secrets",
  message: "Initial version",
  created_at: "2026-11-01T10:00:00Z",
};
const V2: SkillVersion = {
  skill_id: "sk1",
  version: 2,
  body: "# Rule\nno tokens",
  message: "Edited body",
  created_at: "2026-11-20T10:00:00Z",
};
const V3: SkillVersion = { ...V1, version: 3, message: "Restored from v1", created_at: "2026-11-26T10:00:00Z" };

const SKILL: Skill = {
  id: "sk1",
  name: "secret-leakage-gate",
  description: "",
  type: "security",
  source: "manual",
  body: V2.body,
  enabled: true,
  version: 2,
  evidence_files: null,
  created_at: V1.created_at,
  updated_at: V2.created_at,
  agent_count: 0,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Tiny in-memory API: GET skill / versions, POST restore → new version. */
function mockApi() {
  let skill = SKILL;
  let versions = [V1, V2];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    if (init?.method === "POST" && path === "/skills/sk1/versions/1/restore") {
      skill = { ...skill, version: 3, body: V1.body };
      versions = [...versions, V3];
      return json(skill);
    }
    if (path === "/skills/sk1/versions") return json(versions);
    if (path === "/skills/sk1") return json(skill);
    return json({ error: { message: "not found" } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Mirrors the SkillDetail shell: the tab gets the skill from the query cache. */
function Harness() {
  const skill = useSkill("sk1");
  return skill.data ? <VersionsTab skill={skill.data} /> : null;
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <ToastProvider>
          <Harness />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const rowOf = (message: string) => screen.getByText(message).closest("li") as HTMLElement;
const findRow = async (message: string) => (await screen.findByText(message)).closest("li") as HTMLElement;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("VersionsTab", () => {
  it("lists versions newest first: Current + Diff on the latest, Restore on older ones, no Diff on v1", async () => {
    mockApi();
    renderTab();

    expect(await screen.findByText("Edited body")).toBeInTheDocument();
    expect(screen.getByText("2 versions")).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((row) => within(row).getByText(/^v\d$/).textContent)).toEqual(["v2", "v1"]);

    const current = rowOf("Edited body");
    expect(within(current).getByText("Current")).toBeInTheDocument();
    expect(within(current).getByRole("button", { name: "Diff" })).toBeInTheDocument();
    expect(within(current).queryByRole("button", { name: "Restore" })).not.toBeInTheDocument();
    expect(within(current).getByText("2026-11-20")).toBeInTheDocument();

    const first = rowOf("Initial version");
    expect(within(first).queryByRole("button", { name: "Diff" })).not.toBeInTheDocument();
    expect(within(first).getByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  it("Diff on the current version shows what changed from the previous one, inline", async () => {
    mockApi();
    renderTab();

    const current = await findRow("Edited body");
    fireEvent.click(within(current).getByRole("button", { name: "Diff" }));

    const diff = within(current).getByRole("region", { name: "v1 → v2" });
    expect(within(diff).getByText("no secrets").closest("[data-kind]")).toHaveAttribute("data-kind", "del");
    expect(within(diff).getByText("no tokens").closest("[data-kind]")).toHaveAttribute("data-kind", "add");
    expect(within(diff).getByText("# Rule").closest("[data-kind]")).toHaveAttribute("data-kind", "same");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(within(current).getByRole("button", { name: "Diff" }));
    expect(within(current).queryByRole("region")).not.toBeInTheDocument();
  });

  it("restores after confirmation: POSTs, toasts and refreshes the list", async () => {
    const fetchMock = mockApi();
    renderTab();

    fireEvent.click(within(await findRow("Initial version")).getByRole("button", { name: "Restore" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Restore v1?")).toBeInTheDocument();
    expect(within(dialog).getByText(/This creates v3 with the body of v1/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));

    expect(await screen.findByText("Restored v1 as v3")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => String(url).endsWith("/skills/sk1/versions/1/restore") && init?.method === "POST",
      ),
    ).toBe(true);
    expect(await screen.findByText("Restored from v1")).toBeInTheDocument();
    expect(screen.getByText("3 versions")).toBeInTheDocument();
    await waitFor(() => expect(within(rowOf("Restored from v1")).getByText("Current")).toBeInTheDocument());
    expect(within(rowOf("Edited body")).getByRole("button", { name: "Diff" })).toBeInTheDocument();
    expect(within(rowOf("Restored from v1")).getByRole("button", { name: "Diff" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cancelling the confirmation does not call the API", async () => {
    const fetchMock = mockApi();
    renderTab();

    fireEvent.click(within(await findRow("Initial version")).getByRole("button", { name: "Restore" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });
});
