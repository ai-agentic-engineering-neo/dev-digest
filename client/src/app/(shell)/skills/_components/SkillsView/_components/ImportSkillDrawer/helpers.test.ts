import { describe, it, expect } from "vitest";
import {
  baseName,
  guessType,
  ignoredEntries,
  parseSkillMarkdown,
  pickSkillEntry,
  readZipEntries,
  readZipText,
  type ArchiveEntry,
} from "./helpers";

const entry = (name: string, over: Partial<ArchiveEntry> = {}): ArchiveEntry => ({
  name,
  size: 10,
  method: 0,
  localOffset: 0,
  ...over,
});

/** A minimal ZIP built by hand: one stored entry, so the fixture stays readable
    and the central-directory walk is what is under test. */
function zipWithStoredFile(name: string, content: string): ArrayBuffer {
  const enc = new TextEncoder();
  const nameB = enc.encode(name);
  const dataB = enc.encode(content);
  const local = 30 + nameB.length + dataB.length;
  const central = 46 + nameB.length;
  const buf = new ArrayBuffer(local + central + 22);
  const v = new DataView(buf);
  const u = new Uint8Array(buf);

  v.setUint32(0, 0x04034b50, true);
  v.setUint16(26, nameB.length, true);
  v.setUint16(28, 0, true);
  u.set(nameB, 30);
  u.set(dataB, 30 + nameB.length);

  v.setUint32(local, 0x02014b50, true);
  v.setUint16(local + 10, 0, true); // stored
  v.setUint32(local + 24, dataB.length, true);
  v.setUint16(local + 28, nameB.length, true);
  v.setUint16(local + 30, 0, true);
  v.setUint16(local + 32, 0, true);
  v.setUint32(local + 42, 0, true); // local header offset
  u.set(nameB, local + 46);

  const eocd = local + central;
  v.setUint32(eocd, 0x06054b50, true);
  v.setUint16(eocd + 10, 1, true); // entry count
  v.setUint32(eocd + 16, local, true); // central directory offset
  return buf;
}

describe("parseSkillMarkdown", () => {
  it("prefers YAML front matter for the name and description", () => {
    const parsed = parseSkillMarkdown(
      ["---", "name: pr-quality-rubric", 'description: "Check the PR against the rubric."', "---", "", "# Rubric", "", "Body."].join("\n"),
    );
    expect(parsed.name).toBe("pr-quality-rubric");
    expect(parsed.description).toBe("Check the PR against the rubric.");
  });

  it("falls back to the first heading and the first paragraph", () => {
    const parsed = parseSkillMarkdown("# Security checklist\n\nFlag any secret in the diff.\n\nMore text.");
    expect(parsed.name).toBe("Security checklist");
    expect(parsed.description).toBe("Flag any secret in the diff.");
  });

  it("keeps the body byte-for-byte, front matter included", () => {
    const text = "---\nname: a\n---\n\n# A\n\nBody.";
    expect(parseSkillMarkdown(text).body).toBe(text);
  });

  it("falls back to the file name when the markdown says nothing", () => {
    expect(parseSkillMarkdown("just text", "my-skill").name).toBe("my-skill");
  });
});

describe("pickSkillEntry / ignoredEntries", () => {
  const entries = [
    entry("skill/", { size: 0 }),
    entry("skill/scripts/"),
    entry("skill/scripts/run.sh"),
    entry("skill/SKILL.md"),
    entry("skill/docs/extra.md"),
    entry("skill/README.txt"),
  ];

  it("picks SKILL.md over any other markdown", () => {
    expect(pickSkillEntry(entries)?.name).toBe("skill/SKILL.md");
  });

  it("falls back to the shallowest markdown file", () => {
    const without = entries.filter((e) => !e.name.endsWith("SKILL.md"));
    expect(pickSkillEntry(without)?.name).toBe("skill/docs/extra.md");
  });

  it("returns nothing when the archive has no markdown", () => {
    expect(pickSkillEntry([entry("skill/run.sh"), entry("skill/bin")])).toBeUndefined();
  });

  it("lists every other file as not imported, directories excluded", () => {
    const picked = pickSkillEntry(entries);
    expect(ignoredEntries(entries, picked)).toEqual([
      "skill/scripts/run.sh",
      "skill/docs/extra.md",
      "skill/README.txt",
    ]);
  });
});

describe("readZipEntries", () => {
  it("walks the central directory and reads the one entry it is asked for", async () => {
    const buf = zipWithStoredFile("skill/SKILL.md", "# Hi\n");
    const entries = readZipEntries(buf);
    expect(entries.map((e) => e.name)).toEqual(["skill/SKILL.md"]);
    expect(await readZipText(buf, entries[0]!)).toBe("# Hi\n");
  });

  it("rejects a file that is not a zip", () => {
    expect(() => readZipEntries(new TextEncoder().encode("not a zip at all").buffer as ArrayBuffer)).toThrow(
      /not a zip/,
    );
  });
});

describe("guessType / baseName", () => {
  it("reads the type off the skill's own words", () => {
    expect(guessType("Flag any hardcoded secret or injection")).toBe("security");
    expect(guessType("Score the PR against this rubric")).toBe("rubric");
    expect(guessType("Our naming convention for modules")).toBe("convention");
    expect(guessType("Anything else at all")).toBe("custom");
  });

  it("turns a file name into a skill name", () => {
    expect(baseName("pr quality_rubric.md")).toBe("pr-quality-rubric");
  });
});
