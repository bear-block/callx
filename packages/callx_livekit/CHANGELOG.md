# Changelog

## 0.2.3 — 2026-10-04

- Version alignment with the core 0.2.3 release; no adapter/tool runtime changes.
- Breaking changes: none. Update core and adapter dependencies together.

## 0.2.2 — 2026-10-02

- Remote camera mute/unmute updates video availability and detaches the muted track from
  video views, allowing the host app to show local video or its branded fallback.
- Video: the adapter implements media adapter API 2. It publishes, switches and stops the camera,
  reports remote video and a camera paused in the background, and renders into `CallxVideoView`.
  The host declares the camera permission.

## 0.1.3

- Released with core 0.1.3, which fixes ringing on Android 10–12. No adapter changes.

## 0.1.1

- Smaller package: 0.1.0 accidentally included local build output (about 28 MB). No code changes.

## 0.1.0

- First public release. See the [package ecosystem decision](https://bear-block.github.io/callx/project/decisions).
