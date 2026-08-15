const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../shared')];

// Worklets installs its globals as a side effect of being required, and Reanimated's
// own modules read them at import time. Expo defaults inlineRequires to false, which
// hoists those imports above the setup and leaves the globals undefined — the module
// throws before index.ts can register the root component, so the native shell reports
// "App entry not found" rather than the real error. Composed over the default so
// experimentalImportSupport survives.
// https://github.com/software-mansion/react-native-reanimated/issues/9445
const defaultGetTransformOptions = config.transformer.getTransformOptions;
config.transformer.getTransformOptions = async (...args) => {
  const options = await defaultGetTransformOptions(...args);
  return {
    ...options,
    transform: { ...options.transform, inlineRequires: true },
  };
};

module.exports = config;
