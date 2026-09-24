/* /skills route entry — the legacy ?preview=<id> drawer link redirects to the
   skill editor; otherwise the page renders the grid. */
import { describe, it, expect, beforeEach, vi } from "vitest";

const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect }));

import SkillsPage from "./page";
import { SkillsView } from "./_components/SkillsView";

beforeEach(() => {
  redirect.mockClear();
});

describe("SkillsPage", () => {
  it("redirects ?preview=<id> to the editor", async () => {
    await expect(SkillsPage({ searchParams: Promise.resolve({ preview: "sk 1" }) })).rejects.toThrow(
      "NEXT_REDIRECT /skills/sk%201?tab=config",
    );
  });

  it.each([{}, { preview: "" }])("renders the grid for %j", async (search) => {
    const page = await SkillsPage({ searchParams: Promise.resolve(search) });
    expect(page.type).toBe(SkillsView);
    expect(redirect).not.toHaveBeenCalled();
  });
});
