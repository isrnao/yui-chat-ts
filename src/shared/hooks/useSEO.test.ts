import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSEO, usePageView } from './useSEO';
import type { UseSEOOptions } from './useSEO';

describe('useSEO', () => {
  beforeEach(() => {
    // DOMをクリーンアップ
    document.title = '';
    document.head.innerHTML = '';
    vi.clearAllMocks();
  });

  describe('title setting', () => {
    it('should set document title when title option is provided', () => {
      const testTitle = 'テストタイトル';

      renderHook(() => useSEO({ title: testTitle }));

      expect(document.title).toBe(testTitle);
    });

    it('should not change title when title option is not provided', () => {
      const originalTitle = document.title;

      renderHook(() => useSEO({}));

      expect(document.title).toBe(originalTitle);
    });
  });

  describe('meta description setting', () => {
    it('should create and set meta description when it does not exist', () => {
      const testDescription = 'テスト説明文';

      renderHook(() => useSEO({ description: testDescription }));

      const metaDescription = document.querySelector('meta[name="description"]');
      expect(metaDescription).toBeTruthy();
      expect(metaDescription?.getAttribute('content')).toBe(testDescription);
    });

    it('should update existing meta description', () => {
      // 既存のmeta要素を作成
      const existingMeta = document.createElement('meta');
      existingMeta.setAttribute('name', 'description');
      existingMeta.setAttribute('content', 'old description');
      document.head.appendChild(existingMeta);

      const testDescription = 'new description';

      renderHook(() => useSEO({ description: testDescription }));

      const metaDescription = document.querySelector('meta[name="description"]');
      expect(metaDescription?.getAttribute('content')).toBe(testDescription);
    });
  });

  describe('keywords setting', () => {
    it('should create and set meta keywords when it does not exist', () => {
      const testKeywords = ['キーワード1', 'キーワード2'];

      renderHook(() => useSEO({ keywords: testKeywords }));

      const metaKeywords = document.querySelector('meta[name="keywords"]');
      expect(metaKeywords).toBeTruthy();
      expect(metaKeywords?.getAttribute('content')).toBe('キーワード1,キーワード2');
    });

    it('should not set keywords when keywords option is empty array', () => {
      renderHook(() => useSEO({ keywords: [] }));

      const metaKeywords = document.querySelector('meta[name="keywords"]');
      expect(metaKeywords).toBeNull();
    });

    it('should not set keywords when keywords option is not provided', () => {
      renderHook(() => useSEO({}));

      const metaKeywords = document.querySelector('meta[name="keywords"]');
      expect(metaKeywords).toBeNull();
    });
  });

  describe('canonical URL setting', () => {
    it('should create and set canonical link when it does not exist', () => {
      const testCanonical = 'https://example.com/canonical';

      renderHook(() => useSEO({ canonical: testCanonical }));

      const canonicalLink = document.querySelector('link[rel="canonical"]');
      expect(canonicalLink).toBeTruthy();
      expect(canonicalLink?.getAttribute('href')).toBe(testCanonical);
    });

    it('should not set canonical when canonical option is not provided', () => {
      renderHook(() => useSEO({}));

      const canonicalLink = document.querySelector('link[rel="canonical"]');
      expect(canonicalLink).toBeNull();
    });
  });

  describe('og:image setting', () => {
    it('should update og:image meta tags when ogImage is provided', () => {
      // 既存のOG画像メタ要素を作成
      const ogImageMeta = document.createElement('meta');
      ogImageMeta.setAttribute('property', 'og:image');
      document.head.appendChild(ogImageMeta);

      const twitterImageMeta = document.createElement('meta');
      twitterImageMeta.setAttribute('property', 'twitter:image');
      document.head.appendChild(twitterImageMeta);

      const testOgImage = '/test-og-image.png';

      renderHook(() => useSEO({ ogImage: testOgImage }));

      expect(ogImageMeta.getAttribute('content')).toBe(testOgImage);
      expect(twitterImageMeta.getAttribute('content')).toBe(testOgImage);
    });

    it('should not set og:image when ogImage option is not provided', () => {
      renderHook(() => useSEO({}));

      const ogImageMeta = document.querySelector('meta[property="og:image"]');
      const twitterImageMeta = document.querySelector('meta[property="twitter:image"]');
      expect(ogImageMeta).toBeNull();
      expect(twitterImageMeta).toBeNull();
    });
  });

  describe('structured data setting', () => {
    it('should update structured data when title and description are provided', () => {
      // 既存の構造化データスクリプトを作成
      const existingScript = document.createElement('script');
      existingScript.type = 'application/ld+json';
      existingScript.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
      });
      document.head.appendChild(existingScript);

      renderHook(() =>
        useSEO({
          title: 'Test Title',
          description: 'Test Description',
          keywords: ['test', 'keyword'],
        })
      );

      const updatedScript = document.querySelector('script[type="application/ld+json"]');
      const data = JSON.parse(updatedScript?.textContent || '{}');

      expect(data.name).toBe('Test Title');
      expect(data.description).toBe('Test Description');
      expect(data.keywords).toBe('test,keyword');
    });

    it('should handle invalid JSON gracefully', () => {
      // 無効なJSONを持つスクリプトを作成
      const invalidScript = document.createElement('script');
      invalidScript.type = 'application/ld+json';
      invalidScript.textContent = 'invalid json';
      document.head.appendChild(invalidScript);

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useSEO({ title: 'Test Title' }));
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle undefined options gracefully', () => {
      expect(() => {
        renderHook(() => useSEO());
      }).not.toThrow();
    });

    it('should handle multiple calls with different options', () => {
      const { rerender } = renderHook(
        ({ options }: { options?: UseSEOOptions }) => useSEO(options),
        { initialProps: { options: { title: 'First Title' } as UseSEOOptions } }
      );

      expect(document.title).toBe('First Title');

      rerender({ options: { title: 'Second Title', description: 'New Description' } as UseSEOOptions });

      expect(document.title).toBe('Second Title');
      const metaDescription = document.querySelector('meta[name="description"]');
      expect(metaDescription?.getAttribute('content')).toBe('New Description');
    });

    it('should update existing keywords meta tag', () => {
      // 既存のキーワードメタ要素を作成
      const existingKeywords = document.createElement('meta');
      existingKeywords.setAttribute('name', 'keywords');
      existingKeywords.setAttribute('content', 'old,keywords');
      document.head.appendChild(existingKeywords);

      const newKeywords = ['new', 'keywords'];

      renderHook(() => useSEO({ keywords: newKeywords }));

      const metaKeywords = document.querySelector('meta[name="keywords"]');
      expect(metaKeywords?.getAttribute('content')).toBe('new,keywords');
    });

    it('should update existing canonical link', () => {
      // 既存のカノニカルリンクを作成
      const existingCanonical = document.createElement('link');
      existingCanonical.setAttribute('rel', 'canonical');
      existingCanonical.setAttribute('href', 'https://old.com');
      document.head.appendChild(existingCanonical);

      const newCanonical = 'https://new.com';

      renderHook(() => useSEO({ canonical: newCanonical }));

      const canonicalLink = document.querySelector('link[rel="canonical"]');
      expect(canonicalLink?.getAttribute('href')).toBe(newCanonical);
    });

    it('should handle missing og:image and twitter:image meta tags gracefully', () => {
      const testOgImage = '/test-image.png';

      expect(() => {
        renderHook(() => useSEO({ ogImage: testOgImage }));
      }).not.toThrow();
    });

    it('should not update structured data when no title or description provided', () => {
      const existingScript = document.createElement('script');
      existingScript.type = 'application/ld+json';
      existingScript.textContent = JSON.stringify({ '@context': 'https://schema.org' });
      document.head.appendChild(existingScript);

      renderHook(() => useSEO({ keywords: ['test'] }));

      const script = document.querySelector('script[type="application/ld+json"]');
      const data = JSON.parse(script?.textContent || '{}');

      // title や description が提供されていないので、構造化データは更新されない
      expect(data.name).toBeUndefined();
      expect(data.description).toBeUndefined();
    });

    it('should handle empty structured data script content', () => {
      const emptyScript = document.createElement('script');
      emptyScript.type = 'application/ld+json';
      emptyScript.textContent = '';
      document.head.appendChild(emptyScript);

      expect(() => {
        renderHook(() => useSEO({ title: 'Test Title' }));
      }).not.toThrow();

      const script = document.querySelector('script[type="application/ld+json"]');
      const data = JSON.parse(script?.textContent || '{}');
      expect(data.name).toBe('Test Title');
    });

    it('should handle missing structured data script gracefully', () => {
      expect(() => {
        renderHook(() => useSEO({ title: 'Test Title', description: 'Test Description' }));
      }).not.toThrow();
    });

    it('should re-run effect when dependencies change', () => {
      const { rerender } = renderHook(
        ({ options }: { options?: UseSEOOptions }) => useSEO(options),
        {
          initialProps: {
            options: {
              title: 'Initial',
              description: 'Initial Desc',
              keywords: ['initial'],
              canonical: 'https://initial.com',
              ogImage: '/initial.png',
            },
          },
        }
      );

      expect(document.title).toBe('Initial');

      // すべてのオプションを変更
      rerender({
        options: {
          title: 'Updated',
          description: 'Updated Desc',
          keywords: ['updated'],
          canonical: 'https://updated.com',
          ogImage: '/updated.png',
        },
      });

      expect(document.title).toBe('Updated');

      const metaDescription = document.querySelector('meta[name="description"]');
      expect(metaDescription?.getAttribute('content')).toBe('Updated Desc');
    });
  });
});

describe('usePageView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.title = 'Default Title';

    // グローバルwindowオブジェクトをモック
    Object.defineProperty(global, 'window', {
      value: {
        gtag: vi.fn(),
        location: { href: 'https://example.com/test' },
      },
      writable: true,
      configurable: true,
    });
  });

  it('should call gtag with page name when gtag is available', () => {
    const testPageName = 'Test Page';

    renderHook(() => usePageView(testPageName));

    expect(window.gtag).toHaveBeenCalledWith('config', 'GA_MEASUREMENT_ID', {
      page_title: testPageName,
      page_location: 'https://example.com/test',
    });
  });

  it('should use document title when page name is not provided', () => {
    renderHook(() => usePageView());

    expect(window.gtag).toHaveBeenCalledWith('config', 'GA_MEASUREMENT_ID', {
      page_title: 'Default Title',
      page_location: 'https://example.com/test',
    });
  });

  it('should not call gtag when window.gtag is not available', () => {
    // gtagを未定義に設定
    Object.defineProperty(global, 'window', {
      value: { location: { href: 'https://example.com/test' } },
      writable: true,
      configurable: true,
    });

    expect(() => {
      renderHook(() => usePageView('Test Page'));
    }).not.toThrow();
  });

  it('should re-run effect when pageName changes', () => {
    const { rerender } = renderHook(
      ({ pageName }: { pageName?: string }) => usePageView(pageName),
      { initialProps: { pageName: 'Initial Page' } }
    );

    expect(window.gtag).toHaveBeenCalledWith('config', 'GA_MEASUREMENT_ID', {
      page_title: 'Initial Page',
      page_location: 'https://example.com/test',
    });

    vi.clearAllMocks();

    rerender({ pageName: 'Updated Page' });

    expect(window.gtag).toHaveBeenCalledWith('config', 'GA_MEASUREMENT_ID', {
      page_title: 'Updated Page',
      page_location: 'https://example.com/test',
    });
  });

  it('should handle undefined pageName parameter', () => {
    document.title = 'Fallback Title';

    renderHook(() => usePageView(undefined));

    expect(window.gtag).toHaveBeenCalledWith('config', 'GA_MEASUREMENT_ID', {
      page_title: 'Fallback Title',
      page_location: 'https://example.com/test',
    });
  });
});
