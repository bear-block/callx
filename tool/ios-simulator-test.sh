#!/bin/sh
# Runs the CallxCore tests on an iOS Simulator, including the CallKit and PushKit tests that
# `swift test` skips on macOS. Uses the first available iPhone simulator.
set -eu
repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
id=$(xcrun simctl list devices available --json | node -e '
  const { devices } = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const phone = Object.values(devices).flat().find((d) => d.name.startsWith("iPhone"));
  if (!phone) process.exit(1); console.log(phone.udid);') || { echo "No iPhone simulator available."; exit 1; }
cd "$repo_dir/native/ios"
xcodebuild -scheme CallxCore -destination "platform=iOS Simulator,id=$id" \
  -derivedDataPath "${TMPDIR:-/tmp}/callx-ios-tests" -parallel-testing-enabled NO \
  CODE_SIGNING_ALLOWED=NO -quiet test
