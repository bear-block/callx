#!/bin/sh
# Local LiveKit server for device trials (Docker, --dev keys devkey/secret).
#
#   npm run media:server             advertises 127.0.0.1: emulators over adb reverse, the Simulator
#   npm run media:server -- --lan    advertises this Mac's network address, for an iPhone or phone
set -eu
ip=127.0.0.1
if [ "${1:-}" = "--lan" ]; then
  ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
  [ -n "$ip" ] || { echo "No network address found on en0 or en1."; exit 1; }
  echo "LiveKit advertises $ip. Start the console with: npm run call:console -- --host 0.0.0.0"
fi
exec docker run --rm --name callx-livekit -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
  livekit/livekit-server:v1.13.7 --dev --bind 0.0.0.0 --node-ip "$ip"
