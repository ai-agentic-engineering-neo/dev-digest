import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import conventions from "../../../../../../../messages/en/conventions.json";
import skills from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const createSkill = vi.fn();
const attach = vi.fn();
const push = vi.fn();
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync: createSkill, isPending: false, error: null }),
  useAttachSkillToAgents: () => ({ mutateAsync: attach, isPending: false }),
}));
vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: [{ id: "a1", name: "General Reviewer" }, { id: "a2", name: "Security Reviewer" }] }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

import { CreateSkillFromConventionsModal } from "./CreateSkillFromConventionsModal";

afterEach(cleanup);
beforeEach(() => {
  createSkill.mockReset().mockResolvedValue({ id: "s1", name: "repo-conventions" });
  attach.mockReset().mockResolvedValue([]);
  push.mockReset();
});

const conv = (over: Partial<ConventionCandidate>): ConventionCandidate => ({
  id: "c1",
  category: "style",
  rule: "Use async/await",
  evidence_path: "src/api/users.ts",
  evidence_line: 23,
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.9,
  status: "accepted",
  ...over,
});

const ACCEPTED = [
  conv({}),
  conv({ id: "c2", category: "structure", rule: "Redis via the singleton", evidence_path: "src/lib/redis.ts", evidence_line: 1 }),
];

function renderModal(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions, skills }}>
      <ToastProvider>
        <CreateSkillFromConventionsModal repoName="payments-api" conventions={ACCEPTED} onClose={onClose} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return onClose;
}

const bodyField = () => screen.getByPlaceholderText(/# Rule/) as HTMLTextAreaElement;

describe("CreateSkillFromConventionsModal", () => {
  it("prefills one convention skill from every accepted candidate", () => {
    renderModal();
    expect(screen.getByLabelText("Name")).toHaveValue("repo-conventions");
    expect(bodyField().value).toContain("# Conventions of payments-api");
    expect(bodyField().value).toContain("- **Use async/await**");
    expect(bodyField().value).toContain("- **Redis via the singleton**");
  });

  it("regenerates the body when a convention is excluded", () => {
    renderModal();
    fireEvent.click(screen.getByLabelText("Redis via the singleton"));
    expect(bodyField().value).not.toContain("Redis via the singleton");
  });

  it("saves an extracted skill with its evidence files, attaches it to the chosen agents and opens it", async () => {
    const onClose = renderModal();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " payments-conventions " } });
    fireEvent.click(screen.getByLabelText("Security Reviewer"));
    fireEvent.click(screen.getByRole("button", { name: "Save skill" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/skills/s1?tab=config"));
    expect(createSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "payments-conventions",
        type: "convention",
        source: "extracted",
        evidence_files: ["src/api/users.ts", "src/lib/redis.ts"],
      }),
    );
    expect(attach).toHaveBeenCalledWith({ skillId: "s1", agentIds: ["a2"] });
    expect(onClose).toHaveBeenCalled();
  });

  it("does not attach when no agent is chosen, and cancel saves nothing", async () => {
    const onClose = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(createSkill).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save skill" }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(attach).not.toHaveBeenCalled();
  });
});
