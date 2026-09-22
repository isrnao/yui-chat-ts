// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from 'eslint-plugin-storybook';

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-plugin-prettier';
import parserTypeScript from '@typescript-eslint/parser';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      'dist',
      'dist-ssr',
      'coverage',
      'docs',
      'storybook-static',
      'supabase/functions',
      '**/*.md',
      'README.md',
      'package.json',
      'tsconfig*.json',
      '.kiro',
    ],
  },
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      parser: parserTypeScript,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        React: 'readonly',
      },
      ecmaVersion: 2020,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      prettier,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'prettier/prettier': 'warn',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    // 型情報を使うルール（.kiro/specs/react-2026-refactoring Requirement 11）。
    // await し忘れた Promise や、async 関数を onClick / onSubmit へそのまま渡す誤りを
    // レビューの前に見つける。意図して投げっぱなしにするときは `void` を付け、
    // 失敗しうるなら `.catch` で受け取る。
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', '**/*.stories.{ts,tsx}', 'src/test/**', 'src/storybook/**'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['**/*.test.{js,ts,jsx,tsx}'],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {},
  },
  {
    files: ['**/*.{js,ts,tsx,jsx}'],
    plugins: { prettier },
    rules: {
      'prettier/prettier': 'warn',
    },
  },
  ...storybook.configs['flat/recommended'],
];
