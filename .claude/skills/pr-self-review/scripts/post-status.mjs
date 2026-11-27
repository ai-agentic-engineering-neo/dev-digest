#!/usr/bin/env node
// Step 14 — post the `devdigest/self-review` commit status for a pushed commit.
//   node post-status.mjs [--sha <ref>] [--dry-run]
import { repoRoot } from './lib/git.mjs';
import { postStatus } from './lib/status.mjs';

const i = process.argv.indexOf('--sha');
const ref = i === -1 ? 'HEAD' : process.argv[i + 1];
const r = await postStatus(repoRoot(), ref, { dryRun: process.argv.includes('--dry-run') });
console.log(`${r.ok ? '✓' : '✗'} ${r.message}`);
