// Expo config plugin for @bear-block/callx-livekit (ADR-0009).
// - Lists the adapter factory in Info.plist so Callx's bootstrap finds it. On Android the
//   package manifest declares it; Expo's Android template already includes JitPack for
//   LiveKit's AudioSwitch dependency.
// - Embeds LiveKit's dynamic binary frameworks (LiveKitWebRTC, RustLiveKitUniFFI) in the app.
//   The pod links LiveKit through React Native's spm_dependency, which builds those frameworks
//   into the build products but embeds them nowhere; linking LiveKit into the app target too
//   would duplicate its symbols.
const {withInfoPlist, withXcodeProject} = require('@expo/config-plugins');

const FACTORY = 'CallxLiveKitAdapterFactory';
const PHASE = 'Embed LiveKit frameworks (callx-livekit)';
const EMBED_SCRIPT = [
  'set -e',
  'for name in LiveKitWebRTC RustLiveKitUniFFI; do',
  '  source="${BUILT_PRODUCTS_DIR}/${name}.framework"',
  '  [ -d "$source" ] || { echo "error: ${name}.framework was not built; is callx-livekit installed?"; exit 1; }',
  '  destination="${TARGET_BUILD_DIR}/${FRAMEWORKS_FOLDER_PATH}"',
  '  mkdir -p "$destination"',
  '  rsync -a --delete "$source" "$destination/"',
  '  if [ -n "${EXPANDED_CODE_SIGN_IDENTITY:-}" ]; then',
  '    codesign --force --sign "${EXPANDED_CODE_SIGN_IDENTITY}" --preserve-metadata=identifier,entitlements "$destination/${name}.framework"',
  '  fi',
  'done',
].join('\n');

/** Adds the embed phase to the app target once. */
function addEmbedPhase(project) {
  const phases = project.hash.project.objects.PBXShellScriptBuildPhase ?? {};
  if (Object.values(phases).some(phase => phase?.name === `"${PHASE}"`)) return;
  project.addBuildPhase([], 'PBXShellScriptBuildPhase', PHASE, project.getFirstTarget().uuid,
    {shellPath: '/bin/sh', shellScript: EMBED_SCRIPT});
}

module.exports = config => {
  config = withInfoPlist(config, mod => {
    const factories = mod.modResults.CallxMediaAdapterFactories ?? [];
    if (!factories.includes(FACTORY)) mod.modResults.CallxMediaAdapterFactories = [...factories, FACTORY];
    return mod;
  });
  return withXcodeProject(config, mod => {
    addEmbedPhase(mod.modResults);
    return mod;
  });
};
