import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { PreviewTab } from "./PreviewTab";

afterEach(cleanup);

const DESCRIPTION = "THIS DESCRIPTION MUST NOT APPEAR IN PREVIEW";

const SKILL: Skill = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Uncovered branches",
  description: DESCRIPTION,
  type: "custom",
  source: "manual",
  body: "# Uncovered branches\nRequire an assertion per new branch.",
  enabled: true,
  version: 1,
};

describe("PreviewTab", () => {
  it("renders a heading from the body and does not inject description", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <PreviewTab skill={SKILL} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { name: "Uncovered branches" })).toBeInTheDocument();
    expect(screen.queryByText(DESCRIPTION)).not.toBeInTheDocument();
  });
});
