import {buildPlan, type Selection} from './plan.ts';

export type CodeFile = {name: string; language: string; purpose: string; code: string};
export function generateCode(selection: Selection, video: boolean) {
  const plan = buildPlan(selection);
  const files: CodeFile[] = [];
  if (plan.blockers.length) return {files, notes: plan.blockers};
  const dart = selection.framework === 'flutter';
  const livekit = selection.media === 'livekit';
  const android = selection.platform !== 'ios';
  const ios = selection.platform !== 'android';
  const add = (name: string, language: string, purpose: string, code: string) => files.push({name, language, purpose, code: code.trim() + '\n'});
  const notes = [
    'These are integration starter files, not a complete backend or a drop-in app. Apply the native checklist below and rebuild before calling setup.',
    'Keep one Callx instance per app. Native owns incoming presentation and media. Do not answer or join a second media room from an observation callback.',
    'Request microphone/notification permissions while the app is in use; request camera permission before an explicit camera action. Handle rejected command results in your UI.',
    'Register refreshed push tokens and refresh media credentials after sign-in/token rotation. End calls and reset credentials on sign-out; rotate the persisted native account generation.',
    selection.backend === 'local' ? 'Local mode uses the repository call console/LiveKit trial tools. It still requires real push credentials; pass its reachable token endpoint into startCalling. Do not ship development credentials.' : 'Supply an authenticated media-token endpoint and your own installation-token registration callback. Authentication, signaling and push delivery belong to your backend.',
    livekit ? 'Install and discover the native LiveKit adapter before bootstrap.' : 'Implement your native media adapter and install it during native bootstrap first. These files do not implement a media engine.',
    selection.ui === 'supplied' ? 'Presentation.dart/tsx takes observed native state and app callbacks. Update the presentation controller from each snapshot, rebuild on minimize/expand, and mount the overlay above navigation.' : 'Use the custom presentation builder with observed snapshots. Keep incoming calls on Home while the native presenter rings; show your accepted-call screen only after native acceptance.',
  ];
  if (selection.migration !== 'new') notes.push('Migration: route each installation to one call stack and payload format. Remove duplicate CallKit/Telecom/push/media ownership before switching; never switch stacks mid-call.');
  add('install.sh', 'sh', 'Run in your app directory.', plan.commands.join('\n'));
  if (dart) {
    add('calling.dart', 'dart', 'Initialize after native bootstrap and sign-in. Listen to callx.snapshots in your app; cancel subscriptions with their UI owner.', `
import 'package:callx/callx.dart';
${livekit ? "import 'package:callx_livekit/callx_livekit.dart';" : ''}

final callx = Callx();

Future<CallxCapabilities> startCalling({
  required Future<void> Function(String type, String token) registerPushToken,
${livekit ? '  required String tokenUrl,\n  required String sessionToken,' : ''}
}) async {
${livekit ? "  await CallxLiveKit.configure(LiveKitConfig(\n    tokenUrl: tokenUrl,\n    headers: {'authorization': 'Bearer $sessionToken'},\n  ));" : ''}
  final capabilities = await callx.setup();
  if (!capabilities.nativeCalling) throw StateError('Native calling unavailable');
  final token = await callx.pushToken();
  if (token != null) await registerPushToken(token.type, token.token);
  return capabilities;
}

// Explicit user actions only; inspect result.status/result.error in your UI.
Future<CommandResult> endCall(String callId) => callx.end(callId);
${video ? 'Future<CommandResult> setCamera(String callId, bool enabled) => callx.setCamera(callId, enabled);' : ''}
${livekit ? '\n// After ending active calls on sign-out:\nFuture<void> resetMediaCredentials() => CallxLiveKit.reset();' : ''}
`);
    add('presentation.dart', 'dart', 'A root presentation builder. Pass native snapshots and callbacks from your app; keep Home mounted.', `
import 'package:flutter/material.dart';
import 'package:callx/callx.dart';
${selection.ui === 'supplied' ? "import 'package:callx/callx_ui.dart';" : ''}

Widget buildCallPresentation({
  required Widget home,
  required Call? call,
${selection.ui === 'supplied' ? `  required CallPresentation mode,
  required VoidCallback minimize,
  required VoidCallback expand,
  required VoidCallback end,
  required bool nativeVideo,
  required String? error,
${video ? '  required VoidCallback toggleCamera,' : ''}` : '  required Widget Function(Call call) buildAcceptedCall,'}
}) {
  final active = call != null && call.state != CallState.incoming && call.state != CallState.ended;
${selection.ui === 'supplied' ? `  return CallxCallOverlay(
    onMinimize: minimize,
    expanded: active && mode == CallPresentation.expanded
      ? CallxCallScreen(call: call, onBack: minimize, nativeVideo: ${video ? 'nativeVideo' : 'false'}, error: error,
          controls: [TextButton(onPressed: end, child: const Text('End call'))${video ? ", TextButton(onPressed: toggleCamera, child: const Text('Toggle camera'))" : ''}])
      : null,
    minimized: active && mode == CallPresentation.minimized
      ? CallxMiniCall(displayName: call.displayName, onExpand: expand, onEnd: end) : null,
    child: home,
  );` : `  return Stack(children: [
    Positioned.fill(child: Offstage(offstage: active, child: home)),
    if (active) Positioned.fill(child: buildAcceptedCall(call)),
  ]);`}
}
`);
  } else {
    add('calling.ts', 'ts', 'Initialize after native bootstrap and sign-in. Subscribe with callx.observe; unsubscribe with the UI owner.', `
import {Callx} from '@bear-block/callx';
${livekit ? "import {configureLiveKit, resetLiveKit} from '@bear-block/callx-livekit';" : ''}

export const callx = new Callx();
export async function startCalling(options: {
  registerPushToken: (type: 'fcm' | 'voip', token: string) => Promise<void>;
${livekit ? '  tokenUrl: string;\n  sessionToken: string;' : ''}
}) {
${livekit ? '  await configureLiveKit({tokenUrl: options.tokenUrl,\n    headers: {authorization: `Bearer ${options.sessionToken}`}});' : ''}
  const capabilities = await callx.setup();
  if (!capabilities.nativeCalling) throw new Error('Native calling unavailable');
  const token = await callx.getPushToken();
  if (token) await options.registerPushToken(token.type, token.token);
  return capabilities;
}

// Explicit user actions only; inspect result.status/result.error in your UI.
export const endCall = (callId: string) => callx.end(callId);
${video ? 'export const setCamera = (callId: string, enabled: boolean) => callx.setCamera(callId, enabled);' : ''}
${livekit ? '\n// After ending active calls on sign-out:\nexport const resetMediaCredentials = () => resetLiveKit();' : ''}
`);
    add('Presentation.tsx', 'tsx', 'Mount above app navigation. Pass observed native state and app-owned command/error callbacks.', `
import React from 'react';
import {Button, View} from 'react-native';
import type {Call} from '@bear-block/callx';
${selection.ui === 'supplied' ? "import {CallxCallOverlay, CallxCallScreen, CallxMiniCall} from '@bear-block/callx/ui';\nimport type {CallPresentation} from '@bear-block/callx/presentation';" : ''}
${video && selection.ui === 'supplied' ? "import {CallxVideoView} from '@bear-block/callx/video';" : ''}

export function Presentation(p: {
  home: React.ReactNode; call: Call | null;
${selection.ui === 'supplied' ? `  mode: CallPresentation; minimize: () => void; expand: () => void; end: () => void;
  nativeVideo: boolean; error: string | null;
${video ? '  toggleCamera: () => void;' : ''}` : '  renderAcceptedCall: (call: Call) => React.ReactNode;'}
}) {
  const call = p.call;
  const active = call && call.state !== 'incoming' && call.state !== 'ended';
${selection.ui === 'supplied' ? `  return <CallxCallOverlay onMinimize={p.minimize}
    expanded={active && p.mode === 'expanded' ? <CallxCallScreen call={call}
      onBack={p.minimize} nativeVideo={${video ? 'p.nativeVideo' : 'false'}} error={p.error} elapsed={null} localControls={null}
      controls={<><Button title="End call" onPress={p.end}/>${video ? '<Button title="Toggle camera" onPress={p.toggleCamera}/>' : ''}</>}
      renderVideo={${video ? '(source, mirror) => <CallxVideoView callId={call.callId} source={source} mirror={mirror} fit="cover" style={{flex: 1}}/>' : '() => null'}}/> : undefined}
    minimized={active && p.mode === 'minimized' ? <CallxMiniCall displayName={call.displayName}
      onExpand={p.expand} onEnd={p.end}/> : undefined}>
    {p.home}
  </CallxCallOverlay>;` : `  return <View style={{flex: 1}}>
    <View style={{flex: 1, display: active ? 'none' : 'flex'}}>{p.home}</View>
    {active ? p.renderAcceptedCall(call) : null}
  </View>;`}
}
`);
  }
  if (selection.framework === 'expo') {
    add('app.config.ts', 'ts', 'Merge into your Expo configuration, then prebuild and rebuild. Supply your own identifiers and Firebase file.', `
import type {ExpoConfig} from 'expo/config';
const config: ExpoConfig = {
  name: 'My calling app', slug: 'my-calling-app',
  platforms: ${JSON.stringify([...(ios ? ['ios'] : []), ...(android ? ['android'] : [])])},
${android ? "  android: {package: 'com.example.calls', googleServicesFile: './google-services.json'}," : ''}
${ios ? "  ios: {bundleIdentifier: 'com.example.calls'}," : ''}
  plugins: [
    ['@bear-block/callx/app.plugin', ${JSON.stringify({iosVoip: ios, androidPush: android ? 'fcm' : 'none', androidNotifications: android, video, ...(video ? {cameraPermission: 'Share video during a call.'} : {})})}],
${livekit ? "    '@bear-block/callx-livekit/app.plugin'," : ''}
  ],
};
export default config;
`);
    if (!livekit) notes.push('Own-media Expo integration needs a native adapter or custom plugin/local module; generated Expo config alone cannot create that adapter.');
  } else {
    if (android) {
      add('AndroidManifest.fragment.xml', 'xml', 'Merge permissions under <manifest>. Add native bootstrap and FCM routing from the quick start; do not replace your existing manifest.', `
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
${video ? '<uses-permission android:name="android.permission.CAMERA" />\n<uses-feature android:name="android.hardware.camera" android:required="false" />' : ''}
`);
      add('Bootstrap.fragment.kt', 'kotlin', 'Merge into Application.onCreate after super, before any push; use your persisted account generation. Also configure the native FCM service from the quick start.', `
import dev.callx.${dart ? 'flutter.CallxPlugin' : 'reactnative.CallxModule'}
import dev.callx.telecom.CallxBootstrapConfig

// Inside Application.onCreate; propagate/report bootstrap failures.
${dart ? 'CallxPlugin' : 'CallxModule'}.bootstrap(this, CallxBootstrapConfig(
    accountGeneration = accountGenerationFromYourPersistedSignInState,
))
`);
      if (livekit) add('repositories.fragment.gradle.kts', 'kotlin', 'Merge into the app repository declarations; retain Google and Maven Central.', `
maven("https://jitpack.io") { content { includeGroup("com.github.davidliu") } }
`);
    }
    if (ios) {
      add('Info.plist.fragment.xml', 'xml', 'Merge into the root plist dictionary. Configure Push Notifications, audio/VoIP background modes and signing in Xcode.', `
<key>NSMicrophoneUsageDescription</key><string>Use the microphone during calls.</string>
${video ? '<key>NSCameraUsageDescription</key><string>Share video during a call.</string>' : ''}
${livekit ? '<key>CallxMediaAdapterFactories</key><array><string>CallxLiveKitAdapterFactory</string></array>' : ''}
`);
      add('Bootstrap.fragment.swift', 'swift', 'Merge before starting Flutter/RN in AppDelegate. Propagate/report failures; use your persisted account generation.', `
import ${dart ? 'callx' : 'callx_react_native'}

var configuration = CallxBootstrapConfig()
configuration.accountGeneration = accountGenerationFromYourPersistedSignInState
_ = try ${dart ? 'CallxPlugin' : 'CallxReactNativeHost'}.bootstrap(configuration)
`);
      if (dart && livekit) add('pubspec.fragment.yaml', 'yaml', 'Merge into the existing flutter section; required by LiveKit Swift.', `
flutter:
  config:
    enable-swift-package-manager: true
`);
    }
  }
  return {files, notes};
}
