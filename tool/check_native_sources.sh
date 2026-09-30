#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
status=0
for package_dir in "$repo_dir/packages/flutter" "$repo_dir/packages/react-native"; do
  # Flutter keeps iOS sources in its Swift package layout; React Native uses ios/.
  case "$package_dir" in
    */flutter) core_dir=ios/callx/Sources/callx/CallxCore ;;
    *) core_dir=ios/CallxCore ;;
  esac
  diff -qr "$repo_dir/native/android/src/main/kotlin/dev/callx/core" \
    "$package_dir/android/src/main/kotlin/dev/callx/core" || status=1
  diff -qr "$repo_dir/native/android/telecom/src/main/kotlin/dev/callx/telecom" \
    "$package_dir/android/src/main/kotlin/dev/callx/telecom" || status=1
  diff -qr "$repo_dir/native/ios/Sources/CallxCore" "$package_dir/$core_dir" || status=1
done
# The examples share one media adapter; only the package line differs.
flutter_media="$repo_dir/packages/flutter/example/android/app/src/main/kotlin/dev/callx/preview/callx_flutter_example/LiveKitCallMedia.kt"
rn_media="$repo_dir/packages/react-native/example/device-host/android/LiveKitCallMedia.kt"
if [ "$(sed 1d "$flutter_media")" != "$(sed 1d "$rn_media")" ]; then
  echo "LiveKitCallMedia.kt differs between the Flutter and React Native examples"; status=1
fi
for file in LiveKitCallMedia.swift ConsoleReporter.swift; do
  cmp -s "$repo_dir/packages/flutter/example/ios/Runner/$file" "$repo_dir/packages/react-native/example/device-host/ios/$file" ||
    { echo "$file differs between the Flutter and React Native examples"; status=1; }
done
exit "$status"
