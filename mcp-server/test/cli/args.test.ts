import { describe, expect, it } from 'vitest';
import { parseArgs, HELP_TEXT } from '../../src/cli/args.js';
import { CliError, EXIT } from '../../src/cli/exit.js';

describe('parseArgs', () => {
  it('--help / -h sets help:true regardless of position', () => {
    expect(parseArgs(['--help']).help).toBe(true);
    expect(parseArgs(['-h']).help).toBe(true);
    expect(parseArgs(['--mode', 'working', '--help']).help).toBe(true);
  });

  it('leaves mode/agent undefined when omitted — validation is run.ts\'s job, not this parser\'s', () => {
    const parsed = parseArgs([]);
    expect(parsed.help).toBe(false);
    expect(parsed.mode).toBeUndefined();
    expect(parsed.agent).toBeUndefined();
  });

  it('parses --mode and --agent in space-separated form', () => {
    const parsed = parseArgs(['--mode', 'working', '--agent', 'agent-1']);
    expect(parsed).toEqual({ help: false, mode: 'working', agent: 'agent-1' });
  });

  it('parses --mode=value and --agent=value form', () => {
    const parsed = parseArgs(['--mode=working', '--agent=agent-1']);
    expect(parsed).toEqual({ help: false, mode: 'working', agent: 'agent-1' });
  });

  it('accepts flag-after-flag in either order', () => {
    expect(parseArgs(['--agent', 'agent-1', '--mode', 'working'])).toEqual({
      help: false,
      mode: 'working',
      agent: 'agent-1',
    });
  });

  it('passes each --mode value through untouched (working/staged/branch/unknown) — this parser does not validate the value', () => {
    for (const mode of ['working', 'staged', 'branch', 'not-a-real-mode']) {
      expect(parseArgs(['--mode', mode]).mode).toBe(mode);
    }
  });

  it('throws CliError(EXIT.USAGE) on an unrecognized flag', () => {
    try {
      parseArgs(['--nope', 'x']);
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(CliError);
      expect((err as CliError).code).toBe(EXIT.USAGE);
      expect((err as CliError).message).toContain("Unknown flag '--nope'");
    }
  });

  it('throws CliError(EXIT.USAGE) when a flag is missing its value', () => {
    expect(() => parseArgs(['--mode'])).toThrow(CliError);
    try {
      parseArgs(['--agent']);
    } catch (err) {
      expect((err as CliError).code).toBe(EXIT.USAGE);
    }
  });
});

describe('HELP_TEXT', () => {
  it('documents the usage line, all three exit-code buckets, and the untracked-files note', () => {
    expect(HELP_TEXT).toContain('devdigest review --mode working --agent <id|name>');
    expect(HELP_TEXT).toContain('UNTRACKED FILES ARE NOT REVIEWED');
    expect(HELP_TEXT).toContain('EXIT CODES');
    expect(HELP_TEXT).toContain('0  Review ran, no blocking findings');
    expect(HELP_TEXT).toContain('1  Review ran, at least one BLOCKING finding');
    expect(HELP_TEXT).toContain('2  Usage error');
    expect(HELP_TEXT).toContain('3  Environment error');
    expect(HELP_TEXT).toContain('4  The review could not run');
    expect(HELP_TEXT).toContain('DEVDIGEST_API_BASE_URL');
  });
});
