import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const restore = vi.fn();
const VERSIONS: SkillVersion[] = [
  {
    skill_id: "sk1",
    version: 3,
    body: "v3 body",
    note: "Tightened scope rule",
    created_at: "2026-05-30T10:00:00.000Z",
  },
  { skill_id: "sk1", version: 2, body: "v2 body", note: null, created_at: "2026-05-09T10:00:00.000Z" },
  {
    skill_id: "sk1",
    version: 1,
    body: "v1 body",
    note: "Seeded",
    created_at: "2026-03-02T10:00:00.000Z",
  },
];

vi.mock("@/lib/hooks/skills", () => ({
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false }),
  useRestoreSkillVersion: () => ({ mutate: restore, isPending: false, variables: undefined }),
}));

import { VersionsTab } from "./VersionsTab";

const SKILL: Skill = {
  id: "sk1",
  name: "pr-quality-rubric",
  description: "Quality rubric",
  type: "rubric",
  source: "manual",
  body: "v3 body",
  enabled: true,
  version: 3,
  evidence_files: null,
  agent_count: 1,
};

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <VersionsTab skill={SKILL} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);
beforeEach(() => {
  restore.mockClear();
});

describe("skill VersionsTab", () => {
  it("lists every snapshot, newest first, with its note", () => {
    renderTab();
    expect(screen.getByText("3 versions")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("Tightened scope rule")).toBeInTheDocument();
    expect(screen.getByText("Seeded")).toBeInTheDocument();
  });

  it("falls back to a placeholder when a version carries no note", () => {
    renderTab();
    expect(screen.getByText("No note")).toBeInTheDocument();
  });

  it("marks the live version as current and offers no Restore for it", () => {
    renderTab();
    expect(screen.getByText("Current")).toBeInTheDocument();
    // One Restore per older version, never for the current one.
    expect(screen.getAllByText("Restore")).toHaveLength(2);
  });

  it("restoring asks for the old version, not for a rewind", () => {
    renderTab();
    fireEvent.click(screen.getAllByText("Restore")[1]!);
    expect(restore).toHaveBeenCalledWith({ id: "sk1", version: 1 }, expect.anything());
  });
});
