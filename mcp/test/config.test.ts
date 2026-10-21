import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('uses defaults', () => {
    expect(loadConfig({})).toEqual({ apiUrl: 'http://localhost:3001', maxWaitMs: 300_000, pollMs: 3_000 });
  });
  it('strips trailing slashes from DEVDIGEST_API_URL', () => {
    expect(loadConfig({ DEVDIGEST_API_URL: 'http://h:1///' }).apiUrl).toBe('http://h:1');
  });
  it('rejects a file:// URL and a malformed URL', () => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'file:///etc/passwd' })).toThrow(/http or https/);
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'not a url' })).toThrow(/valid URL/);
  });
  it('clamps max wait to 10s..600s', () => {
    expect(loadConfig({ DEVDIGEST_MCP_MAX_WAIT_MS: '5' }).maxWaitMs).toBe(10_000);
    expect(loadConfig({ DEVDIGEST_MCP_MAX_WAIT_MS: '99999999' }).maxWaitMs).toBe(600_000);
    expect(loadConfig({ DEVDIGEST_MCP_MAX_WAIT_MS: '45000' }).maxWaitMs).toBe(45_000);
  });
  it('clamps the poll interval to at least 1s', () => {
    expect(loadConfig({ DEVDIGEST_MCP_POLL_MS: '10' }).pollMs).toBe(1_000);
    expect(loadConfig({ DEVDIGEST_MCP_POLL_MS: '5000' }).pollMs).toBe(5_000);
  });
  it('throws on non-numeric or negative values', () => {
    expect(() => loadConfig({ DEVDIGEST_MCP_POLL_MS: 'abc' })).toThrow(/positive integer/);
    expect(() => loadConfig({ DEVDIGEST_MCP_POLL_MS: '-5' })).toThrow(/positive integer/);
    expect(() => loadConfig({ DEVDIGEST_MCP_MAX_WAIT_MS: 'x' })).toThrow(/positive integer/);
    expect(() => loadConfig({ DEVDIGEST_MCP_MAX_WAIT_MS: '-1' })).toThrow(/positive integer/);
  });
});
