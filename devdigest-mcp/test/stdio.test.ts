// Smoke test of the REAL entry point over stdio. Guards the protocol invariant:
// stdout carries only JSON-RPC frames; logs go to stderr.
//
// Spawn choice: `node --import tsx src/index.ts` with cwd = package root.
//  - tsx resolves tsconfig.json (the @devdigest/shared alias) from the cwd, so cwd matters;
//  - no `npm run` wrapper, so no npm banner can reach stdout and no extra process is left
//    behind when we kill the child; process.execPath avoids PATH differences in CI.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_TOOLS = ['get_blast_radius', 'get_conventions', 'get_findings', 'list_agents', 'run_agent_on_pr'];

let child: ChildProcessWithoutNullStreams | undefined;
afterEach(() => {
  child?.kill('SIGKILL');
  child = undefined;
});

describe('stdio entry point', () => {
  it('answers initialize + tools/list and writes nothing but JSON-RPC to stdout', async () => {
    child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      cwd: PKG_ROOT,
      // Port 9 (discard) is closed: the startup health probe fails fast, hermetically.
      env: { ...process.env, DEVDIGEST_API_URL: 'http://127.0.0.1:9' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const proc = child;

    let stdout = '';
    let stderr = '';
    proc.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
    proc.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
    const exited = new Promise<void>((resolve) => proc.once('exit', () => resolve()));

    const send = (msg: unknown): void => void proc.stdin.write(JSON.stringify(msg) + '\n');
    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'smoke', version: '0.0.0' } },
    });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });

    const deadline = Date.now() + 20_000;
    const complete = (): boolean => /"id":2\b/.test(stdout) && stdout.endsWith('\n');
    while (!complete() && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    proc.stdin.end();
    await Promise.race([exited, new Promise((r) => setTimeout(r, 2_000))]);

    const lines = stdout.split('\n').filter((l) => l.length > 0);
    expect(lines.length, `stdout: ${stdout}\nstderr: ${stderr}`).toBeGreaterThanOrEqual(2);
    const frames = lines.map((line) => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(line) as Record<string, unknown>;
      } catch {
        throw new Error(`non-JSON line on stdout: ${JSON.stringify(line)}`);
      }
      expect(parsed.jsonrpc, line).toBe('2.0');
      expect('id' in parsed || typeof parsed.method === 'string', line).toBe(true);
      return parsed;
    });

    const init = frames.find((f) => f.id === 1) as { result?: { serverInfo?: { name?: string } } } | undefined;
    expect(init?.result?.serverInfo?.name).toBe('devdigest');
    const list = frames.find((f) => f.id === 2) as { result?: { tools?: { name: string }[] } } | undefined;
    expect(list?.result?.tools?.map((t) => t.name).sort()).toEqual(EXPECTED_TOOLS);

    // Logs exist, but only on stderr.
    expect(stderr).toContain('[devdigest-mcp]');
  }, 30_000);
});
