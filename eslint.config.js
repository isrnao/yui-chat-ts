import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-plugin-prettier';
import parserTypeScript from '@typescript-eslint/parser';

export default [
  {
    ignores: [
      'dist',
      'coverage',
      'docs',
      '**/*.mdx',
      'README.md',
      'package.json',
      'tsconfig*.json',
      '*.md',
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
    files: ['**/*.{js,ts,tsx,jsx,md}'],
    plugins: { prettier },
    rules: {
      'prettier/prettier': 'warn',
    },
  },
];
