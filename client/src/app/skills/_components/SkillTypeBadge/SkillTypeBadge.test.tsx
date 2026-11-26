import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/skills.json";
import { SkillTypeBadge } from "./SkillTypeBadge";

afterEach(cleanup);

describe("SkillTypeBadge", () => {
  it("renders the translated label for every type", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <SkillTypeBadge type="rubric" />
        <SkillTypeBadge type="convention" />
        <SkillTypeBadge type="security" />
        <SkillTypeBadge type="custom" />
      </NextIntlClientProvider>,
    );
    for (const label of ["rubric", "convention", "security", "custom"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
