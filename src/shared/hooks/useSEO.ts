import { useEffect } from 'react';
import { GA_MEASUREMENT_ID } from '@shared/utils/analytics';

/**
 * SEO用のメタデータを動的に設定するためのカスタムフック
 */
export interface UseSEOOptions {
  title?: string;
  description?: string;
  /**
   * ページの正規 URL。`null` を渡すと canonical <link> を削除する
   * (NotFound 等、canonical を持つべきでないページの SPA 内遷移残留対策)。
   * undefined は「変更しない」。
   */
  canonical?: string | null;
  ogImage?: string;
  ogImageType?: string;
  /**
   * true でこのページをインデックス対象外にする (robots meta を noindex にする)。
   * false / 未指定では index, follow に戻す (SPA 内遷移での noindex 残留対策)。
   */
  noindex?: boolean;
  /**
   * ページ固有の構造化データ (WebPage + BreadcrumbList 等)。
   * <script type="application/ld+json" data-page-jsonld> 専用ノードとして upsert する。
   * index.html のベース @graph (WebSite / Organization / SoftwareApplication) には触れない。
   */
  jsonLd?: object | object[];
}

function inferImageMimeType(imageUrl: string): string | null {
  const normalized = imageUrl.split('#', 1)[0].split('?', 1)[0].toLowerCase();

  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.gif')) return 'image/gif';
  if (normalized.endsWith('.svg')) return 'image/svg+xml';

  return null;
}

/**
 * 指定のセレクタにマッチする `<meta>` / `<link>` の属性を更新する。
 * 存在しない場合は head 末尾に作成する（OGP/Twitter Card 用 fallback）。
 */
function upsertMeta(selector: string, create: () => HTMLElement, attr: string, value: string) {
  let el = document.querySelector(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

export const useSEO = (options: UseSEOOptions = {}) => {
  // オブジェクト identity ではなく内容で effect の再実行を判定する
  const jsonLdJson = options.jsonLd ? JSON.stringify(options.jsonLd) : undefined;

  useEffect(() => {
    // タイトルの設定
    if (options.title) {
      document.title = options.title;
      // OGP / Twitter title もタイトル変更に追従させる
      upsertMeta(
        'meta[property="og:title"]',
        () => {
          const m = document.createElement('meta');
          m.setAttribute('property', 'og:title');
          return m;
        },
        'content',
        options.title
      );
      upsertMeta(
        'meta[name="twitter:title"]',
        () => {
          const m = document.createElement('meta');
          m.setAttribute('name', 'twitter:title');
          return m;
        },
        'content',
        options.title
      );
    }

    // メタ説明の設定
    if (options.description) {
      upsertMeta(
        'meta[name="description"]',
        () => {
          const m = document.createElement('meta');
          m.setAttribute('name', 'description');
          return m;
        },
        'content',
        options.description
      );
      // OGP / Twitter description も追従
      upsertMeta(
        'meta[property="og:description"]',
        () => {
          const m = document.createElement('meta');
          m.setAttribute('property', 'og:description');
          return m;
        },
        'content',
        options.description
      );
      upsertMeta(
        'meta[name="twitter:description"]',
        () => {
          const m = document.createElement('meta');
          m.setAttribute('name', 'twitter:description');
          return m;
        },
        'content',
        options.description
      );
    }

    // robots meta (noindex) は SPA 内遷移で前ページの値が残らないよう常に明示する
    upsertMeta(
      'meta[name="robots"]',
      () => {
        const m = document.createElement('meta');
        m.setAttribute('name', 'robots');
        return m;
      },
      'content',
      options.noindex ? 'noindex' : 'index, follow'
    );

    // カノニカルURLの設定 (null は明示的な削除)。
    // canonical 設定時に同期している og:url も一緒に消し、
    // NotFound 等で前ページの URL を OGP が宣言し続けないようにする
    if (options.canonical === null) {
      document.querySelector('link[rel="canonical"]')?.remove();
      document.querySelector('meta[property="og:url"]')?.remove();
    }
    if (options.canonical) {
      upsertMeta(
        'link[rel="canonical"]',
        () => {
          const l = document.createElement('link');
          l.setAttribute('rel', 'canonical');
          return l;
        },
        'href',
        options.canonical
      );
      // og:url もカノニカルに合わせる
      upsertMeta(
        'meta[property="og:url"]',
        () => {
          const m = document.createElement('meta');
          m.setAttribute('property', 'og:url');
          return m;
        },
        'content',
        options.canonical
      );
    }

    // OG画像の設定
    if (options.ogImage) {
      upsertMeta(
        'meta[property="og:image"]',
        () => {
          const m = document.createElement('meta');
          m.setAttribute('property', 'og:image');
          return m;
        },
        'content',
        options.ogImage
      );

      const ogImageType = options.ogImageType ?? inferImageMimeType(options.ogImage);
      if (ogImageType) {
        upsertMeta(
          'meta[property="og:image:type"]',
          () => {
            const m = document.createElement('meta');
            m.setAttribute('property', 'og:image:type');
            return m;
          },
          'content',
          ogImageType
        );
      }

      upsertMeta(
        'meta[name="twitter:image"]',
        () => {
          const m = document.createElement('meta');
          m.setAttribute('name', 'twitter:image');
          return m;
        },
        'content',
        options.ogImage
      );
    }

    // ページ固有の構造化データ (data-page-jsonld ノードのみを管理し、ベース @graph には触れない)
    if (jsonLdJson) {
      let script = document.querySelector<HTMLScriptElement>(
        'script[type="application/ld+json"][data-page-jsonld]'
      );
      if (!script) {
        script = document.createElement('script');
        script.type = 'application/ld+json';
        script.setAttribute('data-page-jsonld', '');
        document.head.appendChild(script);
      }
      script.textContent = jsonLdJson;
    }
  }, [
    options.title,
    options.description,
    options.canonical,
    options.ogImage,
    options.ogImageType,
    options.noindex,
    jsonLdJson,
  ]);
};

/**
 * ページビューをGoogle Analyticsに送信（GA4対応）
 */
export const usePageView = (pageName?: string) => {
  useEffect(() => {
    // gtag関数が利用可能な場合のみ実行
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('config', GA_MEASUREMENT_ID, {
        page_title: pageName || document.title,
        page_location: window.location.href,
      });
    }
  }, [pageName]);
};

// グローバルなgtagの型定義
declare global {
  interface Window {
    gtag: (...args: any[]) => void;
  }
}
