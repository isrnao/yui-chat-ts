import { describe, it, expect } from 'vitest';
import { buildRoomSeo, buildRoomPath } from './roomSeo';
import { SITE_NAME } from './seo';

describe('buildRoomPath', () => {
  it('/chat/<id> 形式のパスを返す', () => {
    expect(buildRoomPath('anime')).toBe('/chat/anime');
  });
});

describe('buildRoomSeo', () => {
  it('title を「{部屋名} | {サイト名}」形式で組み立てる', () => {
    const seo = buildRoomSeo('anime');
    expect(seo.title).toBe(`アニメチャット | ${SITE_NAME}`);
  });

  it('canonical は自ページの絶対 URL になる', () => {
    const seo = buildRoomSeo('anime');
    expect(seo.canonical).toBe('https://www.okiraku.chat/chat/anime');
  });

  it('description は部屋の紹介文を使い、overrides で差し替えられる', () => {
    const room = buildRoomSeo('anime');
    expect(room.description).toBeTruthy();

    const overridden = buildRoomSeo('all', { description: '固有の説明文' });
    expect(overridden.description).toBe('固有の説明文');
  });

  describe('jsonLd (WebPage + BreadcrumbList)', () => {
    it('@graph を含まず、WebPage と BreadcrumbList の 2 要素を持つ', () => {
      const seo = buildRoomSeo('anime');
      expect(seo.jsonLd).toHaveLength(2);
      for (const entity of seo.jsonLd) {
        expect(entity).not.toHaveProperty('@graph');
        expect(entity).toHaveProperty('@context', 'https://schema.org');
      }
    });

    it('WebPage は canonical と一致する @id / url とベース WebSite への参照を持つ', () => {
      const seo = buildRoomSeo('anime');
      const webPage = seo.jsonLd[0] as Record<string, unknown>;
      expect(webPage['@type']).toBe('WebPage');
      expect(webPage['@id']).toBe(seo.canonical);
      expect(webPage.url).toBe(seo.canonical);
      expect(webPage.name).toBe(seo.title);
      expect(webPage.description).toBe(seo.description);
      expect(webPage.isPartOf).toEqual({ '@id': 'https://www.okiraku.chat/#website' });
    });

    it('BreadcrumbList は最終要素以外に item (URL) を持つ (リッチリザルト要件)', () => {
      const seo = buildRoomSeo('anime');
      const breadcrumb = seo.jsonLd[1] as {
        '@type': string;
        itemListElement: Array<{ position: number; name: string; item?: string }>;
      };
      expect(breadcrumb['@type']).toBe('BreadcrumbList');

      const items = breadcrumb.itemListElement;
      expect(items.length).toBeGreaterThanOrEqual(2);
      for (const [index, item] of items.entries()) {
        expect(item.position).toBe(index + 1);
        expect(item.name).toBeTruthy();
        if (index < items.length - 1) {
          expect(item.item).toMatch(/^https:\/\//);
        }
      }
    });

    it('overrides.description は WebPage の description にも反映される', () => {
      const seo = buildRoomSeo('all', { description: '固有の説明文' });
      const webPage = seo.jsonLd[0] as Record<string, unknown>;
      expect(webPage.description).toBe('固有の説明文');
    });
  });
});
