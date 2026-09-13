import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { AdringWidget } from './index';

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;

function installObserver() {
  const callbacks: ObserverCallback[] = [];
  class FakeObserver {
    constructor(callback: ObserverCallback) {
      callbacks.push(callback);
    }
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    takeRecords = vi.fn();
  }
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  return { enterViewport: () => callbacks.forEach((cb) => cb([{ isIntersecting: true }])) };
}

describe('AdringWidget', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // サードパーティ script は初期描画の帯域を奪うので、見えるまで読み込まない
  it('ビューポートに入るまで script を読み込まない', () => {
    installObserver();
    const { container } = render(<AdringWidget siteId="site-1" />);

    expect(container.querySelector('script')).toBeNull();
  });

  it('ビューポートに入ったら script を挿入する', () => {
    const harness = installObserver();
    const { container } = render(<AdringWidget siteId="site-1" variant="default" />);

    act(() => harness.enterViewport());

    const script = container.querySelector('script');
    expect(script).not.toBeNull();
    expect(script?.getAttribute('src')).toBe('https://ar-cdn.net/widget/v1.js');
    expect(script?.dataset.siteId).toBe('site-1');
    expect(script?.dataset.variant).toBe('default');
  });

  it('アンマウントでコンテナを空にする (再マウントでの重複を防ぐ)', () => {
    const harness = installObserver();
    const { container, unmount } = render(<AdringWidget siteId="site-1" />);
    act(() => harness.enterViewport());
    expect(container.querySelector('script')).not.toBeNull();

    unmount();

    expect(container.querySelector('script')).toBeNull();
  });
});
