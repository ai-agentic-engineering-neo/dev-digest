import { describe, it, expect } from "vitest";
import { formatBytes, importFileError } from "./helpers";

describe("formatBytes", () => {
  it("formats bytes, kilobytes and megabytes", () => {
    expect(formatBytes(512)).toEqual({ key: "bytes", value: "512" });
    expect(formatBytes(2150)).toEqual({ key: "kb", value: "2.1" });
    expect(formatBytes(1_468_006)).toEqual({ key: "mb", value: "1.4" });
  });
});

describe("importFileError", () => {
  it("accepts .md and .zip up to 1 MB", () => {
    expect(importFileError({ name: "SKILL.MD", size: 10 })).toBeNull();
    expect(importFileError({ name: "skill.zip", size: 1_048_576 })).toBeNull();
  });

  it("rejects other extensions and larger files", () => {
    expect(importFileError({ name: "run.sh", size: 10 })).toBe("badType");
    expect(importFileError({ name: "big.zip", size: 2 * 1_048_576 })).toBe("tooLarge");
  });
});
