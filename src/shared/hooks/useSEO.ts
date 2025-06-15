import { useEffect } from 'react';

/**
 * SEO用のメタデータを動的に設定するためのカスタムフック
 */
export interface UseSEOOptions {
  title?: string;
  description?: string;
  keywords?: string[];
  canonical?: string;
  ogImage?: string;
}

export const useSEO = (options: UseSEOOptions = {}) => {
  useEffect(() => {
    // タイトルの設定
    if (options.title) {
      document.title = options.title;
    }

    // メタ説明の設定
    if (options.description) {
      let metaDescription = document.querySelector('meta[name="description"]');
      if (!metaDescription) {
        metaDescription = document.createElement('meta');
        metaDescription.setAttribute('name', 'description');
        document.head.appendChild(metaDescription);
      }
      metaDescription.setAttribute('content', options.description);
    }

    // キーワードの設定
    if (options.keywords && options.keywords.length > 0) {
      let metaKeywords = document.querySelector('meta[name="keywords"]');
      if (!metaKeywords) {
        metaKeywords = document.createElement('meta');
        metaKeywords.setAttribute('name', 'keywords');
        document.head.appendChild(metaKeywords);
      }
      metaKeywords.setAttribute('content', options.keywords.join(','));
    }

    // カノニカルURLの設定
    if (options.canonical) {
      let canonicalLink = document.querySelector('link[rel="canonical"]');
      if (!canonicalLink) {
        canonicalLink = document.createElement('link');
        canonicalLink.setAttribute('rel', 'canonical');
        document.head.appendChild(canonicalLink);
      }
      canonicalLink.setAttribute('href', options.canonical);
    }

    // OG画像の設定
    if (options.ogImage) {
      const ogImageMeta = document.querySelector('meta[property="og:image"]');
      if (ogImageMeta) {
        ogImageMeta.setAttribute('content', options.ogImage);
      }

      const twitterImageMeta = document.querySelector('meta[property="twitter:image"]');
      if (twitterImageMeta) {
        twitterImageMeta.setAttribute('content', options.ogImage);
      }
    }

    // 構造化データの更新
    const structuredDataScript = document.querySelector('script[type="application/ld+json"]');
    if (structuredDataScript && (options.title || options.description)) {
      try {
        const data = JSON.parse(structuredDataScript.textContent || '{}');
        if (options.title) data.name = options.title;
        if (options.description) data.description = options.description;
        if (options.keywords) data.keywords = options.keywords.join(',');
        structuredDataScript.textContent = JSON.stringify(data, null, 2);
      } catch (error) {
        console.warn('Failed to update structured data:', error);
      }
    }
  }, [options.title, options.description, options.keywords, options.canonical, options.ogImage]);
};

/**
 * ページビューをGoogle Analyticsに送信（GA4対応）
 */
export const usePageView = (pageName?: string) => {
  useEffect(() => {
    // gtag関数が利用可能な場合のみ実行
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('config', 'GA_MEASUREMENT_ID', {
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
