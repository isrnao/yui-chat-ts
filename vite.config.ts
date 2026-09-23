import { defineConfig } from 'vitest/config';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';

/**
 * モジュールの ID から振り分け先のチャンク名を決める。
 * - 動的 import の補助関数は小さな専用チャンクに置く。振り分けないと Rolldown が遅延読み込み用の
 *   vendor チャンク（New Relic Browser エージェント）に同居させ、エントリがそれを静的に
 *   import → modulepreload してしまう
 * - node_modules はパッケージ単位の vendor チャンクにする（@supabase/* はまとめて vendor-supabase、
 *   react / react-dom / scheduler は vendor-react）
 */
function vendorChunkName(id: string): string | null {
  if (id.includes('vite/preload-helper')) return 'preload-helper';
  if (!id.includes('node_modules')) return null;

  const normalized = id.replace(/\\/g, '/');
  let remainder = normalized.split('node_modules/').pop();
  if (!remainder) return null;

  while (remainder.startsWith('.pnpm/')) {
    const nextIndex = remainder.indexOf('node_modules/');
    if (nextIndex === -1) return null;
    remainder = remainder.slice(nextIndex + 'node_modules/'.length);
  }

  const [first, second] = remainder.split('/').filter(Boolean);
  if (!first) return null;
  const baseName = first.startsWith('@') && second ? `${first.slice(1)}-${second}` : first;

  if (first === '@supabase' && second) return 'vendor-supabase';
  if (['react', 'react-dom', 'scheduler'].includes(baseName)) return 'vendor-react';
  return `vendor-${baseName.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

export default defineConfig({
  base: '/',
  // React Compiler は @vitejs/plugin-react v6 では babel オプションではなく
  // @rolldown/plugin-babel + reactCompilerPreset() で組み込む（公式手順）。
  // https://react.dev/learn/react-compiler/installation
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  build: {
    target: 'es2022',
    // プリレンダ時に「その URL が使うルートチャンク」を modulePreload するために必要。
    // ルート分割で生じる 1 往復ぶんの待ちを消す (scripts/prerender-rooms.ts)。
    manifest: true,
    modulePreload: {
      polyfill: false,
    },
    // SEO最適化のためのビルド設定
    rolldownOptions: {
      // Vite 8 (rolldown) は文字列プリセット ('recommended' 等) を型で受け付けないため、
      // Rollup 'recommended' プリセット相当をオブジェクト形式で明示する:
      //   - moduleSideEffects: true                (Rollup default)
      //   - propertyReadSideEffects: 'always'      (Rollup 'recommended' の true 相当、rolldown 表記)
      //   - unknownGlobalSideEffects: false        (Rollup 'recommended' の重要オプション、
      //                                             これがないと未知 global を副作用扱いし tree-shake が控えめになる)
      //   - annotations: true                      (/*@__PURE__*/ 等の hint を尊重)
      // tryCatchDeoptimization は rolldown 1.0.1 で未サポートのため省略。
      treeshake: {
        moduleSideEffects: true,
        propertyReadSideEffects: 'always',
        unknownGlobalSideEffects: false,
        annotations: true,
      },
      output: {
        // ファイル名にハッシュを含める（キャッシュ対策）
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        // チャンクの振り分け。Vite 8（Rolldown）で非推奨になった関数形式の manualChunks の代わりに
        // codeSplitting.groups を使う。name に関数を渡すと、戻り値ごとに別のチャンクになる
        // （null を返したモジュールはこのグループに入れず、自動の分割に任せる）
        codeSplitting: {
          groups: [{ name: vendorChunkName }],
        },
        // 本番では console.* の呼び出しと debugger を削除し、トップレベルの名前も短縮する
        minify: {
          compress: { dropConsole: true, dropDebugger: true },
          mangle: { toplevel: true },
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
    // 最小化は Vite 8 の既定の Oxc で行う（console / debugger の削除と toplevel の mangle は
    // rolldownOptions.output.minify で指定）。terser と比べて gzip の合計は −0.13%、
    // ビルドは 3.5 秒 → 2.0 秒だった（.kiro/specs/react-2026-refactoring Task 15.5）
    minify: 'oxc',
  },
  // パフォーマンス最適化
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@supabase/postgrest-js',
      '@supabase/realtime-js',
      '@supabase/functions-js',
    ],
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
