#!/bin/sh
# Runs the CallxCore tests on an iOS Simulator, including the CallKit and PushKit tests that
# `swift test` skips on macOS. Uses the first available iPhone simulator.
#   sh tool/ios-simulator-test.sh [package-dir scheme]
set -eu
repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
id=$(xcrun simctl list devices available --json | node -e '
  const { devices } = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const phone = Object.values(devices).flat().find((d) => d.name.startsWith("iPhone"));
  if (!phone) process.exit(1); console.log(phone.udid);') || { echo "No iPhone simulator available."; exit 1; }
# Optional: a package directory and scheme, for adapters. Defaults to the core.
cd "$repo_dir/${1:-native/ios}"
scheme=${2:-CallxCore}
output_dir=${CALLX_IOS_TEST_OUTPUT_DIR:-${TMPDIR:-/tmp}/callx-ios-results}
mkdir -p "$output_dir"
result_dir=$(mktemp -d "$output_dir/$scheme.XXXXXX")
echo "Simulator test evidence: $result_dir"
if xcodebuild -scheme "$scheme" -destination "platform=iOS Simulator,id=$id" \
  -derivedDataPath "${TMPDIR:-/tmp}/callx-ios-tests-${2:-CallxCore}" -parallel-testing-enabled NO \
  -resultBundlePath "$result_dir/result.xcresult" CODE_SIGNING_ALLOWED=NO test \
  > "$result_dir/xcodebuild.log" 2>&1; then
  cat "$result_dir/xcodebuild.log"
else
  status=$?
  cat "$result_dir/xcodebuild.log"
  exit "$status"
fi
