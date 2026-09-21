import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  ExtractError,
  MAX_ARCHIVE_ENTRIES,
  MAX_TEXT_BYTES,
  deriveNameFromBody,
  extractSkillFile,
  parseFrontMatter,
  pickCoreEntry,
  slugify,
} from "./extract";

async function zipFile(entries: Record<string, string>, name = "skill.zip"): Promise<File> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) zip.file(path, content);
  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  return new File([bytes], name);
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ name: "ExtractError", code });
}

describe("parseFrontMatter", () => {
  it("strips the block and reads name/description", () => {
    const fm = parseFrontMatter('---\nname: pr-quality-rubric\ndescription: "Grades a PR"\nother: x\n---\n\n# Body\ntext');
    expect(fm).toEqual({ name: "pr-quality-rubric", description: "Grades a PR", body: "# Body\ntext" });
  });

  it("handles folded block scalars and CRLF", () => {
    const fm = parseFrontMatter("---\r\nname: a\r\ndescription: >\r\n  line one\r\n  line two\r\n---\r\nbody");
    expect(fm.description).toBe("line one line two");
    expect(fm.body).toBe("body");
  });

  it("leaves text without front-matter untouched", () => {
    expect(parseFrontMatter("# Hi\n---\nnot front matter")).toEqual({
      name: "",
      description: "",
      body: "# Hi\n---\nnot front matter",
    });
  });
});

describe("name derivation", () => {
  it("slugifies titles", () => {
    expect(slugify("PR Quality Rubric!")).toBe("pr-quality-rubric");
    expect(slugify("  --Already-kebab--  ")).toBe("already-kebab");
  });

  it("uses the first level-1 heading outside code fences", () => {
    expect(deriveNameFromBody("```\n# not me\n```\n# Real Title\n## sub")).toBe("real-title");
    expect(deriveNameFromBody("no heading here")).toBe("");
  });
});

describe("pickCoreEntry", () => {
  it("prefers SKILL.md, then README.md, then the largest", () => {
    const a = { path: "docs/notes.md", size: 900 };
    const readme = { path: "README.md", size: 10 };
    const skill = { path: "pkg/Skill.MD", size: 1 };
    expect(pickCoreEntry([a, readme, skill])).toBe(skill);
    expect(pickCoreEntry([a, readme])).toBe(readme);
    expect(pickCoreEntry([a, { path: "b.txt", size: 5 }])).toBe(a);
    expect(pickCoreEntry([])).toBeUndefined();
  });
});

describe("extractSkillFile — plain files", () => {
  it("reads a .md file and derives the name from the heading", async () => {
    const out = await extractSkillFile(new File(["# No Then Chains\n\nPrefer async/await."], "rule.md"));
    expect(out).toMatchObject({
      name: "",
      headingName: "no-then-chains",
      description: "",
      sourceFile: "rule.md",
      ignored: [],
    });
    expect(out.body).toContain("Prefer async/await.");
  });

  it("uses front-matter name/description and strips the block", async () => {
    const out = await extractSkillFile(new File(["---\nname: secret-gate\ndescription: Blocks secrets\n---\n# Body"], "x.markdown"));
    expect(out).toMatchObject({ name: "secret-gate", description: "Blocks secrets", body: "# Body" });
  });

  it("rejects unsupported extensions", async () => {
    await expectCode(extractSkillFile(new File(["echo"], "run.sh")), "unsupported_type");
    await expectCode(extractSkillFile(new File(["hi"], "notes.txt")), "unsupported_type");
  });

  it("rejects empty, binary and oversized files", async () => {
    await expectCode(extractSkillFile(new File(["---\nname: a\n---\n"], "e.md")), "empty");
    await expectCode(extractSkillFile(new File(["a\u0000b"], "b.md")), "not_text");
    await expectCode(extractSkillFile(new File(["x".repeat(MAX_TEXT_BYTES + 1)], "big.md")), "too_large");
  });
});

describe("extractSkillFile — zip archives", () => {
  it("reads SKILL.md and lists every other entry as ignored", async () => {
    const file = await zipFile({
      "my-skill/SKILL.md": "---\nname: my-skill\n---\n# My Skill\nrules",
      "my-skill/scripts/run.sh": "rm -rf /",
      "my-skill/bin/tool.exe": "MZ",
      "my-skill/notes.md": "other notes",
      "__MACOSX/my-skill/._SKILL.md": "junk",
    });
    const out = await extractSkillFile(file);
    expect(out.sourceFile).toBe("my-skill/SKILL.md");
    expect(out.name).toBe("my-skill");
    expect(out.body).toBe("# My Skill\nrules");
    expect([...out.ignored].sort()).toEqual([
      "my-skill/bin/tool.exe",
      "my-skill/notes.md",
      "my-skill/scripts/run.sh",
    ]);
  });

  it("never decompresses ignored entries", async () => {
    const file = await zipFile({ "SKILL.md": "# S\nbody", "evil.js": "alert(1)" });
    const asyncSpy: string[] = [];
    const original = JSZip.loadAsync;
    // Wrap loadAsync so we can observe which entries get read.
    (JSZip as unknown as { loadAsync: typeof JSZip.loadAsync }).loadAsync = async (data, opts) => {
      const zip = await original.call(JSZip, data, opts);
      for (const obj of Object.values(zip.files)) {
        const real = obj.async.bind(obj);
        (obj as unknown as { async: unknown }).async = (...args: unknown[]) => {
          asyncSpy.push(obj.name);
          return (real as (...a: unknown[]) => unknown)(...args);
        };
      }
      return zip;
    };
    try {
      await extractSkillFile(file);
    } finally {
      (JSZip as unknown as { loadAsync: typeof JSZip.loadAsync }).loadAsync = original;
    }
    expect(asyncSpy).toEqual(["SKILL.md"]);
  });

  it("falls back to README.md, then the largest text entry", async () => {
    const readme = await extractSkillFile(await zipFile({ "a.md": "# A\n" + "x".repeat(50), "README.md": "# Readme\nhi" }));
    expect(readme.sourceFile).toBe("README.md");
    const largest = await extractSkillFile(await zipFile({ "a.md": "# A\nshort", "b.txt": "# B\n" + "y".repeat(50) }));
    expect(largest.sourceFile).toBe("b.txt");
  });

  it("errors when the archive has no text-like entry", async () => {
    await expectCode(extractSkillFile(await zipFile({ "run.sh": "echo", "tool.exe": "MZ", ".hidden.md": "# x" })), "no_text_entry");
  });

  it("rejects archives with too many entries", async () => {
    const entries: Record<string, string> = { "SKILL.md": "# S\nbody" };
    for (let i = 0; i < MAX_ARCHIVE_ENTRIES; i++) entries[`f${i}.bin`] = "x";
    await expectCode(extractSkillFile(await zipFile(entries)), "too_many_entries");
  });

  it("rejects an oversized core entry before reading it", async () => {
    const file = await zipFile({ "SKILL.md": "# S\n" + "x".repeat(MAX_TEXT_BYTES + 10) });
    await expectCode(extractSkillFile(file), "too_large");
  });

  it("rejects a corrupt archive", async () => {
    await expectCode(extractSkillFile(new File(["not a zip"], "bad.zip")), "invalid_archive");
  });

  it("throws ExtractError instances", async () => {
    await expect(extractSkillFile(new File(["x"], "a.png"))).rejects.toBeInstanceOf(ExtractError);
  });
});
