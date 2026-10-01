# Changelog

## Unreleased

- `callx-push` and the call console send FCM invitations with a TTL equal to their lifetime
  instead of zero, so an invitation still arrives when the device's FCM connection is briefly
  down. Test signals use a 30-second TTL.

## 0.1.1

- `bin` paths no longer start with `./`, which npm rewrote at publish time. No code changes.

## 0.1.0

- First public release. See the [package ecosystem decision](https://bear-block.github.io/callx/project/decisions).
