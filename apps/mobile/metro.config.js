const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(__dirname, '..', '..');
const sharedRoot = path.resolve(workspaceRoot, 'packages', 'shared');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  projectRoot,
  watchFolders: [workspaceRoot, sharedRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    extraNodeModules: {
      '@yui/shared': path.resolve(sharedRoot, 'src'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
