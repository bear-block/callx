package dev.callx.telecom

import android.app.PendingIntent
import android.app.Notification
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.RingtoneManager
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import dev.callx.core.Invitation
import java.util.concurrent.ConcurrentHashMap

/**
 * Labels for [CallxIncomingCallActivity] and the fallback notification; CallStyle notifications use
 * the system's own labels.
 */
data class CallNotificationLabels(
    val answer: CharSequence = "Answer",
    val decline: CharSequence = "Decline",
    val hangUp: CharSequence = "Hang up",
    /** Shown on the lock-screen call screen when answering requires unlocking. */
    val openApp: CharSequence = "Open app",
    /** Notification channel names in the app's system settings. */
    val incomingChannel: CharSequence = "Incoming calls",
    val ongoingChannel: CharSequence = "Ongoing calls",
    val mute: CharSequence = "Mute",
    val unmute: CharSequence = "Unmute",
    val hold: CharSequence = "Hold",
    val resume: CharSequence = "Resume",
    val audio: CharSequence = "Audio",
    /** Missed-call notification title; the caller's name is the text. */
    val missedCall: CharSequence = "Missed call",
    val missedVideoCall: CharSequence = "Missed video call",
    val callBack: CharSequence = "Call back",
    val missedChannel: CharSequence = "Missed calls",
)

/**
 * Default call notification: CallStyle with answer and decline buttons while ringing, and a hang-up
 * button and a running call timer once the call is answered.
 *
 * Android 12+ rejects a CallStyle notification that has neither a foreground service nor a
 * full-screen intent, so every notification carries one: [fullScreenIntent] when given; otherwise
 * [CallxIncomingCallActivity] while ringing, and the app's launcher Activity with
 * [TelecomIngress.EXTRA_CALL_ID] afterwards. Android only opens it full screen while the device is
 * locked or the screen is off; in use, it shows a heads-up notification. Android 14+ may also deny
 * full-screen intents, with the same heads-up result. The answer button always goes through
 * [CallxIncomingCallActivity], which then opens the launcher Activity; while the device is locked,
 * [lockedAnswer] decides whether that waits for the user to unlock (the default, as on iOS) or opens
 * above the lock screen.
 * If the system still rejects CallStyle, a plain notification with the same buttons is posted
 * instead. While the call is registered with Telecom, Android shows it even when the user blocked
 * the app's notifications.
 *
 * An incoming call that stops ringing unanswered leaves a missed-call notification whose Call
 * back button delivers a [CallxCallRequest] (ADR-0013); [missedCalls] false turns it off. It needs
 * the notification permission, since the call is no longer registered with Telecom.
 */
class CallStylePresenter(
    private val context: Context,
    private val channelId: String = "callx_calls",
    private val smallIcon: Int = context.applicationInfo.icon,
    private val fullScreenIntent: ((callId: String) -> PendingIntent?)? = null,
    private val contentIntent: ((callId: String) -> PendingIntent?)? = null,
    private val labels: CallNotificationLabels = CallNotificationLabels(),
    private val lockedAnswer: LockedAnswer = LockedAnswer.RequireUnlock,
    private val missedCalls: Boolean = true,
) : IncomingCallPresenter {
    private val manager = NotificationManagerCompat.from(context)
    private val names = ConcurrentHashMap<String, String>()
    private val invitations = ConcurrentHashMap<String, Invitation>()
    private val silenced = ConcurrentHashMap.newKeySet<String>()
    // When each ongoing call was answered; 0 while an outgoing call still rings.
    private val answeredAt = ConcurrentHashMap<String, Long>()
    // Sound is immutable once Android creates a channel. Suffixes migrate existing installs.
    private val incomingChannelId = "${channelId}_ringtone_v1"
    private val ongoingChannelId = "${channelId}_ongoing_v1"
    private val missedChannelId = "${channelId}_missed_v1"

    init {
        val ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        val attributes = AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setLegacyStreamType(AudioManager.STREAM_RING)
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .build()
        manager.createNotificationChannel(NotificationChannelCompat.Builder(incomingChannelId, NotificationManagerCompat.IMPORTANCE_HIGH)
            .setName(labels.incomingChannel).setSound(ringtone, attributes).build())
        manager.createNotificationChannel(NotificationChannelCompat.Builder(ongoingChannelId, NotificationManagerCompat.IMPORTANCE_DEFAULT)
            .setName(labels.ongoingChannel).setSound(null, null).build())
        if (missedCalls) manager.createNotificationChannel(NotificationChannelCompat.Builder(missedChannelId,
            NotificationManagerCompat.IMPORTANCE_DEFAULT).setName(labels.missedChannel).build())
        // Earlier versions posted every call on the unsuffixed channel with the default sound.
        manager.deleteNotificationChannel(channelId)
    }

    override fun showIncoming(invitation: Invitation) {
        val callId = invitation.callId
        names[callId] = invitation.displayName
        invitations[callId] = invitation
        postIncoming(invitation)
    }

    private fun postIncoming(invitation: Invitation) {
        val callId = invitation.callId
        val caller = Person.Builder().setName(invitation.displayName).setImportant(true).build()
        val decline = action(callId, TelecomIngress.ACTION_DECLINE)
        val answer = incomingScreen(callId, answer = true)
        val screen = fullScreenIntent?.invoke(callId) ?: incomingScreen(callId, answer = false)
        post(callId,
            styled = base(callId, screen, ringing = true).setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, decline, answer)),
            plain = { base(callId, screen, ringing = true).addAction(0, labels.decline, decline).addAction(0, labels.answer, answer) },
            insist = callId !in silenced)
    }

    override fun silenceIncoming(callId: String) {
        val invitation = invitations[callId] ?: return
        silenced.add(callId)
        // Reposting with ONLY_ALERT_ONCE stops an insistent notification without removing its UI.
        postIncoming(invitation)
    }

    override fun showOutgoing(callId: String, displayName: String) {
        names[callId] = displayName
        showOngoing(callId, answeredAtMs = null)
    }

    override fun showOngoing(callId: String, answeredAtMs: Long?) {
        invitations.remove(callId); silenced.remove(callId); answeredAt[callId] = answeredAtMs ?: 0
        CallxIncomingCallActivity.callAnswered(callId)
        val caller = Person.Builder().setName(names[callId] ?: callId).build()
        val hangUp = action(callId, TelecomIngress.ACTION_HANG_UP)
        val screen = fullScreenIntent?.invoke(callId) ?: launcherIntent(callId)
        // The system renders the elapsed time from `when`, so it keeps counting without updates.
        fun timed(builder: NotificationCompat.Builder) = if (answeredAtMs == null) builder
            else builder.setWhen(answeredAtMs).setShowWhen(true).setUsesChronometer(true)
        post(callId,
            styled = timed(base(callId, screen, ringing = false)).setStyle(NotificationCompat.CallStyle.forOngoingCall(caller, hangUp)),
            plain = { timed(base(callId, screen, ringing = false)).addAction(0, labels.hangUp, hangUp) })
    }

    override fun rename(callId: String, displayName: String) {
        names[callId] = displayName
        val ringing = invitations[callId]
        when {
            ringing != null -> ringing.copy(displayName = displayName).also { invitations[callId] = it }.let(::postIncoming)
            answeredAt.containsKey(callId) -> showOngoing(callId, answeredAt[callId]?.takeIf { it > 0 })
        }
    }

    override fun showMissed(call: MissedCall) {
        if (!missedCalls) return
        val callBack = PendingIntent.getActivity(context, (call.callId + "callBack").hashCode(),
            CallxCallBackActivity.intent(context, call), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification = NotificationCompat.Builder(context, missedChannelId)
            .setSmallIcon(smallIcon)
            .setContentTitle(if (call.video) labels.missedVideoCall else labels.missedCall)
            .setContentText(call.displayName)
            .setCategory(NotificationCompat.CATEGORY_MISSED_CALL)
            .setWhen(call.endedAtMs).setShowWhen(true)
            .setAutoCancel(true)
            .apply { (contentIntent?.invoke(call.callId) ?: launcherIntent(call.callId, ongoing = false))?.let(::setContentIntent) }
            .addAction(0, labels.callBack, callBack)
            .build()
        try { manager.notify(CallxCallBackActivity.MISSED_TAG, call.callId.hashCode(), notification) }
        catch (_: SecurityException) {
            // No notification permission; Telecom's exemption ended with the call.
        }
    }

    override fun dismiss(callId: String) {
        invitations.remove(callId); silenced.remove(callId); answeredAt.remove(callId)
        CallxIncomingCallActivity.callEnded(callId)
        names.remove(callId); manager.cancel(TAG, callId.hashCode())
    }

    private fun base(callId: String, screen: PendingIntent?, ringing: Boolean) =
        NotificationCompat.Builder(context, if (ringing) incomingChannelId else ongoingChannelId)
        .setSmallIcon(smallIcon)
        .setContentTitle(names[callId] ?: callId)
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setOngoing(true)
        .setOnlyAlertOnce(!ringing || callId in silenced)
        .apply {
            // Always set it: on Android 14+ a denied full-screen intent still satisfies CallStyle.
            screen?.let { setFullScreenIntent(it, true) }
            (contentIntent?.invoke(callId) ?: screen)?.let(::setContentIntent)
        }

    private fun post(callId: String, styled: NotificationCompat.Builder, plain: () -> NotificationCompat.Builder,
        insist: Boolean = false) {
        fun build(builder: NotificationCompat.Builder): Notification = builder.build().apply {
            if (insist) flags = flags or Notification.FLAG_INSISTENT
        }
        try {
            manager.notify(TAG, callId.hashCode(), build(styled))
        } catch (_: SecurityException) {
            // Notification permission missing and no Telecom exemption applied: nothing can be shown.
        } catch (_: RuntimeException) {
            // For example IllegalArgumentException when the system does not accept CallStyle.
            try { manager.notify(TAG, callId.hashCode(), build(plain())) } catch (_: RuntimeException) {}
        }
    }

    /** The app's launcher Activity; [ongoing] adds [TelecomIngress.EXTRA_CALL_ID] for the live call. */
    private fun launcherIntent(callId: String, ongoing: Boolean = true): PendingIntent? {
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        if (ongoing) intent.putExtra(TelecomIngress.EXTRA_CALL_ID, callId)
        return PendingIntent.getActivity(context, if (ongoing) callId.hashCode() else (callId + "missed").hashCode(), intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun incomingScreen(callId: String, answer: Boolean): PendingIntent = PendingIntent.getActivity(context,
        (callId + if (answer) TelecomIngress.ACTION_ANSWER else "screen").hashCode(),
        CallxIncomingCallActivity.intent(context, callId, names[callId] ?: callId, answer, labels, lockedAnswer),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

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
