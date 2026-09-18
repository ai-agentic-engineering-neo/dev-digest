import { describe, it, expect } from "vitest";
import { repoPrUrl, repoBlobUrl } from "./repo-urls";

describe("repoPrUrl", () => {
  it("builds a GitHub pull request URL", () => {
    expect(repoPrUrl("github", "acme/payments-api", 42)).toBe(
      "https://github.com/acme/payments-api/pull/42",
    );
  });

  it("builds a GitLab merge request URL", () => {
    expect(repoPrUrl("gitlab", "acme/payments-api", 42)).toBe(
      "https://gitlab.com/acme/payments-api/-/merge_requests/42",
    );
  });

  it("builds a GitLab merge request URL for a nested namespace", () => {
    expect(repoPrUrl("gitlab", "acme/platform/payments-api", 3)).toBe(
      "https://gitlab.com/acme/platform/payments-api/-/merge_requests/3",
    );
  });
});

describe("repoBlobUrl", () => {
  it("builds a GitHub blob URL with a single line anchor", () => {
    expect(repoBlobUrl("github", "acme/payments-api", "sha1", "src/config.ts", 11)).toBe(
      "https://github.com/acme/payments-api/blob/sha1/src/config.ts#L11",
    );
  });

  it("builds a GitHub blob URL with a line range", () => {
    expect(repoBlobUrl("github", "acme/payments-api", "sha1", "src/config.ts", 11, 14)).toBe(
      "https://github.com/acme/payments-api/blob/sha1/src/config.ts#L11-L14",
    );
  });

  it("builds a GitLab blob URL with a single line anchor", () => {
    expect(repoBlobUrl("gitlab", "acme/payments-api", "sha1", "src/config.ts", 11)).toBe(
      "https://gitlab.com/acme/payments-api/-/blob/sha1/src/config.ts#L11",
    );
  });

  it("builds a GitLab blob URL with a line range (no second L)", () => {
    expect(repoBlobUrl("gitlab", "acme/payments-api", "sha1", "src/config.ts", 11, 14)).toBe(
      "https://gitlab.com/acme/payments-api/-/blob/sha1/src/config.ts#L11-14",
    );
  });

  it("percent-encodes path segments while keeping slashes", () => {
    expect(repoBlobUrl("github", "acme/payments-api", "sha1", "src/a b.ts")).toBe(
      "https://github.com/acme/payments-api/blob/sha1/src/a%20b.ts",
    );
  });
});
