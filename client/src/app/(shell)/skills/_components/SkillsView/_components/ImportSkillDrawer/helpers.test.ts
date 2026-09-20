import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
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
  compressedSize: 10,
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

/**
 * A ZIP with SEVERAL deflated entries — the shape that caught a real bug: an
 * entry's compressed bytes are followed by the next entry and the central
 * directory, and a decompressor handed any of that fails. A single-entry
 * fixture cannot catch it.
 */
function zipWithDeflatedFiles(files: Array<{ name: string; content: string }>): ArrayBuffer {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameB = enc.encode(f.name);
    const dataB = enc.encode(f.content);
    const comp = new Uint8Array(deflateRawSync(dataB));

    const local = new Uint8Array(30 + nameB.length + comp.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, 8, true); // deflate
    lv.setUint32(18, comp.length, true);
    lv.setUint32(22, dataB.length, true);
    lv.setUint16(26, nameB.length, true);
    local.set(nameB, 30);
    local.set(comp, 30 + nameB.length);
    parts.push(local);

    const cd = new Uint8Array(46 + nameB.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 8, true);
    cv.setUint32(20, comp.length, true);
    cv.setUint32(24, dataB.length, true);
    cv.setUint16(28, nameB.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameB, 46);
    central.push(cd);

    offset += local.length;
  }

  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const all = [...parts, ...central, eocd];
  const out = new Uint8Array(all.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of all) {
    out.set(a, at);
    at += a.length;
  }
  return out.buffer;
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

  it("reads a deflated entry that other entries follow", async () => {
    const buf = zipWithDeflatedFiles([
      { name: "skill/SKILL.md", content: "# Rubric\n\nEvery branch gets a test.\n" },
      { name: "skill/scripts/run.sh", content: "#!/bin/sh\necho nope\n" },
    ]);
    const entries = readZipEntries(buf);
    expect(entries.map((e) => e.name)).toEqual(["skill/SKILL.md", "skill/scripts/run.sh"]);

    // The bug this pins: compressedSize was never read, so the decompressor got
    // everything to EOF. Node's tolerates the trailing junk, the browser's does
    // not — so assert the boundary itself, not just that the text decodes.
    const picked = pickSkillEntry(entries)!;
    expect(picked.compressedSize).toBe(deflateRawSync(Buffer.from("# Rubric\n\nEvery branch gets a test.\n")).length);
    expect(picked.compressedSize).toBeLessThan(buf.byteLength - picked.localOffset - 30 - picked.name.length);

    expect(await readZipText(buf, picked)).toBe("# Rubric\n\nEvery branch gets a test.\n");
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
