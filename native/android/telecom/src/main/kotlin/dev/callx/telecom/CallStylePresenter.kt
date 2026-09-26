package dev.callx.telecom

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import dev.callx.core.Invitation
import java.util.concurrent.ConcurrentHashMap

/** Button labels for the fallback notification; CallStyle notifications use the system's own labels. */
data class CallNotificationLabels(
    val answer: CharSequence = "Answer",
    val decline: CharSequence = "Decline",
    val hangUp: CharSequence = "Hang up",
)

/**
 * Default call notification: CallStyle with answer and decline buttons while ringing, and a hang-up
 * button for outgoing and answered calls.
 *
 * Android 12+ rejects a CallStyle notification that has neither a foreground service nor a
 * full-screen intent, so every notification carries one: [fullScreenIntent], or by default an
 * intent for the app's launcher Activity with [TelecomIngress.EXTRA_CALL_ID]. To present the call
 * over the lock screen, that Activity must call `setShowWhenLocked(true)` and `setTurnScreenOn(true)`.
 * On Android 14+ the system may deny full-screen intents; the call then shows as a heads-up
 * notification. If the system still rejects CallStyle, a plain notification with the same buttons
 * is posted instead. While the call is registered with Telecom, Android shows it even when the
 * user blocked the app's notifications.
 */
class CallStylePresenter(
    private val context: Context,
    private val channelId: String = "callx_calls",
    channelName: CharSequence = "Calls",
    private val smallIcon: Int = context.applicationInfo.icon,
    private val fullScreenIntent: ((callId: String) -> PendingIntent?)? = null,
    private val contentIntent: ((callId: String) -> PendingIntent?)? = null,
    private val labels: CallNotificationLabels = CallNotificationLabels(),
) : IncomingCallPresenter {
    private val manager = NotificationManagerCompat.from(context)
    private val names = ConcurrentHashMap<String, String>()

    init {
        manager.createNotificationChannel(NotificationChannelCompat.Builder(channelId, NotificationManagerCompat.IMPORTANCE_HIGH)
            .setName(channelName).build())
    }

    override fun showIncoming(invitation: Invitation) {
        val callId = invitation.callId
        names[callId] = invitation.displayName
        val caller = Person.Builder().setName(invitation.displayName).setImportant(true).build()
        val decline = action(callId, TelecomIngress.ACTION_DECLINE)
        val answer = action(callId, TelecomIngress.ACTION_ANSWER)
        post(callId,
            styled = base(callId).setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, decline, answer)),
            plain = { base(callId).addAction(0, labels.decline, decline).addAction(0, labels.answer, answer) })
    }

    override fun showOutgoing(callId: String, displayName: String) {
        names[callId] = displayName
        showOngoing(callId)
    }

    override fun showOngoing(callId: String) {
        val caller = Person.Builder().setName(names[callId] ?: callId).build()
        val hangUp = action(callId, TelecomIngress.ACTION_HANG_UP)
        post(callId,
            styled = base(callId).setStyle(NotificationCompat.CallStyle.forOngoingCall(caller, hangUp)),
            plain = { base(callId).addAction(0, labels.hangUp, hangUp) })
    }

    override fun dismiss(callId: String) {
        names.remove(callId); manager.cancel(TAG, callId.hashCode())
    }

    private fun base(callId: String) = NotificationCompat.Builder(context, channelId)
        .setSmallIcon(smallIcon)
        .setContentTitle(names[callId] ?: callId)
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .apply {
            // Always set it: on Android 14+ a denied full-screen intent still satisfies CallStyle.
            (fullScreenIntent?.invoke(callId) ?: launcherIntent(callId))?.let { setFullScreenIntent(it, true) }
            contentIntent?.invoke(callId)?.let(::setContentIntent)
        }

    private fun post(callId: String, styled: NotificationCompat.Builder, plain: () -> NotificationCompat.Builder) {
        try {
            manager.notify(TAG, callId.hashCode(), styled.build())
        } catch (_: SecurityException) {
            // Notification permission missing and no Telecom exemption applied: nothing can be shown.
        } catch (_: RuntimeException) {
            // For example IllegalArgumentException when the system does not accept CallStyle.
            try { manager.notify(TAG, callId.hashCode(), plain().build()) } catch (_: RuntimeException) {}
        }
    }

    private fun launcherIntent(callId: String): PendingIntent? {
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(TelecomIngress.EXTRA_CALL_ID, callId)
        return PendingIntent.getActivity(context, callId.hashCode(), intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun action(callId: String, action: String): PendingIntent = PendingIntent.getBroadcast(context,
        (callId + action).hashCode(),
        Intent(context, CallxNotificationActionReceiver::class.java).setAction(action)
            .putExtra(TelecomIngress.EXTRA_CALL_ID, callId),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    private companion object { const val TAG = "callx" }
}

/** Routes notification buttons to the attached [TelecomIngress]. Declared in the library manifest. */
class CallxNotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val callId = intent.getStringExtra(TelecomIngress.EXTRA_CALL_ID) ?: return
        val action = intent.action ?: return
        TelecomIngress.active?.onNotificationAction(callId, action)
    }
}
