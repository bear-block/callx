export default {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        packageImportPath: 'import dev.callx.livekit.reactnative.CallxLiveKitPackage;',
        packageInstance: 'new CallxLiveKitPackage()',
      },
      ios: {podspecPath: './callx-livekit.podspec'},
    },
  },
};
