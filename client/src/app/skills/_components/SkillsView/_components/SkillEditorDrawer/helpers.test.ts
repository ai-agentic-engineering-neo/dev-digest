import { describe, it, expect } from "vitest";
import { checkImportFile, fileToBase64 } from "./helpers";
import { IMPORT_MAX_BYTES } from "./constants";

describe("checkImportFile", () => {
  it("accepts .md and .zip within the limit", () => {
    expect(checkImportFile({ name: "SKILL.md", size: 10 })).toBeNull();
    expect(checkImportFile({ name: "pack.ZIP", size: 10 })).toBeNull();
  });
  it("rejects other types and oversize files", () => {
    expect(checkImportFile({ name: "run.sh", size: 10 })).toBe("badType");
    expect(checkImportFile({ name: "a.md", size: IMPORT_MAX_BYTES + 1 })).toBe("tooLarge");
  });
});

describe("fileToBase64", () => {
  it("encodes file content without the data-URL prefix", async () => {
    expect(await fileToBase64(new Blob(["hi"]))).toBe("aGk=");
  });
});
