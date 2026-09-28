// The library is linked from `..` (file: dependency), so Metro resolves its imports from the
// real path, where react-native is not installed. Resolve them from this app's node_modules.
const path = require('node:path');
const {getDefaultConfig} = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

module.exports = config;
