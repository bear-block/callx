#!/bin/sh
# Local development artifacts only: this does not publish to any remote registry.
set -eu
repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
case "${1:-}" in
  android)
    "$repo_dir/native/android/gradlew" -p "$repo_dir/native/android" \
      -PcallxIncludeLiveKit=false publishAllPublicationsToNativeDevelopmentRepository
    "$repo_dir/native/android/gradlew" -p "$repo_dir/native/consumers/android" assembleDebug
    ;;
  ios)
    cd "$repo_dir/native/consumers/swift"
    xcodebuild -scheme CallxNativeConsumer -destination 'generic/platform=iOS Simulator' \
      -derivedDataPath "$repo_dir/build/native-consumer-ios" CODE_SIGNING_ALLOWED=NO build
    ;;
  *) echo "Usage: sh tool/check-native-packaging.sh android|ios" >&2; exit 2 ;;
esac
