import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  // src/content/**/*.mdx はアプリ用コンテンツ (利用規約等) で story ではないため除外
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)', '!../src/content/**/*.mdx'],
  // Storybook 10 で旧 @storybook/addon-essentials は廃止され、Controls / Actions /
  // Backgrounds / Viewport / Measure / Outline は core (storybook パッケージの
  // common-manager.js) に統合済み。よって addons には残る Docs のみを指定する。
  // (個別 @storybook/addon-controls 等は v9.0.8 で止まっており SB10 では使えない)
  addons: ['@storybook/addon-docs'],
  // Storybook 10 の addon-docs が独自に MDX を扱うため、vite.config.ts の
  // @mdx-js/rollup プラグインを Storybook 側ビルドからは除外する
  // (二重登録すると src/content/terms.mdx で FunctionDeclaration エラーが出る)
  async viteFinal(viteConfig) {
    if (viteConfig.plugins) {
      viteConfig.plugins = viteConfig.plugins.filter((plugin) => {
        if (
          plugin &&
          typeof plugin === 'object' &&
          'name' in plugin &&
          plugin.name === '@mdx-js/rollup'
        ) {
          return false;
        }
        return true;
      });
    }
    return viteConfig;
  },
};
export default config;
