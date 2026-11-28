import { describe, expect, it } from "vitest";
import { confidenceColor, confidencePercent, evidenceUrl, nextStatus } from "./helpers";

const c = { evidence_path: "src/api/users.ts", evidence_start_line: 23, evidence_end_line: 31 };

describe("ConventionCard helpers", () => {
  it("links the evidence lines on GitHub", () => {
    expect(evidenceUrl({ full_name: "acme/api", default_branch: "main" }, c)).toBe(
      "https://github.com/acme/api/blob/main/src/api/users.ts#L23-L31",
    );
    expect(evidenceUrl(null, c)).toBeNull();
  });

  it("maps confidence to a percent and a colour band", () => {
    expect(confidencePercent(0.914)).toBe(91);
    expect(confidenceColor(0.91)).toBe("var(--ok)");
    expect(confidenceColor(0.7)).toBe("var(--warn)");
    expect(confidenceColor(0.5)).toBe("var(--accent)");
  });

  it("toggles a decision back to pending when pressed again", () => {
    expect(nextStatus("pending", "accepted")).toBe("accepted");
    expect(nextStatus("accepted", "accepted")).toBe("pending");
    expect(nextStatus("accepted", "rejected")).toBe("rejected");
  });
});
