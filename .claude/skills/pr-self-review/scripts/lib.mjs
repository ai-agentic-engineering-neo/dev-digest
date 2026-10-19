// Shared helpers for the pr-self-review scripts. Node >= 22, no dependencies.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SEVERITIES = ["critical", "major", "minor", "nit", "info"];

export function git(args, opts = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
}

/** git that tolerates non-zero exit (diff --no-index exits 1 when files differ). */
export function gitLoose(args, opts = {}) {
  const r = spawnSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...opts });
  return r.stdout ?? "";
}

export function repoRoot(cwd = process.cwd()) {
  return git(["rev-parse", "--show-toplevel"], { cwd }).trim();
}

/** Lives inside .git (works for worktrees too) so verdicts and cache are never committed. */
export function stateDir(root) {
  const rel = git(["rev-parse", "--git-path", "devdigest-self-review"], { cwd: root }).trim();
  const dir = resolve(root, rel);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function refExists(root, ref) {
  return spawnSync("git", ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], { cwd: root }).status === 0;
}

/** Default target: origin/main, else main. Returns { base, mergeBase }. */
export function resolveBase(root, requested) {
  const candidates = requested
    ? [requested, `origin/${requested}`]
    : ["origin/main", "main"];
  const base = candidates.find((ref) => refExists(root, ref));
  if (!base) throw new Error(`Base branch not found (tried ${candidates.join(", ")}). Pass --base <branch>.`);
  const mergeBase = git(["merge-base", base, "HEAD"], { cwd: root }).trim();
  return { base, mergeBase };
}

const splitZ = (s) => s.split("\0").filter(Boolean);

/**
 * Every local change relative to the merge-base: committed-but-unmerged,
 * staged, unstaged and untracked (respecting .gitignore). Renames are split
 * into delete + add so the fingerprint does not depend on rename detection.
 */
export function changedFiles(root, mergeBase) {
  const files = new Map();
  const tokens = splitZ(git(["diff", "--name-status", "-z", "--no-renames", mergeBase], { cwd: root }));
  for (let i = 0; i < tokens.length; i += 2) {
    const status = tokens[i];
    const path = tokens[i + 1];
    if (path) files.set(path, { path, status: status[0], untracked: false });
  }
  for (const path of splitZ(git(["ls-files", "--others", "--exclude-standard", "-z"], { cwd: root }))) {
    files.set(path, { path, status: "A", untracked: true });
  }
  return [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

export function readFileOrNull(root, path) {
  const abs = join(root, path);
  return existsSync(abs) ? readFileSync(abs) : null;
}

/**
 * Identity of "what is being reviewed": merge-base + (path, content) of every
 * changed file. Committing reviewed changes keeps the fingerprint; editing any
 * changed file, or changing the base, produces a new one.
 */
export function fingerprint(root, mergeBase, files) {
  const h = createHash("sha256");
  h.update(`base:${mergeBase}\n`);
  for (const f of files) {
    const content = f.status === "D" ? null : readFileOrNull(root, f.path);
    h.update(`${f.path}\0${content === null ? "deleted" : sha256(content)}\n`);
  }
  return h.digest("hex").slice(0, 16);
}

/** Unified diff of one file against the merge-base (untracked files diffed against /dev/null). */
export function fileDiff(root, mergeBase, file, context = 3) {
  if (file.untracked) {
    return gitLoose(["diff", "--no-index", `-U${context}`, "--", "/dev/null", file.path], { cwd: root });
  }
  return git(["diff", "--no-renames", `-U${context}`, mergeBase, "--", file.path], { cwd: root });
}

/** Parses a unified diff into added line numbers (new side) and removed line texts. */
export function parseDiff(diffText) {
  const added = [];
  const addedText = [];
  const removedText = [];
  let newLine = 0;
  let inHunk = false;
  for (const line of diffText.split("\n")) {
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (m) {
      newLine = Number(m[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk || line.startsWith("\\")) continue;
    if (line.startsWith("+")) {
      added.push(newLine);
      addedText.push(line.slice(1));
      newLine++;
    } else if (line.startsWith("-")) {
      removedText.push(line.slice(1));
    } else {
      newLine++;
    }
  }
  return { added, addedText, removedText };
}

/** Compresses sorted line numbers into "3-7,12" style ranges for prompts. */
export function toRanges(lines) {
  const out = [];
  for (const n of lines) {
    const last = out[out.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else out.push([n, n]);
  }
  return out.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(",");
}

/** Minimal glob: **, *, ?, {a,b}. Paths are repo-relative with forward slashes. */
export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        const slash = glob[i + 2] === "/";
        re += slash ? "(?:.*/)?" : ".*";
        i += slash ? 2 : 1;
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const end = glob.indexOf("}", i);
      re += `(?:${glob.slice(i + 1, end).split(",").map(escapeRe).join("|")})`;
      i = end;
    } else re += escapeRe(c);
  }
  return new RegExp(`^${re}$`);
}
const escapeRe = (s) => s.replace(/[.+^$()|[\]\\]/g, "\\$&");

const globCache = new Map();
export function matchesAny(path, globs = []) {
  return globs.some((g) => {
    if (!globCache.has(g)) globCache.set(g, globToRegExp(g));
    return globCache.get(g).test(path);
  });
}

export function readJson(path, fallback) {
  if (!existsSync(path)) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing file: ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      args._.push(a);
      continue;
    }
    const [key, inline] = a.slice(2).split(/=(.*)/s);
    const next = argv[i + 1];
    const value = inline ?? (next !== undefined && !next.startsWith("--") ? (i++, next) : true);
    if (key in args) args[key] = [].concat(args[key], value);
    else args[key] = value;
  }
  return args;
}

/** Stable short id so waivers and verifications can reference a finding across runs. */
export function findingId(f) {
  return sha256(`${f.source}|${f.file}|${f.rule}|${normalize(f.evidence ?? "")}`).slice(0, 8);
}

export const normalize = (s) => s.replace(/\s+/g, " ").trim();

export function verdictPath(state, fp) {
  return join(state, "verdicts", `${fp}.json`);
}
