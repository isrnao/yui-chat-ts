const path = require('path');

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        extensions: ['.ios.ts', '.android.ts', '.ts', '.tsx', '.js', '.jsx', '.json'],
        alias: {
          '@yui/shared': path.resolve(__dirname, '../../packages/shared/src'),
        },
      },
    ],
    'react-native-reanimated/plugin',
  ],
};
