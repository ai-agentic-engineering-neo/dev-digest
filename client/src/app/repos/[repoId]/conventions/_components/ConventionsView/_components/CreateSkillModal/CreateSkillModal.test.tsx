import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import conventions from "../../../../../../../../../messages/en/conventions.json";
import skills from "../../../../../../../../../messages/en/skills.json";

const mutate = vi.fn();
const createQ = { mutate, isPending: false };
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/toast", () => ({ useToast: () => ({ info: vi.fn(), success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/lib/hooks/conventions", () => ({ useCreateSkillFromConventions: () => createQ }));

import { CreateSkillModal } from "./CreateSkillModal";

const ACCEPTED: ConventionCandidate[] = [
  {
    id: "c1",
    category: "async-await-only",
    rule: "Always use async/await instead of .then() chains.",
    evidence_path: "src/api/users.ts",
    evidence_start_line: 23,
    evidence_end_line: 31,
    evidence_snippet: "const user = await db.users.find(id);",
    confidence: 0.91,
    status: "accepted",
  },
];

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

function renderModal() {
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions, skills }}>
      <CreateSkillModal repoId="r1" repoName="payments-api" accepted={ACCEPTED} onClose={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

const bodyBox = () => screen.getAllByRole("textbox").find((el) => el.tagName === "TEXTAREA") as HTMLTextAreaElement;

describe("CreateSkillModal", () => {
  it("prefills name, description and a body built from the accepted conventions", () => {
    renderModal();
    expect(screen.getByDisplayValue("payments-api-conventions")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1 house convention extracted from payments-api")).toBeInTheDocument();
    expect(bodyBox().value).toContain("## async-await-only");
    expect(bodyBox().value).toContain("Detected in `src/api/users.ts:23-31`:");
  });

  it("keeps the body heading in sync with the name until the body is edited", () => {
    renderModal();
    fireEvent.change(screen.getByDisplayValue("payments-api-conventions"), { target: { value: "house-rules" } });
    expect(bodyBox().value.startsWith("# house-rules\n")).toBe(true);

    fireEvent.change(bodyBox(), { target: { value: "# custom" } });
    fireEvent.change(screen.getByDisplayValue("house-rules"), { target: { value: "renamed" } });
    expect(bodyBox().value).toBe("# custom");
  });

  it("submits the accepted ids with the edited fields", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /Create skill/ }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toMatchObject({
      convention_ids: ["c1"],
      name: "payments-api-conventions",
      enabled: true,
    });
  });
});
