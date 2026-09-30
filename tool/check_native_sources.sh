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
cmp -s "$repo_dir/packages/flutter/example/ios/Runner/ConsoleReporter.swift" \
  "$repo_dir/packages/react-native/example/device-host/ios/ConsoleReporter.swift" ||
  { echo "ConsoleReporter.swift differs between the Flutter and React Native examples"; status=1; }
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
    for file in "$provider_dir"/native/android/src/main/kotlin/dev/callx/"$kotlin_package"/*.kt; do
      cmp -s "$file" "$package_dir/android/src/main/kotlin/dev/callx/$kotlin_package/$(basename "$file")" ||
        { echo "$(basename "$file") differs in $package_dir"; status=1; }
    done
    cmp -s "$provider_dir/native/android/src/main/AndroidManifest.xml" "$package_dir/android/src/main/AndroidManifest.xml" ||
      { echo "AndroidManifest.xml differs in $package_dir"; status=1; }
    diff -q "$provider_dir/native/ios/$swift_package/Sources/$swift_package" "$package_dir/$swift_dir" >/dev/null ||
      { echo "Swift sources differ in $package_dir"; status=1; }
  done
done
exit "$status"
