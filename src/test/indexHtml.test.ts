import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * index.html の head の先頭で、ページ間の遷移の View Transition が省かれたときの AbortError だけを
 * 受け止める（.kiro/specs/react-2026-refactoring design.md §16）。
 */
function dispatchRejection(reason: unknown) {
  const event = new Event('unhandledrejection', { cancelable: true });
  Object.defineProperty(event, 'reason', { value: reason });
  window.dispatchEvent(event);
  return event;
}

describe('index.html の未処理の Promise の扱い', () => {
  const later = vi.fn();

  beforeAll(() => {
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf-8');
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
      .map((match) => match[1] ?? '')
      .find((body) => body.includes('unhandledrejection'));
    expect(script).toBeDefined();
    // head の先頭と同じく、監視のエージェントより先に登録する
    new Function(script!)();
    window.addEventListener('unhandledrejection', later);
  });

  it('「Transition was skipped」の AbortError は受け止め、後のリスナーにも渡さない', () => {
    later.mockClear();
    const event = dispatchRejection(new DOMException('Transition was skipped', 'AbortError'));
    expect(event.defaultPrevented).toBe(true);
    expect(later).not.toHaveBeenCalled();
  });

  it('ほかの理由の未処理の Promise はそのまま報告させる', () => {
    later.mockClear();
    const aborted = dispatchRejection(
      new DOMException('The user aborted a request.', 'AbortError')
    );
    const failed = dispatchRejection(new Error('Transition was skipped'));
    expect(aborted.defaultPrevented).toBe(false);
    expect(failed.defaultPrevented).toBe(false);
    expect(later).toHaveBeenCalledTimes(2);
  });
});
