import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import skills from "../../../../../messages/en/skills.json";

const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => search,
}));

import { SkillsIndex } from "./SkillsIndex";

function renderIndex() {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills }}>
      <SkillsIndex />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  replace.mockClear();
  search = new URLSearchParams();
});

describe("SkillsIndex", () => {
  it("asks to pick a skill when nothing is selected", () => {
    renderIndex();
    expect(screen.getByText("Select a skill")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("forwards an old ?skill= link to the skill's own address, tab included", () => {
    search = new URLSearchParams("skill=sk-1&tab=versions");
    renderIndex();
    expect(replace).toHaveBeenCalledWith("/skills/sk-1?tab=versions");
  });
});
