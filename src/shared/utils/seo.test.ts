import { describe, it, expect } from 'vitest';
import { SITE_ORIGIN, SITE_NAME, buildPageTitle, buildAbsoluteUrl } from './seo';

describe('SEO Utils', () => {
  describe('SITE_NAME', () => {
    it('サイト名は「お気楽チャットTS」に統一されている', () => {
      expect(SITE_NAME).toBe('お気楽チャットTS');
    });
  });

  describe('buildPageTitle', () => {
    it('「{ページ名} | {サイト名}」形式の title を返す', () => {
      expect(buildPageTitle('アニメチャット')).toBe(`アニメチャット | ${SITE_NAME}`);
    });
  });

  describe('buildAbsoluteUrl', () => {
    it('パスから絶対 URL を組み立てる', () => {
      expect(buildAbsoluteUrl('/chat/anime')).toBe(`${SITE_ORIGIN}/chat/anime`);
    });

    it('引数なしではトップの URL を返す', () => {
      expect(buildAbsoluteUrl()).toBe(`${SITE_ORIGIN}/`);
    });

    it('先頭スラッシュなしのパスも解決できる', () => {
      expect(buildAbsoluteUrl('ogp.png')).toBe(`${SITE_ORIGIN}/ogp.png`);
    });
  });
});
