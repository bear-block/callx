package dev.callx.telecom

/** The device's push token for Callx invitations; Dart and JavaScript read it to register with the backend. */
data class CallxPushToken(
    /** `fcm` on Android, `voip` (APNs PushKit) on iOS. */
    val type: String,
    val token: String,
)

/**
 * The latest push token of this process. Callx declares no FirebaseMessagingService, so the app's
 * service (or the one the Expo plugin generates) reports FCM tokens here from `onNewToken` and
 * after `FirebaseMessaging.getToken()`.
 */
object CallxPushTokens {
    @Volatile var current: CallxPushToken? = null; private set

    @JvmStatic fun updateFcm(token: String) { if (token.isNotBlank()) current = CallxPushToken("fcm", token) }

    @JvmStatic fun clear() { current = null }
}
