import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  checkFolderName,
  devdigestErrorOf,
  devdigestRelative,
  fileToBase64,
  isDevdigestPath,
  joinDevdigest,
  precheckUpload,
  utf8Bytes,
} from "./devdigest-docs";

describe("devdigest-docs helpers", () => {
  it("maps paths", () => {
    expect(isDevdigestPath(".devdigest/specs/a.md")).toBe(true);
    expect(isDevdigestPath("docs/a.md")).toBe(false);
    expect(devdigestRelative(".devdigest/specs/auth/a.md")).toBe("auth/a.md");
    expect(joinDevdigest("", "a.md")).toBe(".devdigest/specs/a.md");
    expect(joinDevdigest("auth", "a.md")).toBe(".devdigest/specs/auth/a.md");
  });

  it("extracts server error details", () => {
    const details = { reason: "exists", path: "p", doc_id: "d" };
    expect(devdigestErrorOf(new ApiError("x", 409, "conflict", details))).toEqual(details);
    expect(devdigestErrorOf(new ApiError("x", 413))).toEqual({ reason: "too_large" });
    expect(devdigestErrorOf(new ApiError("x", 422, "validation_error", { reason: "nope" }))).toBeNull();
    expect(devdigestErrorOf(new Error())).toBeNull();
  });

  it("prechecks uploads and folder names", () => {
    expect(precheckUpload({ name: "a.MD", size: 1_048_576 })).toBeNull();
    expect(precheckUpload({ name: "a.txt", size: 1 })).toBe("not_markdown");
    expect(precheckUpload({ name: "a.md", size: 1_048_577 })).toBe("too_large");
    expect(checkFolderName("a/../b")).toBe("dot_dot");
    expect(checkFolderName("")).toBe("empty");
    expect(checkFolderName("a//b")).toBe("empty_segment");
    expect(checkFolderName("auth/x")).toBeNull();
  });

  it("counts UTF-8 bytes and encodes files as base64 without the data prefix", async () => {
    expect(utf8Bytes("é")).toBe(2);
    expect(await fileToBase64(new Blob(["# ok"]))).toBe(btoa("# ok"));
  });
});
