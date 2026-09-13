import { describe, it, expect } from 'vitest';
import {
  renderRoomHtml,
  buildOutputRelativePath,
  injectRoutePreload,
  injectSsgMarkup,
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

  // #root の中身は SSG (injectSsgMarkup) が埋める。
  // 手書きの静的フォールバックは、クライアント出力と異なるマークアップで
  // 二重表示とレイアウトシフトを招くため廃止した。
  it('#root は空のまま返す (中身は SSG が埋める)', () => {
    const html = renderRoomHtml(TEMPLATE, 'anime');

    expect(html).toContain('<div id="root"></div>');
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

describe('injectRoutePreload', () => {
  const html =
    '<html><head><link rel="stylesheet" href="/assets/app.css" /></head><body></body></html>';

  it('JS には modulePreload、CSS には stylesheet を使う', () => {
    const out = injectRoutePreload(html, ['assets/ChatRoute.js', 'assets/ChatRoute.css']);

    expect(out).toContain('<link rel="modulePreload" crossorigin href="/assets/ChatRoute.js" />');
    expect(out).toContain('<link rel="stylesheet" crossorigin href="/assets/ChatRoute.css" />');
  });

  it('テンプレートが既に参照している資産は足さない', () => {
    const out = injectRoutePreload(html, ['assets/app.css', 'assets/ChatRoute.js']);

    expect(out.match(/assets\/app\.css/g)).toHaveLength(1);
  });

  it('</head> の直前に差し込む', () => {
    const out = injectRoutePreload(html, ['assets/ChatRoute.js']);

    expect(out.indexOf('/assets/ChatRoute.js')).toBeLessThan(out.indexOf('</head>'));
  });

  it('空配列なら何もしない', () => {
    expect(injectRoutePreload(html, [])).toBe(html);
  });

  it('</head> が無ければ throw する (壊れた HTML を黙って配信しないため)', () => {
    expect(() => injectRoutePreload('<html><body></body></html>', ['a.js'])).toThrow();
  });
});

describe('injectSsgMarkup', () => {
  const html = '<html><head></head><body><div id="root"></div></body></html>';

  it('#root に SSG 済みマークアップを入れ、hydrate 対象の印を付ける', () => {
    const out = injectSsgMarkup(html, '<main><h1>やあ</h1></main>');

    expect(out).toContain('<div id="root" data-ssg="1"><main><h1>やあ</h1></main></div>');
  });

  // 印が無いページへ hydrate するとマークアップ不一致になるため、
  // クライアントはこの印で hydrateRoot / createRoot を出し分ける
  it('印が無いテンプレートは hydrate 対象にならない', () => {
    expect(html).not.toContain('data-ssg');
  });

  it('#root が無いテンプレートでは throw する', () => {
    expect(() => injectSsgMarkup('<html><body></body></html>', '<main></main>')).toThrow();
  });
});
