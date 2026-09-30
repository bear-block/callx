#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

for package_dir in "$repo_dir/packages/flutter" "$repo_dir/packages/react-native"; do
  # Flutter keeps iOS sources in its Swift package layout; React Native uses ios/.
  case "$package_dir" in
    */flutter) core_dir=ios/callx/Sources/callx/CallxCore ;;
    *) core_dir=ios/CallxCore ;;
  esac
  mkdir -p "$package_dir/android/src/main/kotlin/dev/callx/core"
  mkdir -p "$package_dir/android/src/main/kotlin/dev/callx/telecom"
  mkdir -p "$package_dir/$core_dir"
  cp "$repo_dir"/native/android/src/main/kotlin/dev/callx/core/*.kt \
    "$package_dir/android/src/main/kotlin/dev/callx/core/"
  cp "$repo_dir"/native/android/telecom/src/main/kotlin/dev/callx/telecom/*.kt \
    "$package_dir/android/src/main/kotlin/dev/callx/telecom/"
  cp "$repo_dir"/native/ios/Sources/CallxCore/*.swift "$package_dir/$core_dir/"
done

# Adapters: canonical sources in adapters/<provider>/native, vendored into each adapter package.
for provider_dir in "$repo_dir"/adapters/*; do
  provider=$(basename "$provider_dir")
  kotlin_package=$(ls "$provider_dir/native/android/src/main/kotlin/dev/callx")
  swift_package=$(basename "$(ls -d "$provider_dir"/native/ios/*/ | head -1)")
  for package_dir in "$repo_dir/packages/react-native-$provider" "$repo_dir/packages/flutter-$provider"; do
    [ -d "$package_dir" ] || continue
    case "$package_dir" in
      */flutter-*) swift_dir=ios/callx_$provider/Sources/callx_$provider/$swift_package ;;
      *) swift_dir=ios/$swift_package ;;
    esac
    mkdir -p "$package_dir/android/src/main/kotlin/dev/callx/$kotlin_package" "$package_dir/$swift_dir"
    cp "$provider_dir"/native/android/src/main/kotlin/dev/callx/"$kotlin_package"/*.kt \
      "$package_dir/android/src/main/kotlin/dev/callx/$kotlin_package/"
    cp "$provider_dir/native/android/src/main/AndroidManifest.xml" "$package_dir/android/src/main/AndroidManifest.xml"
    cp "$provider_dir"/native/ios/"$swift_package"/Sources/"$swift_package"/*.swift "$package_dir/$swift_dir/"
  done
done
