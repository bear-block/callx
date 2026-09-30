#!/bin/sh
# Runs every test suite in the repository and prints a summary. Keeps going after a failure.
#
#   npm run test:all            all suites
#   npm run test:all -- quick   skip the native Android and iOS suites (the Simulator run takes minutes)
set -u

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_dir" || exit 1
flutter_cmd="flutter"; command -v fvm >/dev/null 2>&1 && flutter_cmd="fvm flutter"
passed=""; failed=""

step() {
  name=$1; shift
  printf '\n\033[1m▶ %s\033[0m\n' "$name"
  if (eval "$@"); then passed="$passed\n  ✔ $name"; else failed="$failed\n  ✘ $name"; fi
}

step "tools, testkit and reference model" "npm test"
step "contract fixtures" "npm run -s contract:test"
step "typecheck" "npm run -s typecheck"
step "native source parity" "npm run -s native:check"
if [ "${1:-}" != "quick" ]; then
  step "native Android (Kotlin, core and adapters)" "npm run -s native:android:test"
  step "native iOS (Swift)" "npm run -s native:ios:test"
  step "native iOS on the Simulator (CallKit, PushKit)" "npm run -s native:ios:simulator-test"
  step "LiveKit adapter on the Simulator" "sh tool/ios-simulator-test.sh adapters/livekit/native/ios/CallxLiveKit CallxLiveKit"
fi
step "Flutter analyze" "cd packages/callx && $flutter_cmd analyze"
step "Flutter tests" "cd packages/callx && $flutter_cmd test"
step "React Native tests" "cd packages/react-native && npm test"
step "Flutter LiveKit adapter tests" "cd packages/callx_livekit && $flutter_cmd test"
step "React Native LiveKit adapter tests" "cd packages/react-native-livekit && npm test"
step "React Native example typecheck" "cd packages/react-native/example && npx tsc --noEmit"

printf '\n\033[1mSummary\033[0m'
[ -n "$passed" ] && printf "$passed"
[ -n "$failed" ] && printf "$failed"
printf '\n'
[ -z "$failed" ]
