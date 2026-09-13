import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRef } from 'react';
import { renderHook, act } from '@testing-library/react';
import { useInViewport } from './useInViewport';

type ObserverCallback = (entries: { isIntersecting: boolean }[]) => void;

function installObserver() {
  const callbacks: ObserverCallback[] = [];
  const observe = vi.fn();
  const disconnect = vi.fn();

  class FakeObserver {
    constructor(callback: ObserverCallback) {
      callbacks.push(callback);
    }
    observe = observe;
    disconnect = disconnect;
    unobserve = vi.fn();
    takeRecords = vi.fn();
  }
  vi.stubGlobal('IntersectionObserver', FakeObserver);

  return {
    observe,
    disconnect,
    enterViewport: () => callbacks.forEach((cb) => cb([{ isIntersecting: true }])),
    scrollPast: () => callbacks.forEach((cb) => cb([{ isIntersecting: false }])),
  };
}

function refTo(element: Element) {
  const ref = createRef<Element>();
  (ref as { current: Element | null }).current = element;
  return ref;
}

describe('useInViewport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('ビューポートに入るまで false', () => {
    const harness = installObserver();
    const { result } = renderHook(() => useInViewport(refTo(document.createElement('div'))));

    expect(result.current).toBe(false);
    expect(harness.observe).toHaveBeenCalled();
  });

  it('交差していない通知では true にならない', () => {
    const harness = installObserver();
    const { result } = renderHook(() => useInViewport(refTo(document.createElement('div'))));

    act(() => harness.scrollPast());

    expect(result.current).toBe(false);
  });

  it('ビューポートに入ったら true になり、監視を解除する', () => {
    const harness = installObserver();
    const { result } = renderHook(() => useInViewport(refTo(document.createElement('div'))));

    act(() => harness.enterViewport());

    expect(result.current).toBe(true);
    expect(harness.disconnect).toHaveBeenCalled();
  });

  // 観測できない環境で読み込まれないままになると、広告やタイムラインが永久に出ない
  it('IntersectionObserver が無い環境では遅延せず true', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { result } = renderHook(() => useInViewport(refTo(document.createElement('div'))));

    expect(result.current).toBe(true);
  });
});
