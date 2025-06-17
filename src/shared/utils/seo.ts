/**
 * SEO用のメタデータ管理
 */

export interface SEOMetadata {
  title: string;
  description: string;
  keywords: string[];
  ogImage?: string;
  canonical?: string;
}

export const defaultSEOMetadata: SEOMetadata = {
  title: 'ゆいちゃっと - 無料お気楽チャット',
  description:
    'ゆいちゃっとは放課後学生タウンの雰囲気を楽しめる無料のお気楽チャットです。リアルタイムでみんなとおしゃべりを楽しもう！ブラウザですぐに使える簡単チャット。',
  keywords: [
    'ゆいちゃっと',
    '放課後学生タウン',
    'お気楽チャット',
    '無料チャット',
    'ブラウザチャット',
    'リアルタイムチャット',
    '学生チャット',
    'オンラインチャット',
  ],
  ogImage: '/og-image.png',
  canonical: 'https://isrnao.github.io/yui-chat-ts/',
};

/**
 * ページタイトルを設定
 */
export const updatePageTitle = (title?: string) => {
  if (typeof document !== 'undefined') {
    document.title = title || defaultSEOMetadata.title;
  }
};

/**
 * メタ説明を設定
 */
export const updateMetaDescription = (description?: string) => {
  if (typeof document !== 'undefined') {
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', description || defaultSEOMetadata.description);
    }
  }
};

/**
 * 構造化データを更新
 */
export const updateStructuredData = (data: Partial<SEOMetadata>) => {
  if (typeof document !== 'undefined') {
    const structuredDataScript = document.querySelector('script[type="application/ld+json"]');
    if (structuredDataScript) {
      try {
        const currentData = JSON.parse(structuredDataScript.textContent || '{}');
        const updatedData = {
          ...currentData,
          name: data.title || defaultSEOMetadata.title,
          description: data.description || defaultSEOMetadata.description,
          keywords: data.keywords?.join(',') || defaultSEOMetadata.keywords.join(','),
        };
        structuredDataScript.textContent = JSON.stringify(updatedData, null, 2);
      } catch (error) {
        console.warn('Failed to parse structured data JSON:', error);
        // 無効なJSONの場合は新しいデータで置き換える
        const newData = {
          name: data.title || defaultSEOMetadata.title,
          description: data.description || defaultSEOMetadata.description,
          keywords: data.keywords?.join(',') || defaultSEOMetadata.keywords.join(','),
        };
        structuredDataScript.textContent = JSON.stringify(newData, null, 2);
      }
    }
  }
};
