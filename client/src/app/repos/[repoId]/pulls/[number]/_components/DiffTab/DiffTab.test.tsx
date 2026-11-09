import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@devdigest/shared";
import shell from "../../../../../../../../messages/en/shell.json";
import brief from "../../../../../../../../messages/en/brief.json";
import { DiffTab } from "./DiffTab";

vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

const FILE: PrFile = {
  path: "src/a.ts",
  additions: 1,
  deletions: 0,
  patch: "@@ -0,0 +1,1 @@\n+only-line",
};

describe("DiffTab line target", () => {
  it("announces the fallback note when the target line is not in the diff", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ shell, brief }}>
        <DiffTab prId="p1" filesCount={1} files={[FILE]} focusPath="src/a.ts" focusLines={{ start: 40, end: 40 }} />
      </NextIntlClientProvider>
    );

    expect(screen.getByRole("status")).toHaveTextContent("Line 40 isn't part of this diff — showing the file");
  });
});
