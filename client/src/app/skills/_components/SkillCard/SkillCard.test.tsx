import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Uncovered branches",
  description: "Flag new production paths with no asserting test.",
  type: "custom",
  source: "manual",
  body: "# Uncovered branches\nRequire an assertion per new branch.",
  enabled: true,
  version: 1,
};

function renderCard(skill: Skill) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <SkillCard skill={skill} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SkillCard", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ ...SKILL, enabled: false }),
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the name, type badge and description", () => {
    renderCard(SKILL);
    expect(screen.getByText("Uncovered branches")).toBeInTheDocument();
    expect(screen.getByText("custom")).toBeInTheDocument();
    expect(screen.getByText("Flag new production paths with no asserting test.")).toBeInTheDocument();
  });

  it("greys the card when enabled=false", () => {
    const { container } = renderCard({ ...SKILL, enabled: false });
    const card = container.querySelector("div");
    expect(card).toHaveStyle({ opacity: "0.6" });
  });

  it("toggle calls PUT /skills/:id with { enabled }", async () => {
    renderCard(SKILL);
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const call = vi.mocked(fetch).mock.calls.find((c) => {
      const init = c[1] as RequestInit | undefined;
      return init?.method === "PUT";
    });
    expect(call).toBeTruthy();
    expect(String(call![0])).toContain(`/skills/${SKILL.id}`);
    expect(JSON.parse(String((call![1] as RequestInit).body))).toEqual({ enabled: false });
  });
});
