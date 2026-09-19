import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { PreviewTab } from "./PreviewTab";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "test-coverage-nudge",
  description: "d",
  type: "custom",
  source: "manual",
  body: "## Rule\n\nCover **every** branch:\n\n- a failing assertion\n- a named case\n",
  enabled: true,
  version: 1,
  token_estimate: 10,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("PreviewTab", () => {
  it("renders the body as markdown, headed by what the text is for", () => {
    renderWithIntl(<PreviewTab skill={SKILL} />);

    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(
      screen.getByText("The exact text sent to the model when this skill is enabled."),
    ).toBeInTheDocument();

    // A `##` becomes a real heading, not literal text, and a `-` list becomes
    // list items — the reviewer sees the rendered skill, not its source.
    expect(screen.getByRole("heading", { name: "Rule" })).toBeInTheDocument();
    expect(screen.queryByText(/^## Rule/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("every").tagName).toBe("STRONG");
  });
});
