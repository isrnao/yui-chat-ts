import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';

export default defineConfig({
  base: './',
  plugins: [react(), mdx()],
  build: {
    // SEO最適化のためのビルド設定
    rollupOptions: {
      output: {
        // ファイル名にハッシュを含める（キャッシュ対策）
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // CSSコード分割を有効にしてパフォーマンス向上
    cssCodeSplit: true,
    // ソースマップを本番環境では無効化
    sourcemap: false,
    // 最小化
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // console.logを本番環境では削除
        drop_debugger: true,
      },
    },
  },
  // パフォーマンス最適化
  optimizeDeps: {
    include: ['react', 'react-dom'],
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
        'node_modules',
        'dist',
        '**/*.d.ts',
        'src/vite-env.d.ts',
      ],
      all: true,
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
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
