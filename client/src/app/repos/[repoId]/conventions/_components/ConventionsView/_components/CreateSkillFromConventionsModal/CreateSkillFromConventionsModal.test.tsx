import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../../../messages/en/conventions.json";
import { CreateSkillFromConventionsModal } from "./CreateSkillFromConventionsModal";

const REPO_ID = "11111111-1111-4111-8111-111111111111";
const AGENT_ID = "22222222-2222-4222-8222-222222222222";

const ACCEPTED_A: ConventionCandidate = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  rule: "Always use async/await instead of .then() chains",
  evidence_path: "src/api/users.ts",
  evidence_snippet: "const user = await db.users.find(id);",
  confidence: 0.91,
  status: "accepted",
  category: "async",
  evidence_start_line: 23,
  evidence_end_line: 31,
  accepted: true,
};

const ACCEPTED_B: ConventionCandidate = {
  ...ACCEPTED_A,
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  rule: "All public route handlers return typed Result<T, ApiError>",
  evidence_path: "src/api/public/index.ts",
  evidence_start_line: 14,
  evidence_end_line: 20,
  category: "types",
};

const REJECTED: ConventionCandidate = {
  ...ACCEPTED_A,
  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  rule: "Do not leak secrets",
  status: "rejected",
  accepted: false,
  category: "security",
};

const onClose = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

function renderModal(selected: ConventionCandidate[] = [ACCEPTED_A, ACCEPTED_B]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
        <CreateSkillFromConventionsModal
          repoId={REPO_ID}
          repoFullName="acme/payments-api"
          selected={selected}
          onClose={onClose}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function composePosts(): Array<Record<string, unknown>> {
  return vi
    .mocked(fetch)
    .mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "POST")
    .map((c) => JSON.parse(String((c[1] as RequestInit).body)) as Record<string, unknown>);
}

beforeEach(() => {
  onClose.mockReset();
  push.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "GET" && url.includes("/agents")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: AGENT_ID,
              name: "API Contract Reviewer",
              description: "",
              provider: "openai",
              model: "gpt-4o-mini",
              system_prompt: "Review.",
              enabled: true,
              version: 1,
              strategy: "single-pass",
              ci_fail_on: "critical",
              repo_intel: true,
            },
          ],
        };
      }
      if (method === "POST" && url.includes("/conventions/skills")) {
        return {
          ok: true,
          status: 201,
          json: async () => ({ id: "skill-1", name: "repo-conventions", source: "extracted" }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CreateSkillFromConventionsModal", () => {
  it("shows banner N, token label, and disables create while required fields are empty", async () => {
    renderModal();
    expect(
      await screen.findByText(/Merged from 2 accepted conventions in payments-api/),
    ).toBeInTheDocument();
    expect(screen.getByText(/tokens/)).toBeInTheDocument();
    expect(screen.queryByText(/split/i)).not.toBeInTheDocument();

    const create = screen.getByRole("button", { name: "Create skill" });
    expect(create).toBeEnabled();

    fireEvent.change(screen.getByDisplayValue("repo-conventions"), { target: { value: "" } });
    expect(create).toBeDisabled();
  });

  it("Cancel does not POST", async () => {
    renderModal();
    await screen.findByText(/Merged from 2 accepted conventions/);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(composePosts()).toHaveLength(0);
    expect(onClose).toHaveBeenCalled();
  });

  it("defaults the name to repo-conventions and attaches the first agent", async () => {
    renderModal([ACCEPTED_A, ACCEPTED_B, REJECTED]);
    expect(await screen.findByDisplayValue("repo-conventions")).toBeInTheDocument();
    await waitFor(() => {
      const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
      expect(selects[1]?.value).toBe(AGENT_ID);
    });
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    await waitFor(() => expect(composePosts()).toHaveLength(1));
    const body = composePosts()[0]!;
    expect(body.convention_ids).toEqual([ACCEPTED_A.id, ACCEPTED_B.id]);
    expect(body.name).toBe("repo-conventions");
    expect(body.agent_id).toBe(AGENT_ID);
    expect(body.type).toBe("convention");
    expect(onClose).toHaveBeenCalled();
  });

  it("omits agent_id when the picker is set to none", async () => {
    renderModal();
    await waitFor(() => {
      const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
      expect(selects[1]?.value).toBe(AGENT_ID);
    });
    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[1]!, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    await waitFor(() => expect(composePosts()).toHaveLength(1));
    expect(composePosts()[0]!.agent_id).toBeUndefined();
  });
});
