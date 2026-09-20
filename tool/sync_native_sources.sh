#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

for package_dir in "$repo_dir/packages/flutter" "$repo_dir/packages/react-native"; do
  mkdir -p "$package_dir/android/src/main/kotlin/dev/callx/core"
  mkdir -p "$package_dir/android/src/main/kotlin/dev/callx/telecom"
  mkdir -p "$package_dir/ios/CallxCore"
  cp "$repo_dir"/native/android/src/main/kotlin/dev/callx/core/*.kt \
    "$package_dir/android/src/main/kotlin/dev/callx/core/"
  cp "$repo_dir"/native/android/telecom/src/main/kotlin/dev/callx/telecom/*.kt \
    "$package_dir/android/src/main/kotlin/dev/callx/telecom/"
  cp "$repo_dir"/native/ios/Sources/CallxCore/*.swift "$package_dir/ios/CallxCore/"
done
