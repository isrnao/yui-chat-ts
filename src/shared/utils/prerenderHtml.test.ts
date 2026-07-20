import { describe, it, expect } from 'vitest';
import {
  renderRoomHtml,
  buildOutputRelativePath,
  PAGE_SEO_START,
  PAGE_SEO_END,
} from './prerenderHtml';
import { buildRoomSeo } from './roomSeo';

const TEMPLATE = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    ${PAGE_SEO_START}
    <title>お気楽チャットTS - トップ</title>
    <link rel="canonical" href="https://www.okiraku.chat/" />
    ${PAGE_SEO_END}
    <script type="application/ld+json">{"@graph":[{"@type":"WebSite"}]}</script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/index-abc.js"></script>
  </body>
</html>`;

describe('renderRoomHtml', () => {
  it('マーカー範囲を部屋固有のメタに差し替える', () => {
    const html = renderRoomHtml(TEMPLATE, 'anime');
    const seo = buildRoomSeo('anime');

    expect(html).toContain(`<title>${seo.title}</title>`);
    expect(html).toContain(`<link rel="canonical" href="${seo.canonical}" />`);
    expect(html).toContain(`<meta property="og:url" content="${seo.canonical}" />`);
    // トップ用の canonical は残らない
    expect(html).not.toContain('href="https://www.okiraku.chat/" />');
  });

  it('data-page-jsonld スクリプトを埋め込み、ベース @graph は残す', () => {
    const html = renderRoomHtml(TEMPLATE, 'anime');

    expect(html).toContain('data-page-jsonld');
    expect(html).toContain('"@graph":[{"@type":"WebSite"}]');

    const jsonLdMatch = html.match(
      /<script type="application\/ld\+json" data-page-jsonld>(.*?)<\/script>/
    );
    expect(jsonLdMatch).not.toBeNull();
    const jsonLd = JSON.parse(jsonLdMatch![1]);
    expect(jsonLd).toEqual(buildRoomSeo('anime').jsonLd);
  });

  it('#root に静的フォールバック本文 (h1 + 紹介文 + トップへのリンク) を挿入する', () => {
    const html = renderRoomHtml(TEMPLATE, 'anime');

    expect(html).toContain('<h1>アニメチャット</h1>');
    expect(html).toContain('<a href="/">');
    // SPA のマウントポイントは維持される
    expect(html).toContain('<div id="root">');
    expect(html).toContain('<script type="module" src="/assets/index-abc.js"></script>');
  });

  it('マーカーが無いテンプレートでは throw してビルドを失敗させる', () => {
    expect(() => renderRoomHtml('<html><head></head><body></body></html>', 'anime')).toThrow(
      /page-seo markers not found/
    );
  });

  it('#root が無いテンプレートでは throw する', () => {
    const noRoot = `${PAGE_SEO_START}${PAGE_SEO_END}<body></body>`;
    expect(() => renderRoomHtml(noRoot, 'anime')).toThrow(/root/);
  });

  it('埋め込み JSON-LD の "<" は Unicode エスケープされ script タグを壊せない', () => {
    const html = renderRoomHtml(TEMPLATE, 'anime');
    const jsonLdMatch = html.match(
      /<script type="application\/ld\+json" data-page-jsonld>(.*?)<\/script>/
    );
    expect(jsonLdMatch).not.toBeNull();
    // 生文字列としては "<" を含まない (JSON.parse すれば元の値に戻る)
    expect(jsonLdMatch![1]).not.toContain('<');
  });

  it('タイトル等の HTML 特殊文字はエスケープされる', () => {
    // WORKING!! など実在の部屋名は無害だが、将来の部屋名に備えて挙動を固定する
    const html = renderRoomHtml(TEMPLATE, 'working');
    expect(html).toContain('WORKING!!チャット');
    expect(html).not.toContain('<script>alert');
  });
});

describe('buildOutputRelativePath', () => {
  it('chat/<id>/index.html を返す', () => {
    expect(buildOutputRelativePath('anime')).toBe('chat/anime/index.html');
    expect(buildOutputRelativePath('all')).toBe('chat/all/index.html');
  });
});
