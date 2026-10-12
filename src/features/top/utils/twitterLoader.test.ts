import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => {
  document.getElementById('twitter-wjs')?.remove();
  delete window.twttr;
  vi.useRealTimers();
});
it('pendingの再mountを共有し、失敗後は明示retryだけで新しいscriptを作る', async () => {
  vi.resetModules();
  const { loadTwitterWidgets } = await import('./twitterLoader');
  const first = loadTwitterWidgets();
  expect(loadTwitterWidgets()).toBe(first);
  expect(document.querySelectorAll('#twitter-wjs')).toHaveLength(1);
  document.getElementById('twitter-wjs')!.dispatchEvent(new Event('error'));
  await expect(first).rejects.toThrow();
  await expect(loadTwitterWidgets()).rejects.toThrow();
  const retry = loadTwitterWidgets(true);
  window.twttr = { widgets: { load: vi.fn() } };
  document.getElementById('twitter-wjs')!.dispatchEvent(new Event('load'));
  await expect(retry).resolves.toBeUndefined();
});
