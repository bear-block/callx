package dev.callx.telecom

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import androidx.core.app.NotificationManagerCompat

/**
 * The user asked to call someone outside the app, such as with the Call back button of a
 * missed-call notification (ADR-0013). It is not a command: look up [handle] and call
 * `startCall` if the app agrees.
 */
data class CallxCallRequest(
    val handle: String,
    /** The name shown for the earlier call, when known. */
    val displayName: String?,
    /** The earlier call was a video call. */
    val video: Boolean,
    val requestedAtMs: Long,
)

/**
 * Holds the latest call request until the app takes it, for [RETENTION_MS], so a request that
 * launched the app is still delivered once Dart or JavaScript starts.
 */
object CallxCallRequests {
    const val RETENTION_MS = 60_000L
    private var pending: CallxCallRequest? = null
    private var listener: (() -> Unit)? = null

    /** Records [request], replacing an untaken one, and tells the listener. */
    fun offer(request: CallxCallRequest) {
        val notify = synchronized(this) { pending = request; listener }
        notify?.invoke()
    }

    /** The pending request, removed so it is delivered once; null when none or too old. */
    @Synchronized fun take(nowMs: Long = System.currentTimeMillis()): CallxCallRequest? =
        pending.also { pending = null }?.takeIf { nowMs - it.requestedAtMs < RETENTION_MS }

    /** One consumer, the framework plugin: told when a request arrives, then calls [take]. */
    fun setListener(value: (() -> Unit)?) = setListener(value, notifyPending = true)

    fun setListener(value: (() -> Unit)?, notifyPending: Boolean) {
        val notify = synchronized(this) { listener = value; value?.takeIf { notifyPending && pending != null } }
        notify?.invoke()
    }
}

/**
 * Target of the missed-call notification's Call back button: records the request and opens the
 * app. Activity-to-activity, so Android 12's notification trampoline limits do not apply.
 */
class CallxCallBackActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val handle = intent.getStringExtra(EXTRA_HANDLE)
        if (handle != null) {
            CallxCallRequests.offer(CallxCallRequest(handle, intent.getStringExtra(EXTRA_DISPLAY_NAME),
                intent.getBooleanExtra(EXTRA_VIDEO, false), System.currentTimeMillis()))
        }
        intent.getStringExtra(TelecomIngress.EXTRA_CALL_ID)?.let { cancelMissed(this, it) }
        packageManager.getLaunchIntentForPackage(packageName)?.let {
            startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
        }
        finish()
    }

    companion object {
        const val EXTRA_HANDLE = "dev.callx.telecom.REQUEST_HANDLE"
        const val EXTRA_DISPLAY_NAME = "dev.callx.telecom.REQUEST_DISPLAY_NAME"
        const val EXTRA_VIDEO = "dev.callx.telecom.REQUEST_VIDEO"
        internal const val MISSED_TAG = "callx_missed"

        fun intent(context: Context, call: MissedCall): Intent = Intent(context, CallxCallBackActivity::class.java)
            .putExtra(TelecomIngress.EXTRA_CALL_ID, call.callId)
            .putExtra(EXTRA_HANDLE, call.handle)
            .putExtra(EXTRA_DISPLAY_NAME, call.displayName)
            .putExtra(EXTRA_VIDEO, call.video)

        internal fun cancelMissed(context: Context, callId: String) =
            NotificationManagerCompat.from(context).cancel(MISSED_TAG, callId.hashCode())
    }
}

/** An incoming call that stopped ringing without an answer: it timed out or the caller cancelled. */
data class MissedCall(val callId: String, val displayName: String, val handle: String, val video: Boolean,
    val endedAtMs: Long)
