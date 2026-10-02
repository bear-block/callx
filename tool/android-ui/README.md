# Example UI and PiP trial

The UI probe reads fresh accessibility windows without waiting for a call timer to become
idle. It runs in its own test package, `dev.callx.trial.ui`, so reading the UI does not restart
or instrument the example app. The smoke driver uses labels from each fresh dump, explicit
device serials, native window state, camera logs and screenshots of changing video frames.

Install either the Flutter debug example or the RN release example on the emulator. Grant
camera, microphone and notification permissions. Start the local call console and LiveKit
server, then run from the repository root:

```sh
sh tool/android-ui/build.sh
node tool/pip-smoke.mjs --device emulator-5556 --output /tmp/callx-pip-trial \
  --dismiss true --fallback true
```

The probe build uses JDK 17+, Android SDK platform/build-tools 36 and a disposable debug key
created in its output directory. It does not require generating the RN Android project.
The trial supports Android API 29+. It restarts the installed **example app** before a call,
answers its notification, and ends the test call afterward. Both examples share the package
name, so install and test them one at a time.

`result.json` records the activity, OS, checks and failure reason. Screenshots and `logcat.txt`
are stored in the chosen output directory; review logs for local tokens before sharing them.
This is a local incoming-video UI trial, separate from FCM conformance and physical-device
acceptance. Below Android 12 it checks that automatic entry remains disabled.
