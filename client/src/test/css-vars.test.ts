import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * An unknown CSS custom property fails silently (the declaration is dropped), and neither tsc nor RTL
 * tests notice — see client/INSIGHTS.md (2026-11-06, `--bg-elev`). This guard scans every source file
 * under src/ for custom-property references and fails if a name is not declared in a stylesheet.
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const SOURCE_EXT = /\.(css|ts|tsx)$/;

/** `--name:` declarations in .css files, plus `"--name":` keys in inline style objects. */
const CSS_DECL = /(--[A-Za-z0-9_-]+)\s*:/g;
const TS_DECL = /["'`](--[A-Za-z0-9_-]+)["'`]\s*:/g;
/** A complete reference: name followed by `)` or a `,` fallback. */
const VAR_REF = /var\(\s*(--[A-Za-z0-9_-]*[A-Za-z0-9_])\s*[,)]/g;
/** A reference whose name is built in a template literal: `var(--viz-${n})`. */
const VAR_PREFIX = /var\(\s*(--[A-Za-z0-9_-]+)\$\{/g;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return SOURCE_EXT.test(e.name) && full !== SELF ? [full] : [];
  });
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

const files = walk(SRC).map((file) => ({
  rel: path.relative(SRC, file).split(path.sep).join("/"),
  isCss: file.endsWith(".css"),
  text: readFileSync(file, "utf8"),
}));

const defined = new Set<string>();
for (const f of files) {
  for (const m of f.text.matchAll(f.isCss ? CSS_DECL : TS_DECL)) defined.add(m[1] ?? "");
}

describe("CSS custom properties", () => {
  it("finds the design-system token declarations", () => {
    // Guards the scanner itself: if styles.css moved, every reference would look undefined.
    expect(defined.has("--text-primary")).toBe(true);
    expect(defined.has("--bg-elevated")).toBe(true);
    expect(defined.has("--viz-1")).toBe(true);
  });

  it("every var(--name) used under src/ is declared", () => {
    const unknown: string[] = [];
    for (const f of files) {
      for (const m of f.text.matchAll(VAR_REF)) {
        const name = m[1] ?? "";
        if (!defined.has(name)) unknown.push(`${f.rel}:${lineOf(f.text, m.index ?? 0)} ${name}`);
      }
      for (const m of f.text.matchAll(VAR_PREFIX)) {
        const prefix = m[1] ?? "";
        if (![...defined].some((d) => d.startsWith(prefix))) {
          unknown.push(`${f.rel}:${lineOf(f.text, m.index ?? 0)} ${prefix}\${…} (no token with this prefix)`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });
});
