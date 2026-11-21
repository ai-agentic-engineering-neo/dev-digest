/**
 * TypeScript-compatible module resolver (`ts.resolveModuleName`).
 *
 * Security/containment model: the compiler only ever sees a host backed by the
 * walked file set — no `node_modules`, no real filesystem, no Program, no
 * type-check. tsconfig files are DATA: parsed with `ts.readConfigFile` /
 * `ts.parseJsonConfigFileContent` (never executed), and `extends` chains are
 * read through the same contained host, so an `extends` that points outside
 * the clone (or at an npm package) simply fails to read and is recorded.
 */
import { builtinModules } from 'node:module';
import { posix } from 'node:path';
import ts from 'typescript';
import type {
  ModuleResolution,
  ModuleResolver,
  ModuleResolverInput,
  ModuleResolverInstance,
  ModuleResolverTsconfigFailure,
} from '../../domain/ports/module-resolver.js';

const BUILTINS = new Set(builtinModules.map((m) => m.replace(/^node:/, '')));
/** TS18003 "No inputs were found in config file" — we never list directories. */
const IGNORED_DIAGNOSTICS = new Set([18003]);
const TSCONFIG = 'tsconfig.json';

function isBuiltin(spec: string): boolean {
  if (spec.startsWith('node:')) return true;
  const bare = spec.split('/')[0] ?? spec;
  return BUILTINS.has(spec) || BUILTINS.has(bare);
}

/** Extensions the indexer resolves as code; any other explicit extension is an asset. */
const CODE_EXT = /\.(?:[cm]?[jt]sx?|json)$/i;

function isNonCodeAsset(spec: string): boolean {
  const last = spec.split(/[?#]/)[0]!.split('/').pop() ?? '';
  return /\.[A-Za-z0-9]+$/.test(last) && !CODE_EXT.test(last);
}

function isAbsoluteLike(spec: string): boolean {
  return spec.startsWith('/') || spec.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(spec);
}

function patternMatches(pattern: string, spec: string): boolean {
  const star = pattern.indexOf('*');
  if (star < 0) return pattern === spec;
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  return spec.length >= prefix.length + suffix.length && spec.startsWith(prefix) && spec.endsWith(suffix);
}

class TsModuleResolver implements ModuleResolverInstance {
  private readonly root: string;
  private readonly files: ReadonlySet<string>;
  private readonly dirs = new Set<string>(['']);
  private readonly readText: (rel: string) => string | null;
  private readonly host: ts.ModuleResolutionHost;
  private readonly configCache = new Map<string, ts.CompilerOptions>();
  private readonly failures = new Map<string, ModuleResolverTsconfigFailure>();
  private readonly defaults: ts.CompilerOptions = {
    moduleResolution: ts.ModuleResolutionKind.Node10,
    allowJs: true,
    resolveJsonModule: true,
  };

  constructor(input: ModuleResolverInput) {
    this.root = posix.normalize(input.root).replace(/\/+$/, '');
    this.files = input.files;
    this.readText = input.readText;
    for (const f of input.files) {
      let d = posix.dirname(f);
      while (d !== '.' && !this.dirs.has(d)) {
        this.dirs.add(d);
        d = posix.dirname(d);
      }
    }
    this.host = {
      fileExists: (p) => {
        const rel = this.toRel(p);
        return rel !== null && this.files.has(rel);
      },
      readFile: (p) => {
        const rel = this.toRel(p);
        if (rel === null || !this.files.has(rel)) return undefined;
        return this.readText(rel) ?? undefined;
      },
      directoryExists: (p) => {
        const rel = this.toRel(p);
        return rel !== null && this.dirs.has(rel);
      },
      realpath: (p) => p, // never follow symlinks
      getCurrentDirectory: () => this.root,
      getDirectories: () => [],
      useCaseSensitiveFileNames: true,
    };
  }

  /** Absolute → repo-relative, or `null` when outside the clone. */
  private toRel(abs: string): string | null {
    // TS passes directory candidates with a trailing slash (`import '.'` →
    // `<dir>/`); normalize keeps it, so strip it or the dir lookup misses.
    const n = posix.normalize(abs).replace(/(?<=.)\/+$/, '');
    if (n === this.root) return '';
    if (!n.startsWith(this.root + '/')) return null;
    return n.slice(this.root.length + 1);
  }

  private abs(rel: string): string {
    return posix.join(this.root, rel);
  }

  tsconfigFailures(): ModuleResolverTsconfigFailure[] {
    return [...this.failures.values()];
  }

  private nearestTsconfig(fromFile: string): string | null {
    let dir = posix.dirname(fromFile);
    for (;;) {
      const cand = dir === '.' ? TSCONFIG : `${dir}/${TSCONFIG}`;
      if (this.files.has(cand)) return cand;
      if (dir === '.' || dir === '') return null;
      dir = posix.dirname(dir);
    }
  }

  private optionsFor(tsconfigRel: string | null): ts.CompilerOptions {
    if (tsconfigRel === null) return this.defaults;
    const hit = this.configCache.get(tsconfigRel);
    if (hit) return hit;
    const opts = this.loadConfig(tsconfigRel);
    this.configCache.set(tsconfigRel, opts);
    return opts;
  }

  private fail(path: string, message: string): ts.CompilerOptions {
    this.failures.set(path, { path, message });
    return this.defaults;
  }

  private loadConfig(rel: string): ts.CompilerOptions {
    try {
      const absPath = this.abs(rel);
      const read = ts.readConfigFile(absPath, (p) => this.host.readFile?.(p));
      if (read.error) return this.fail(rel, ts.flattenDiagnosticMessageText(read.error.messageText, '\n'));
      const parseHost: ts.ParseConfigHost = {
        useCaseSensitiveFileNames: true,
        readDirectory: () => [],
        fileExists: (p) => this.host.fileExists(p),
        readFile: (p) => this.host.readFile?.(p),
      };
      const parsed = ts.parseJsonConfigFileContent(read.config, parseHost, posix.dirname(absPath), undefined, absPath);
      const errors = parsed.errors.filter((e) => !IGNORED_DIAGNOSTICS.has(e.code));
      if (errors.length > 0) {
        return this.fail(rel, errors.map((e) => ts.flattenDiagnosticMessageText(e.messageText, '\n')).join('; '));
      }
      return {
        ...this.defaults,
        ...parsed.options,
        // Never let a config opt out of the contained host.
        rootDirs: undefined,
        typeRoots: undefined,
      };
    } catch (err) {
      return this.fail(rel, err instanceof Error ? err.message : String(err));
    }
  }

  resolve(fromFile: string, specifier: string): ModuleResolution {
    try {
      if (
        specifier.includes('\0') ||
        fromFile.includes('\0') ||
        isAbsoluteLike(specifier) ||
        isAbsoluteLike(fromFile) ||
        !this.files.has(fromFile)
      ) {
        return { kind: 'unresolved', reason: 'outside_clone' };
      }
      if (isBuiltin(specifier)) return { kind: 'builtin' };

      const relative = specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../');
      if (relative) {
        const target = posix.normalize(posix.join(posix.dirname(fromFile), specifier));
        if (target === '..' || target.startsWith('../')) return { kind: 'unresolved', reason: 'outside_clone' };
      }

      const options = this.optionsFor(this.nearestTsconfig(fromFile));
      const { resolvedModule } = ts.resolveModuleName(specifier, this.abs(fromFile), options, this.host);
      if (resolvedModule) {
        if (resolvedModule.isExternalLibraryImport) return { kind: 'external' };
        const rel = this.toRel(resolvedModule.resolvedFileName);
        if (rel === null) return { kind: 'unresolved', reason: 'outside_clone' };
        if (this.files.has(rel)) return { kind: 'file', path: rel };
        return { kind: 'unresolved', reason: 'missing' };
      }
      // `import './logo.svg'` / `'./index.css'`: assets are never walked, so a
      // miss here is by design, not a coverage gap — keep them out of the
      // unresolved count the same way npm packages are.
      if (relative && isNonCodeAsset(specifier)) return { kind: 'external' };
      if (relative) return { kind: 'unresolved', reason: 'missing' };
      // Bare specifier with no match: a configured alias that points nowhere is
      // `missing`; everything else is an npm package we deliberately don't walk.
      const paths = options.paths;
      if (paths && Object.keys(paths).some((p) => patternMatches(p, specifier))) {
        return { kind: 'unresolved', reason: 'missing' };
      }
      return { kind: 'external' };
    } catch {
      return { kind: 'unresolved', reason: 'tsconfig' };
    }
  }
}

export class TsModuleResolverFactory implements ModuleResolver {
  create(input: ModuleResolverInput): ModuleResolverInstance {
    return new TsModuleResolver(input);
  }
}
