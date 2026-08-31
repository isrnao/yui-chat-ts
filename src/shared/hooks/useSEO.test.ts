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

      const ogImageTypeMeta = document.createElement('meta');
      ogImageTypeMeta.setAttribute('property', 'og:image:type');
      document.head.appendChild(ogImageTypeMeta);

      // Twitter Card 仕様は `name` 属性を使う (`property` は OGP/RDFa 用)
      const twitterImageMeta = document.createElement('meta');
      twitterImageMeta.setAttribute('name', 'twitter:image');
      document.head.appendChild(twitterImageMeta);

      const testOgImage = '/test-og-image.png';

      renderHook(() => useSEO({ ogImage: testOgImage }));

      expect(ogImageMeta.getAttribute('content')).toBe(testOgImage);
      expect(ogImageTypeMeta.getAttribute('content')).toBe('image/png');
      expect(twitterImageMeta.getAttribute('content')).toBe(testOgImage);
    });

    it('should allow explicit og:image:type override', () => {
      renderHook(() =>
        useSEO({
          ogImage: 'https://example.com/ogp.png?cache=1',
          ogImageType: 'image/custom-png',
        })
      );

      const ogImageTypeMeta = document.querySelector('meta[property="og:image:type"]');
      expect(ogImageTypeMeta?.getAttribute('content')).toBe('image/custom-png');
    });

    it('should not set og:image when ogImage option is not provided', () => {
      renderHook(() => useSEO({}));

      const ogImageMeta = document.querySelector('meta[property="og:image"]');
      const ogImageTypeMeta = document.querySelector('meta[property="og:image:type"]');
      const twitterImageMeta = document.querySelector('meta[name="twitter:image"]');
      expect(ogImageMeta).toBeNull();
      expect(ogImageTypeMeta).toBeNull();
      expect(twitterImageMeta).toBeNull();
    });
  });

  describe('noindex / canonical 削除 (SPA 内遷移のメタ残留対策)', () => {
    it('noindex: true で robots meta が noindex になる', () => {
      renderHook(() => useSEO({ noindex: true }));

      const robots = document.querySelector('meta[name="robots"]');
      expect(robots?.getAttribute('content')).toBe('noindex');
    });

    it('noindex 未指定では robots meta が index, follow に戻る (残留しない)', () => {
      // Props を明示しないと initialProps から `{ noindex: boolean }` に狭く推論され、
      // 別のキーで rerender できなくなる
      const { rerender } = renderHook<void, { options: UseSEOOptions }>(
        ({ options }) => useSEO(options),
        { initialProps: { options: { noindex: true } } }
      );

      rerender({ options: { title: '通常ページ' } });

      const robots = document.querySelector('meta[name="robots"]');
      expect(robots?.getAttribute('content')).toBe('index, follow');
    });

    it('canonical: null で canonical link と og:url が削除される (残留しない)', () => {
      const { rerender } = renderHook<void, { options: UseSEOOptions }>(
        ({ options }) => useSEO(options),
        { initialProps: { options: { canonical: 'https://www.okiraku.chat/chat/anime' } } }
      );

      expect(document.querySelector('link[rel="canonical"]')).not.toBeNull();
      expect(document.querySelector('meta[property="og:url"]')).not.toBeNull();

      rerender({ options: { canonical: null } });

      expect(document.querySelector('link[rel="canonical"]')).toBeNull();
      expect(document.querySelector('meta[property="og:url"]')).toBeNull();
    });

    it('canonical: undefined では既存の canonical を変更しない', () => {
      renderHook(() => useSEO({ canonical: 'https://www.okiraku.chat/chat/anime' }));
      renderHook(() => useSEO({ title: 'タイトルのみ' }));

      const canonical = document.querySelector('link[rel="canonical"]');
      expect(canonical?.getAttribute('href')).toBe('https://www.okiraku.chat/chat/anime');
    });
  });

  describe('structured data setting', () => {
    it('ベースの @graph スクリプトには書き込まない (title/description を渡しても不変)', () => {
      const baseJson = JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [{ '@type': 'WebSite', name: 'お気楽チャットTS' }],
      });
      const existingScript = document.createElement('script');
      existingScript.type = 'application/ld+json';
      existingScript.textContent = baseJson;
      document.head.appendChild(existingScript);

      renderHook(() =>
        useSEO({
          title: 'Test Title',
          description: 'Test Description',
        })
      );

      expect(existingScript.textContent).toBe(baseJson);
    });

    it('jsonLd オプションで data-page-jsonld ノードを作成する', () => {
      const jsonLd = [{ '@type': 'WebPage', name: 'テスト部屋' }];

      renderHook(() => useSEO({ jsonLd }));

      const script = document.querySelector('script[type="application/ld+json"][data-page-jsonld]');
      expect(script).not.toBeNull();
      expect(JSON.parse(script?.textContent || '[]')).toEqual(jsonLd);
    });

    it('jsonLd を渡さない再レンダーで data-page-jsonld ノードが削除される (残留しない)', () => {
      const { rerender } = renderHook(({ options }: { options: object }) => useSEO(options), {
        initialProps: { options: { jsonLd: [{ '@type': 'WebPage', name: '部屋A' }] } as object },
      });

      expect(
        document.querySelector('script[type="application/ld+json"][data-page-jsonld]')
      ).not.toBeNull();

      rerender({ options: { title: 'トップページ' } });

      expect(
        document.querySelector('script[type="application/ld+json"][data-page-jsonld]')
      ).toBeNull();
    });

    it('jsonLd の変更で data-page-jsonld ノードを増殖させず内容を置き換える', () => {
      const { rerender } = renderHook(({ jsonLd }: { jsonLd: object[] }) => useSEO({ jsonLd }), {
        initialProps: { jsonLd: [{ '@type': 'WebPage', name: '部屋A' }] },
      });

      rerender({ jsonLd: [{ '@type': 'WebPage', name: '部屋B' }] });

      const scripts = document.querySelectorAll(
        'script[type="application/ld+json"][data-page-jsonld]'
      );
      expect(scripts).toHaveLength(1);
      expect(JSON.parse(scripts[0].textContent || '[]')).toEqual([
        { '@type': 'WebPage', name: '部屋B' },
      ]);
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

      rerender({
        options: { title: 'Second Title', description: 'New Description' } as UseSEOOptions,
      });

      expect(document.title).toBe('Second Title');
      const metaDescription = document.querySelector('meta[name="description"]');
      expect(metaDescription?.getAttribute('content')).toBe('New Description');
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

      renderHook(() => useSEO({ noindex: false }));

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

      // ベースの ld+json は data-page-jsonld ではないため書き込まれない
      const script = document.querySelector('script[type="application/ld+json"]');
      expect(script?.textContent).toBe('');
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

    expect(window.gtag).toHaveBeenCalledWith('config', 'G-S3LCSTZBES', {
      page_title: testPageName,
      page_location: 'https://example.com/test',
    });
  });

  it('should use document title when page name is not provided', () => {
    renderHook(() => usePageView());

    expect(window.gtag).toHaveBeenCalledWith('config', 'G-S3LCSTZBES', {
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

    expect(window.gtag).toHaveBeenCalledWith('config', 'G-S3LCSTZBES', {
      page_title: 'Initial Page',
      page_location: 'https://example.com/test',
    });

    vi.clearAllMocks();

    rerender({ pageName: 'Updated Page' });

    expect(window.gtag).toHaveBeenCalledWith('config', 'G-S3LCSTZBES', {
      page_title: 'Updated Page',
      page_location: 'https://example.com/test',
    });
  });

  it('should handle undefined pageName parameter', () => {
    document.title = 'Fallback Title';

    renderHook(() => usePageView(undefined));

    expect(window.gtag).toHaveBeenCalledWith('config', 'G-S3LCSTZBES', {
      page_title: 'Fallback Title',
      page_location: 'https://example.com/test',
    });
  });
});
