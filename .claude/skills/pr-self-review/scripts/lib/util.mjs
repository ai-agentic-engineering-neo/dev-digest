// Shared helpers: hashing, JSON IO and the on-disk layout of the self-review state.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SEVERITIES = ['CRITICAL', 'WARNING', 'SUGGESTION'];
export const severityRank = (s) => SEVERITIES.length - SEVERITIES.indexOf(s); // CRITICAL highest

export function sha256(...parts) {
  const h = createHash('sha256');
  for (const p of parts) {
    h.update(p ?? '');
    h.update('\0');
  }
  return h.digest('hex');
}

export function sha256File(abs) {
  try {
    const st = fs.lstatSync(abs);
    if (st.isSymbolicLink()) return sha256('symlink', fs.readlinkSync(abs));
    if (!st.isFile()) return sha256('not-a-file');
    return createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  } catch {
    return sha256('missing');
  }
}

export function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    if (fallback !== undefined && e.code === 'ENOENT') return fallback;
    throw new Error(`cannot read JSON ${p}: ${e.message}`);
  }
}

export function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

/** Everything the skill keeps on disk, relative to the repo root. */
export function statePaths(root) {
  const base = path.join(root, '.devdigest', 'self-review');
  const run = path.join(base, 'run');
  return {
    base,
    run,
    manifest: path.join(run, 'manifest.json'),
    plan: path.join(run, 'plan.json'),
    checksStatic: path.join(run, 'checks-static.json'),
    checksBuild: path.join(run, 'checks-build.json'),
    findingsDir: path.join(run, 'findings'),
    verifyDir: path.join(run, 'verify'),
    grounded: path.join(run, 'grounded.json'),
    cache: path.join(base, 'cache'),
    results: path.join(base, 'results'),
    latest: path.join(base, 'latest.json'),
    // Suppressions are committed on purpose — they are a reviewed team decision.
    ignore: path.join(root, '.devdigest', 'self-review-ignore.json'),
  };
}

export const rel = (root, abs) => path.relative(root, abs) || '.';

export function isProbablyBinary(abs) {
  try {
    const fd = fs.openSync(abs, 'r');
    const buf = Buffer.alloc(8192);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    return buf.subarray(0, n).includes(0);
  } catch {
    return false;
  }
}

export function readLines(abs) {
  try {
    return fs.readFileSync(abs, 'utf8').split('\n');
  } catch {
    return null;
  }
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}
