import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';

export default defineConfig({
  base: '/yui-chat-ts/',
  plugins: [react(), mdx()],
  build: {
    target: 'es2022',
    modulePreload: {
      polyfill: false,
    },
    // SEO最適化のためのビルド設定
    rollupOptions: {
      treeshake: 'recommended',
      output: {
        // ファイル名にハッシュを含める（キャッシュ対策）
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          const normalized = id.replace(/\\/g, '/');
          const segments = normalized.split('node_modules/');
          let remainder = segments.pop();
          if (!remainder) return;

          while (remainder.startsWith('.pnpm/')) {
            const nextIndex = remainder.indexOf('node_modules/');
            if (nextIndex === -1) return;
            remainder = remainder.slice(nextIndex + 'node_modules/'.length);
          }

          const parts = remainder.split('/').filter(Boolean);
          if (parts.length === 0) return;
          const [first, second] = parts;

          const baseName = first.startsWith('@') && second ? `${first.slice(1)}-${second}` : first;

          if (first === '@supabase' && second) {
            return 'vendor-supabase';
          }

          if (['react', 'react-dom', 'scheduler'].includes(baseName)) {
            return 'vendor-react';
          }

          return `vendor-${baseName.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
        },
      },
    },
    // CSSコード分割を有効にしてパフォーマンス向上
    cssCodeSplit: true,
    cssMinify: 'lightningcss',
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
