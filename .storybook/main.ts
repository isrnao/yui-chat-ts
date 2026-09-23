import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  // Storybook 10 で旧 @storybook/addon-essentials は廃止され、Controls / Actions /
  // Backgrounds / Viewport / Measure / Outline は core (storybook パッケージの
  // common-manager.js) に統合済み。よって addons には残る Docs のみを指定する。
  // (個別 @storybook/addon-controls 等は v9.0.8 で止まっており SB10 では使えない)
  addons: ['@storybook/addon-docs'],
};
export default config;
