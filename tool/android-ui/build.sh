#!/bin/sh
# Builds a separate test-only UI probe. It never instruments or restarts the call app.
set -eu
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
sdk_dir=${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}
output_dir=${1:-/tmp/callx-ui-probe}
keystore="$output_dir/debug.keystore"
build_tools="$sdk_dir/build-tools/36.0.0"
platform="$sdk_dir/platforms/android-36/android.jar"
mkdir -p "$output_dir/classes" "$output_dir/dex"
if [ ! -f "$keystore" ]; then
  keytool -genkeypair -keystore "$keystore" -storepass android -keypass android \
    -alias callx-ui-trial -keyalg RSA -keysize 2048 -validity 3650 \
    -dname "CN=Callx UI Trial" >/dev/null 2>&1
fi
javac -source 17 -target 17 -cp "$platform" -d "$output_dir/classes" "$source_dir/Dump.java"
jar cf "$output_dir/classes.jar" -C "$output_dir/classes" .
"$build_tools/d8" --lib "$platform" --min-api 29 --output "$output_dir/dex" "$output_dir/classes.jar"
"$build_tools/aapt2" link --manifest "$source_dir/AndroidManifest.xml" -I "$platform" -o "$output_dir/unsigned.apk"
(cd "$output_dir/dex" && zip -q -j "$output_dir/unsigned.apk" classes.dex)
"$build_tools/zipalign" -f 4 "$output_dir/unsigned.apk" "$output_dir/aligned.apk"
"$build_tools/apksigner" sign --ks "$keystore" \
  --ks-pass pass:android --key-pass pass:android --out "$output_dir/probe.apk" "$output_dir/aligned.apk"
printf '%s\n' "$output_dir/probe.apk"
