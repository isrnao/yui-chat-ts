import { defineConfig } from 'vitest/config';
import type { Plugin, IndexHtmlTransformContext } from 'vite';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';

const inlineCriticalCss = (): Plugin => {
  const inlined = new Set<string>();

  return {
    name: 'inline-critical-css',
    apply: 'build',
    enforce: 'post',
    transformIndexHtml(html: string, ctx: IndexHtmlTransformContext) {
      if (!ctx?.bundle || !html.includes('<div id="root"></div>')) return html;
      let transformed = html;

      Object.entries(ctx.bundle).forEach(([fileName, asset]) => {
        const outputAsset = asset as { type?: string; source?: string | Uint8Array };
        if (outputAsset.type !== 'asset' || !fileName.endsWith('.css')) return;
        const source =
          typeof outputAsset.source === 'string'
            ? outputAsset.source
            : outputAsset.source?.toString();
        if (!source) return;

        const escapedFileName = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const linkPattern = new RegExp(`<link[^>]+href="[^"]*${escapedFileName}"[^>]*>`, 'i');
        if (linkPattern.test(transformed)) {
          transformed = transformed.replace(
            linkPattern,
            `<style data-inline="${fileName}">${source}</style>`
          );
          inlined.add(fileName);
        }
      });

      return transformed;
    },
    generateBundle(_: unknown, bundle: Record<string, { type?: string }>) {
      inlined.forEach((fileName) => {
        if (bundle[fileName]) {
          delete bundle[fileName];
        }
      });
    },
  };
};

export default defineConfig({
  base: '/yui-chat-ts/',
  plugins: [react(), mdx(), inlineCriticalCss()],
  build: {
    // SEO最適化のためのビルド設定
    rollupOptions: {
      output: {
        // ファイル名にハッシュを含める（キャッシュ対策）
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        // チャンク分割の最適化
        manualChunks: {
          vendor: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
    // CSSコード分割を有効にしてパフォーマンス向上
    cssCodeSplit: true,
    // ソースマップを本番環境では無効化
    sourcemap: false,
    // チャンクサイズ警告を500KBに設定
    chunkSizeWarningLimit: 500,
    // 最小化
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // console.logを本番環境では削除
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
        // 未使用コードの除去
        dead_code: true,
        unused: true,
      },
      mangle: {
        // 変数名の短縮（パフォーマンス向上）
        toplevel: true,
      },
    },
  },
  // パフォーマンス最適化
  optimizeDeps: {
    include: ['react', 'react-dom', '@supabase/supabase-js'],
    // 開発時の依存関係事前バンドル
    force: false,
  },
  // 開発サーバー最適化
  server: {
    // DNS プリフェッチ
    hmr: {
      overlay: false, // エラーオーバーレイを無効化（パフォーマンス向上）
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: [
      './src/**/*.test.ts',
      './src/**/*.test.tsx',
      './src/**/*.spec.tsx',
      './src/**/*.spec.ts',
    ],
    exclude: ['node_modules', 'dist', '**/*.d.ts', 'src/vite-env.d.ts'],
    coverage: {
      enabled: true,
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'html', 'json'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/test/**', // テスト用セットアップファイルなど
        'src/**/*.stories.*', // Storybook用
        'src/**/__mocks__/**', // テストモック
        'src/main.tsx', // アプリケーションエントリーポイント（テスト不要）
        'src/shared/supabaseClient.ts', // 設定ファイル（テスト不要）
        'src/**/index.ts', // エクスポートのみのファイル
        'src/shared/utils/clientInfo.ts', // クライアント情報（複雑なテスト不要）
        'src/features/chat/types.ts', // 型定義のみ
        'node_modules',
        'dist',
        '**/*.d.ts',
        'src/vite-env.d.ts',
      ],
      all: true,
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 50,
        statements: 50,
      },
    },
  },
  resolve: {
    alias: {
      '@features': '/src/features',
      '@shared': '/src/shared',
    },
  },
});
