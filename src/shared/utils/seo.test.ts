import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  updatePageTitle,
  updateMetaDescription,
  updateStructuredData,
  defaultSEOMetadata,
} from './seo';

// DOM要素のモック
const createMockElement = (tagName: string, attributes: Record<string, string> = {}) => {
  const element = {
    tagName: tagName.toUpperCase(),
    setAttribute: vi.fn(),
    getAttribute: vi.fn(),
    textContent: '',
    ...attributes,
  };
  return element;
};

// documentのモック
const mockDocument = {
  title: '',
  querySelector: vi.fn(),
  createElement: vi.fn(),
  head: {
    appendChild: vi.fn(),
  },
};

describe('SEO Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // documentをモック
    Object.defineProperty(global, 'document', {
      value: mockDocument,
      writable: true,
    });
    mockDocument.title = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('updatePageTitle', () => {
    it('should set document title with provided title', () => {
      const testTitle = 'テストページ';

      updatePageTitle(testTitle);

      expect(mockDocument.title).toBe(testTitle);
    });

    it('should set default title when no title is provided', () => {
      updatePageTitle();

      expect(mockDocument.title).toBe(defaultSEOMetadata.title);
    });

    it('should set default title when empty string is provided', () => {
      updatePageTitle('');

      expect(mockDocument.title).toBe(defaultSEOMetadata.title);
    });

    it('should not execute when document is undefined (SSR)', () => {
      // documentを未定義に設定
      Object.defineProperty(global, 'document', {
        value: undefined,
        writable: true,
      });

      expect(() => updatePageTitle('test')).not.toThrow();
    });
  });

  describe('updateMetaDescription', () => {
    it('should update existing meta description', () => {
      const testDescription = 'テスト説明文';
      const mockMetaElement = createMockElement('meta');
      mockDocument.querySelector.mockReturnValue(mockMetaElement);

      updateMetaDescription(testDescription);

      expect(mockDocument.querySelector).toHaveBeenCalledWith('meta[name="description"]');
      expect(mockMetaElement.setAttribute).toHaveBeenCalledWith('content', testDescription);
    });

    it('should use default description when no description is provided', () => {
      const mockMetaElement = createMockElement('meta');
      mockDocument.querySelector.mockReturnValue(mockMetaElement);

      updateMetaDescription();

      expect(mockMetaElement.setAttribute).toHaveBeenCalledWith(
        'content',
        defaultSEOMetadata.description
      );
    });

    it('should use default description when empty string is provided', () => {
      const mockMetaElement = createMockElement('meta');
      mockDocument.querySelector.mockReturnValue(mockMetaElement);

      updateMetaDescription('');

      expect(mockMetaElement.setAttribute).toHaveBeenCalledWith(
        'content',
        defaultSEOMetadata.description
      );
    });

    it('should not execute when meta description element does not exist', () => {
      mockDocument.querySelector.mockReturnValue(null);

      expect(() => updateMetaDescription('test')).not.toThrow();
      expect(mockDocument.querySelector).toHaveBeenCalledWith('meta[name="description"]');
    });

    it('should not execute when document is undefined (SSR)', () => {
      Object.defineProperty(global, 'document', {
        value: undefined,
        writable: true,
      });

      expect(() => updateMetaDescription('test')).not.toThrow();
    });
  });

  describe('updateStructuredData', () => {
    it('should update structured data with provided data', () => {
      const testData = {
        title: 'テストタイトル',
        description: 'テスト説明',
        keywords: ['テスト', 'キーワード'],
      };

      const mockScript = createMockElement('script', {
        textContent: JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebSite' }),
      });
      mockDocument.querySelector.mockReturnValue(mockScript);

      updateStructuredData(testData);

      expect(mockDocument.querySelector).toHaveBeenCalledWith('script[type="application/ld+json"]');

      const expectedData = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: testData.title,
        description: testData.description,
        keywords: testData.keywords.join(','),
      };
      expect(mockScript.textContent).toBe(JSON.stringify(expectedData, null, 2));
    });

    it('should use default values when data properties are not provided', () => {
      const mockScript = createMockElement('script', {
        textContent: JSON.stringify({ '@context': 'https://schema.org' }),
      });
      mockDocument.querySelector.mockReturnValue(mockScript);

      updateStructuredData({});

      const expectedData = {
        '@context': 'https://schema.org',
        name: defaultSEOMetadata.title,
        description: defaultSEOMetadata.description,
        keywords: defaultSEOMetadata.keywords.join(','),
      };
      expect(mockScript.textContent).toBe(JSON.stringify(expectedData, null, 2));
    });

    it('should handle partial data updates', () => {
      const mockScript = createMockElement('script', {
        textContent: JSON.stringify({
          '@context': 'https://schema.org',
          existingProperty: 'existingValue',
        }),
      });
      mockDocument.querySelector.mockReturnValue(mockScript);

      updateStructuredData({ title: 'Only Title' });

      const expectedData = {
        '@context': 'https://schema.org',
        existingProperty: 'existingValue',
        name: 'Only Title',
        description: defaultSEOMetadata.description,
        keywords: defaultSEOMetadata.keywords.join(','),
      };
      expect(mockScript.textContent).toBe(JSON.stringify(expectedData, null, 2));
    });

    it('should handle empty structured data script', () => {
      const mockScript = createMockElement('script', { textContent: '' });
      mockDocument.querySelector.mockReturnValue(mockScript);

      updateStructuredData({ title: 'Test Title' });

      const expectedData = {
        name: 'Test Title',
        description: defaultSEOMetadata.description,
        keywords: defaultSEOMetadata.keywords.join(','),
      };
      expect(mockScript.textContent).toBe(JSON.stringify(expectedData, null, 2));
    });

    it('should handle invalid JSON in structured data script', () => {
      const mockScript = createMockElement('script', { textContent: 'invalid json' });
      mockDocument.querySelector.mockReturnValue(mockScript);

      updateStructuredData({ title: 'Test Title' });

      // 無効なJSONの場合は新しいデータで置き換えられる
      const expectedData = {
        name: 'Test Title',
        description: defaultSEOMetadata.description,
        keywords: defaultSEOMetadata.keywords.join(','),
      };
      expect(mockScript.textContent).toBe(JSON.stringify(expectedData, null, 2));
    });

    it('should not execute when structured data script does not exist', () => {
      mockDocument.querySelector.mockReturnValue(null);

      expect(() => updateStructuredData({ title: 'test' })).not.toThrow();
      expect(mockDocument.querySelector).toHaveBeenCalledWith('script[type="application/ld+json"]');
    });

    it('should not execute when document is undefined (SSR)', () => {
      Object.defineProperty(global, 'document', {
        value: undefined,
        writable: true,
      });

      expect(() => updateStructuredData({ title: 'test' })).not.toThrow();
    });
  });

  describe('defaultSEOMetadata', () => {
    it('should have all required properties', () => {
      expect(defaultSEOMetadata).toHaveProperty('title');
      expect(defaultSEOMetadata).toHaveProperty('description');
      expect(defaultSEOMetadata).toHaveProperty('keywords');
      expect(defaultSEOMetadata).toHaveProperty('ogImage');
      expect(defaultSEOMetadata).toHaveProperty('canonical');
    });

    it('should have correct default values', () => {
      expect(defaultSEOMetadata.title).toBe('ゆいちゃっと - 無料お気楽チャット');
      expect(defaultSEOMetadata.description).toContain('ゆいちゃっとは放課後学生タウンの雰囲気');
      expect(Array.isArray(defaultSEOMetadata.keywords)).toBe(true);
      expect(defaultSEOMetadata.keywords.length).toBeGreaterThan(0);
      expect(defaultSEOMetadata.ogImage).toBe('/og-image.png');
      expect(defaultSEOMetadata.canonical).toBe('https://isrnao.github.io/yui-chat-ts/');
    });
  });
});
