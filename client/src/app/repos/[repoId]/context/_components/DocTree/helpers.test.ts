import { describe, expect, it } from "vitest";
import type { ContextDoc } from "@/lib/types";
import { buildDocTree, docArea, flattenSection, folderOf } from "./helpers";

const doc = (path: string, source: ContextDoc["source"]): ContextDoc => ({
  path,
  source,
  tokens: 10,
  attached_agents: 0,
});

const DOCS: ContextDoc[] = [
  doc("README.md", "readme"),
  doc("docs/a.md", "docs"),
  doc("server/specs/auth/a.md", "specs"),
  doc(".devdigest/specs/notes/n.md", "devdigest"),
];

describe("buildDocTree", () => {
  it("orders sections, drops empty ones, nests folders and honours the filter", () => {
    const tree = buildDocTree(DOCS, [], "");
    expect(tree.map((x) => x.key)).toEqual(["devdigest", "specs", "docs", "readme"]);

    const specs = tree.find((x) => x.key === "specs");
    expect(specs?.root.folders[0]?.name).toBe("server");
    expect(specs?.root.folders[0]?.folders[0]?.name).toBe("specs");
    expect(specs?.root.folders[0]?.folders[0]?.folders[0]?.path).toBe("server/specs/auth");

    const dd = tree.find((x) => x.key === "devdigest");
    expect(dd?.root.folders[0]?.path).toBe("notes");

    const filtered = buildDocTree(DOCS, ["drafts"], "auth");
    expect(filtered.map((x) => x.key)).toEqual(["specs"]);
  });

  it("orders all five sources devdigest, specs, docs, insights, readme", () => {
    const all = [
      doc("README.md", "readme"),
      doc("server/INSIGHTS.md", "insights"),
      doc("docs/a.md", "docs"),
      doc("server/specs/a.md", "specs"),
      doc(".devdigest/specs/n.md", "devdigest"),
    ];
    expect(buildDocTree(all, [], "").map((x) => x.key)).toEqual([
      "devdigest",
      "specs",
      "docs",
      "insights",
      "readme",
    ]);
  });

  it("shows extra folders in the devdigest section even without docs", () => {
    const tree = buildDocTree([], ["drafts"], "");
    expect(tree).toHaveLength(1);
    expect(tree[0]?.key).toBe("devdigest");
    expect(tree[0]?.root.folders.map((f) => f.path)).toEqual(["drafts"]);
  });
});

describe("flattenSection / folderOf / docArea", () => {
  it("flattens a section to docs in path byte order; folders only for devdigest", () => {
    const docs = [
      doc("server/specs/b.md", "specs"),
      doc("client/specs/z.md", "specs"),
      doc("server/specs/auth/a.md", "specs"),
      doc(".devdigest/specs/x/y.md", "devdigest"),
      doc(".devdigest/specs/top.md", "devdigest"),
    ];
    const [dd, specs] = buildDocTree(docs, ["drafts"], "").map(flattenSection);
    expect(specs?.docs.map((d) => d.path)).toEqual([
      "client/specs/z.md",
      "server/specs/auth/a.md",
      "server/specs/b.md",
    ]);
    expect(specs?.folders).toEqual([]);
    expect(dd?.docs.map((d) => d.path)).toEqual([".devdigest/specs/top.md", ".devdigest/specs/x/y.md"]);
    expect(dd?.folders).toEqual(["drafts", "x"]);
  });

  it("derives the folder line and the area chip", () => {
    expect(folderOf("server/specs/a.md")).toBe("server/specs/");
    expect(folderOf("README.md")).toBe("");
    expect(docArea(doc("reviewer-core/README.md", "readme"))).toEqual({ kind: "folder", name: "reviewer-core" });
    expect(docArea(doc("TESTING.md", "readme"))).toEqual({ kind: "root" });
    expect(docArea(doc(".devdigest/specs/auth/a.md", "devdigest"))).toEqual({ kind: "folder", name: "auth" });
    expect(docArea(doc(".devdigest/specs/a.md", "devdigest"))).toBeNull();
  });
});
