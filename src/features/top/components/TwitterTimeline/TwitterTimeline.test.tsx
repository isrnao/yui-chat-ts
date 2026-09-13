import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { TwitterTimeline } from './index';

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

function widgetScript() {
  return document.getElementById('twitter-wjs');
}

describe('TwitterTimeline', () => {
  afterEach(() => {
    widgetScript()?.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // widgets.js と iframe で実測 131KB。初期描画の帯域を奪うので見えるまで読まない
  it('ビューポートに入るまで widgets.js を読み込まない', () => {
    installObserver();
    render(<TwitterTimeline screenName="okiraku" />);

    expect(widgetScript()).toBeNull();
  });

  it('ビューポートに入ったら widgets.js を読み込む', () => {
    const harness = installObserver();
    render(<TwitterTimeline screenName="okiraku" />);

    act(() => harness.enterViewport());

    expect(widgetScript()?.getAttribute('src')).toBe('https://platform.twitter.com/widgets.js');
  });

  it('script が既にあれば再読み込みせず再スキャンする', () => {
    const harness = installObserver();
    const load = vi.fn();
    vi.stubGlobal('twttr', { widgets: { load } });
    const existing = document.createElement('script');
    existing.id = 'twitter-wjs';
    document.body.append(existing);

    render(<TwitterTimeline screenName="okiraku" />);
    act(() => harness.enterViewport());

    expect(load).toHaveBeenCalled();
    expect(document.querySelectorAll('#twitter-wjs')).toHaveLength(1);
  });
});
