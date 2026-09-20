#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
status=0
for package_dir in "$repo_dir/packages/flutter" "$repo_dir/packages/react-native"; do
  diff -qr "$repo_dir/native/android/src/main/kotlin/dev/callx/core" \
    "$package_dir/android/src/main/kotlin/dev/callx/core" || status=1
  diff -qr "$repo_dir/native/android/telecom/src/main/kotlin/dev/callx/telecom" \
    "$package_dir/android/src/main/kotlin/dev/callx/telecom" || status=1
  diff -qr "$repo_dir/native/ios/Sources/CallxCore" "$package_dir/ios/CallxCore" || status=1
done
exit "$status"
