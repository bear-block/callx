// Expo config plugin for @bear-block/callx-livekit: lists the adapter factory in Info.plist so
// Callx's bootstrap finds it (ADR-0009). On Android the package manifest declares it; Expo's
// Android template already includes JitPack for LiveKit's AudioSwitch dependency.
const {withInfoPlist} = require('@expo/config-plugins');

const FACTORY = 'CallxLiveKitAdapterFactory';

module.exports = config => withInfoPlist(config, mod => {
  const factories = mod.modResults.CallxMediaAdapterFactories ?? [];
  if (!factories.includes(FACTORY)) mod.modResults.CallxMediaAdapterFactories = [...factories, FACTORY];
  return mod;
});
