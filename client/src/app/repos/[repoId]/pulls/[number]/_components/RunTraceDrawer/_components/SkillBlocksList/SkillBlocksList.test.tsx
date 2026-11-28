import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { SkillBlocksList } from "./SkillBlocksList";

afterEach(cleanup);

describe("SkillBlocksList (run trace, M2)", () => {
  it("lists the applied skills in prompt order with token cost and flags imported ones", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
        <SkillBlocksList
          blocks={[
            { skill_id: "a", name: "untested-branches", source: "manual", version: 2, tokens: 380 },
            { skill_id: "b", name: "flaky-test-smells", source: "imported_file", version: 1, tokens: 440 },
          ]}
        />
      </NextIntlClientProvider>,
    );
    const items = within(screen.getByRole("list", { name: "Skills applied in this run" })).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("1.untested-branchesv2380 tok");
    expect(items[1]).toHaveTextContent("imported");
    expect(items[0]).not.toHaveTextContent("imported");
  });
});
