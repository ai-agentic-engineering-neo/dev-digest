import { describe, expect, it, vi } from 'vitest';
import { NegativeCache, SingleFlight } from '../src/modules/intent/single-flight.js';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('SingleFlight', () => {
  it('shares one promise between concurrent callers of the same key', async () => {
    const sf = new SingleFlight<string>();
    const d = deferred<string>();
    const fn = vi.fn(() => d.promise);
    const a = sf.run('k', fn);
    const b = sf.run('k', fn);
    const c = sf.run('k', fn);
    expect([a.joined, b.joined, c.joined]).toEqual([false, true, true]);
    expect(sf.size).toBe(1);
    d.resolve('v');
    await expect(Promise.all([a.promise, b.promise, c.promise])).resolves.toEqual(['v', 'v', 'v']);
    expect(fn).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(sf.size).toBe(0);
  });

  it('delivers a rejection to the leader and all joiners', async () => {
    const sf = new SingleFlight<string>();
    const d = deferred<string>();
    const a = sf.run('k', () => d.promise);
    const b = sf.run('k', () => d.promise);
    const c = sf.run('k', () => d.promise);
    d.reject(new Error('down'));
    await expect(a.promise).rejects.toThrow('down');
    await expect(b.promise).rejects.toThrow('down');
    await expect(c.promise).rejects.toThrow('down');
    await Promise.resolve();
    expect(sf.size).toBe(0);
  });

  it('starts a new fn once the previous flight settled', async () => {
    const sf = new SingleFlight<number>();
    const fn = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const a = sf.run('k', fn);
    await a.promise;
    await Promise.resolve();
    const b = sf.run('k', fn);
    expect(b.joined).toBe(false);
    await expect(b.promise).resolves.toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('never shares between different keys', async () => {
    const sf = new SingleFlight<string>();
    const fn = vi.fn(async () => 'x');
    const a = sf.run('a', fn);
    const b = sf.run('b', fn);
    expect(a.joined).toBe(false);
    expect(b.joined).toBe(false);
    await Promise.all([a.promise, b.promise]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['resolves', false],
    ['rejects', true],
  ])('runAfter starts only after the pending flight %s', async (_n, rejects) => {
    const sf = new SingleFlight<string>();
    const d = deferred<string>();
    const first = sf.run('k', () => d.promise);
    first.promise.catch(() => undefined);
    const fn2 = deferred<string>();
    const second = vi.fn(() => fn2.promise);
    const after = sf.runAfter('k', second);
    await Promise.resolve();
    expect(second).not.toHaveBeenCalled();
    if (rejects) d.reject(new Error('x'));
    else d.resolve('x');
    await vi.waitFor(() => expect(second).toHaveBeenCalledTimes(1));
    // a run() made while runAfter's fn is pending joins it
    const joiner = sf.run('k', async () => 'other');
    expect(joiner.joined).toBe(true);
    fn2.resolve('forced');
    await expect(after).resolves.toBe('forced');
    await expect(joiner.promise).resolves.toBe('forced');
  });
});

describe('NegativeCache', () => {
  const match = { headSha: 'h1', inputHash: 'i1' };
  const make = () => {
    let t = 0;
    const cache = new NegativeCache(60_000, () => t);
    return { cache, advance: (ms: number) => (t += ms) };
  };

  it('hits with the same head and hash, reporting the remaining time', () => {
    const { cache, advance } = make();
    cache.set('p', { ...match, reason: 'boom' });
    advance(5_000);
    expect(cache.get('p', match)).toEqual({ reason: 'boom', retryInMs: 55_000 });
  });

  it('misses on a different headSha or inputHash', () => {
    const { cache } = make();
    cache.set('p', { ...match, reason: 'boom' });
    expect(cache.get('p', { ...match, headSha: 'h2' })).toBeUndefined();
    expect(cache.get('p', { ...match, inputHash: 'i2' })).toBeUndefined();
  });

  it('expires at the ttl and deletes the entry on read', () => {
    const { cache, advance } = make();
    cache.set('p', { ...match, reason: 'boom' });
    advance(60_000);
    expect(cache.get('p', match)).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('delete removes the entry', () => {
    const { cache } = make();
    cache.set('p', { ...match, reason: 'boom' });
    cache.delete('p');
    expect(cache.get('p', match)).toBeUndefined();
  });

  it('set sweeps other expired keys', () => {
    const { cache, advance } = make();
    cache.set('a', { ...match, reason: 'x' });
    cache.set('b', { ...match, reason: 'x' });
    advance(60_001);
    cache.set('c', { ...match, reason: 'x' });
    expect(cache.size).toBe(1);
  });
});
