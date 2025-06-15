import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import prettier from "eslint-plugin-prettier";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "README.md",
      "src/*.css",
      "package.json",
      "tsconfig.app.json",
      "tsconfig.json",
      "tsconfig.node.json",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      prettier,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "prettier/prettier": "warn",
    },
  },
  {
    files: ["**/*.{js,ts,tsx,jsx,json,css,md}"],
    plugins: { prettier },
    rules: {
      "prettier/prettier": "warn",
    },
  },
  {
    files: ["**/*.mdx"],
    plugins: { mdx: require("eslint-plugin-mdx") },
    extends: ["plugin:mdx/recommended"],
    rules: {},
  },
);
