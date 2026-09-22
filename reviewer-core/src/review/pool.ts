/**
 * Run `fn` over `items` with at most `limit` in flight; results keep ITEM order
 * (not completion order). On the first failure no new items start, in-flight
 * ones are awaited (so their side effects, e.g. usage reports, land) and the
 * first error is rethrown.
 */
export async function mapOrdered<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  let firstError: unknown;

  const worker = async () => {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i]!, i);
      } catch (e) {
        if (!failed) firstError = e;
        failed = true;
      }
    }
  };

  const width = Math.max(1, Math.min(Math.floor(limit) || 1, items.length));
  await Promise.all(Array.from({ length: width }, worker));
  if (failed) throw firstError;
  return results;
}
