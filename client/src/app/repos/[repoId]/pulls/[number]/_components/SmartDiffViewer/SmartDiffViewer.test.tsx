import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import type { SmartDiffGroup } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/shell.json";
import { SmartDiffViewer } from "./SmartDiffViewer";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const FILES: PrFile[] = [
  {
    path: "src/middleware/ratelimit.ts",
    additions: 30,
    deletions: 0,
    patch: "@@ -1,2 +1,3 @@\n+const a = 1;\n+const b = 2;\n context;",
  },
  {
    path: "package-lock.json",
    additions: 92,
    deletions: 24,
    patch: "@@ -1,1 +1,1 @@\n+lockfile change",
  },
];

const GROUPS: SmartDiffGroup[] = [
  {
    role: "core",
    files: [
      {
        path: "src/middleware/ratelimit.ts",
        pseudocode_summary: null,
        additions: 30,
        deletions: 0,
        finding_lines: [2],
      },
    ],
  },
  {
    role: "boilerplate",
    files: [
      {
        path: "package-lock.json",
        pseudocode_summary: null,
        additions: 92,
        deletions: 24,
        finding_lines: [],
      },
    ],
  },
];

describe("SmartDiffViewer", () => {
  it("renders groups in core, wiring, boilerplate order", () => {
    renderWithIntl(<SmartDiffViewer files={FILES} groups={GROUPS} />);
    const headings = screen.getAllByText(/Core logic|Boilerplate/);
    expect(headings[0]).toHaveTextContent("Core logic");
    expect(headings[1]).toHaveTextContent("Boilerplate");
  });

  it("keeps a boilerplate file collapsed by default even though it's small", () => {
    renderWithIntl(<SmartDiffViewer files={FILES} groups={GROUPS} />);
    expect(screen.queryByText("lockfile change")).not.toBeInTheDocument();
  });

  it("opens the file and exposes the target line anchor when a findings badge is clicked", () => {
    renderWithIntl(<SmartDiffViewer files={FILES} groups={GROUPS} />);
    const badge = screen.getByText(/finding/i);
    fireEvent.click(badge);
    expect(document.getElementById("diffline-src/middleware/ratelimit.ts-2")).toBeInTheDocument();
  });
});
