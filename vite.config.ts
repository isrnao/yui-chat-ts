import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';

export default defineConfig({
  plugins: [react(), mdx()],
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
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
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
