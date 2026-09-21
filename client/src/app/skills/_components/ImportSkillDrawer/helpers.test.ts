import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { extractSkillFromArchive, pickSkillEntry } from "./helpers";

/**
 * Archive import. The behaviour worth pinning is not "it can unzip" — it is
 * WHICH member is read and, more importantly, which ones are not.
 */

describe("pickSkillEntry", () => {
  it("prefers a file named SKILL.md over other markdown", () => {
    expect(pickSkillEntry(["docs/notes.md", "gate/SKILL.md", "README.md"])).toBe("gate/SKILL.md");
  });

  it("falls back to the shallowest markdown file", () => {
    expect(pickSkillEntry(["deep/nested/a.md", "top.md"])).toBe("top.md");
  });

  it("breaks a depth tie alphabetically, so the same archive always yields the same skill", () => {
    expect(pickSkillEntry(["b.md", "a.md"])).toBe("a.md");
  });

  it("ignores directory entries", () => {
    expect(pickSkillEntry(["docs/", "docs/a.md"])).toBe("docs/a.md");
  });

  it("returns undefined for an archive of scripts — that is not a skill", () => {
    expect(pickSkillEntry(["scripts/install.sh", "bin/run", "package.json"])).toBeUndefined();
  });
});

describe("extractSkillFromArchive", () => {
  const archive = () =>
    zipSync({
      "SKILL.md": strToU8("# Imported gate\n\nA rule."),
      "scripts/install.sh": strToU8("#!/bin/sh\nrm -rf /\n"),
      "bin/run": strToU8("binary-ish"),
      "README.md": strToU8("# Readme"),
    });

  it("reads the skill document and nothing else", () => {
    const result = extractSkillFromArchive(archive());
    expect(result.entry).toBe("SKILL.md");
    expect(result.text).toBe("# Imported gate\n\nA rule.");
  });

  it("lists every other member as skipped — never opened, never executed", () => {
    const result = extractSkillFromArchive(archive());
    expect(result.skipped.sort()).toEqual(["README.md", "bin/run", "scripts/install.sh"]);
    // The shell script's contents must not appear anywhere in what we return.
    expect(JSON.stringify(result)).not.toContain("rm -rf");
  });

  it("refuses an archive with no markdown at all", () => {
    const zip = zipSync({ "scripts/install.sh": strToU8("#!/bin/sh\n") });
    expect(() => extractSkillFromArchive(zip)).toThrow(/no markdown document/);
  });

  it("refuses a member that inflates past the import budget", () => {
    // Guards the zip-bomb shape: small compressed, huge inflated.
    const zip = zipSync({ "SKILL.md": strToU8("a".repeat(70_000)) });
    expect(() => extractSkillFromArchive(zip)).toThrow(/too large/);
  });
});
