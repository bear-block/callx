```sh
# Android: a Firebase service account and the FCM token from getPushToken() / pushToken()
npx -p @bear-block/callx-testkit callx-push android \
  --service-account firebase-adminsdk.json --token <FCM token>

# iOS: your APNs auth key and the VoIP token (physical iPhone only)
npx -p @bear-block/callx-testkit callx-push ios \
  --key AuthKey_ABC123.p8 --key-id ABC123 --team-id TEAM123 \
  --bundle-id com.example.calls --token <VoIP token>
```
