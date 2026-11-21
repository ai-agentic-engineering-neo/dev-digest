import './missing-module';

export async function load(name: string): Promise<unknown> {
  const lazy = await import('./lazy');
  const other = await import(name);
  return [lazy.lazyValue(), other];
}
