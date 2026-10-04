# Changelog

## 3.0.1 — 2026-10-04

- `--message end` and `--message accept` now send the production signal format under the
  `callx` key, which Callx 3.0.1+ applies natively (ADR-0014). Apps on 3.0.0 ignore it.

## 3.0.0 — 2026-10-04

- Version alignment with the core 3.0.0 release; no testkit behavior changes.

## 0.2.4 — 2026-10-04

- Version alignment with the core 0.2.4 release; no tool changes.

## 0.2.3 — 2026-10-04

- Version alignment with the core 0.2.3 release; no adapter/tool runtime changes.
- Breaking changes: none. Update core and adapter dependencies together.

## 0.2.2 — 2026-10-02

- Video: `callx-push --video` and the console's video option send video invitations, the caller
  publishes a camera, and `callx-conformance android --video` runs the video steps.

## 0.1.3

- `callx-push` and the call console send FCM invitations with a TTL equal to their lifetime
  instead of zero, so an invitation still arrives when the device's FCM connection is briefly
  down. Test signals use a 30-second TTL.

## 0.1.1

- `bin` paths no longer start with `./`, which npm rewrote at publish time. No code changes.

## 0.1.0

- First public release. See the [package ecosystem decision](https://bear-block.github.io/callx/project/decisions).
