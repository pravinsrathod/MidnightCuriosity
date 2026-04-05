const { getDefaultConfig } = require('@expo/metro-config');

const config = getDefaultConfig(__dirname);

// Explicitly prioritize 'react-native' to ensure Firebase correctly picks up the RN bundle
// This resolves the "Component auth has not been registered yet" error in SDK 54
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];
config.resolver.sourceExts.push('cjs');
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
