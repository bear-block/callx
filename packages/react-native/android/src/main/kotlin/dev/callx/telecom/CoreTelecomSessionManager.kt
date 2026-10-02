package dev.callx.telecom

import android.net.Uri
import android.telecom.DisconnectCause
import android.util.Log
import androidx.core.telecom.CallAttributesCompat
import androidx.core.telecom.CallEndpointCompat
import androidx.core.telecom.CallException
import androidx.core.telecom.CallsManager
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch

/** Handles actions initiated by Android's call surface. Completion must mean host work finished. */
interface TelecomSystemActionHandler {
    suspend fun answer(callId: String, callType: Int)
    suspend fun disconnect(callId: String, cause: DisconnectCause)
    suspend fun setActive(callId: String)
    suspend fun setInactive(callId: String)
}

/**
 * Audio state Telecom reports for a live call, including changes other surfaces make, such as
 * muting from a car or a headset. Route audio with [TelecomCallHandle.requestEndpoint], never AudioManager.
 */
interface TelecomCallAudioObserver {
    /** Called in order for each change; the next change waits until this returns. */
    suspend fun onMuteChanged(callId: String, muted: Boolean)
    fun onEndpointsChanged(callId: String, current: CallEndpointCompat, available: List<CallEndpointCompat>)
}

/** Telecom registration for incoming calls; [CoreTelecomSessionManager] implements it. */
interface IncomingTelecomSessions : TelecomCallResolver {
    suspend fun reportIncoming(callId: String, displayName: String, handle: String): TelecomActionResult
    /** Registers a video call; implementations without video register an audio call. */
    suspend fun reportIncoming(callId: String, displayName: String, handle: String, video: Boolean): TelecomActionResult =
        reportIncoming(callId, displayName, handle)
}

/**
 * Application-scoped owner of Core-Telecom call sessions. CallsManager.addCall remains suspended
 * for the platform call lifetime, while start() returns once onCall publishes a usable scope.
 */
class CoreTelecomSessionManager(
    private val callsManager: CallsManager,
    private val systemActions: TelecomSystemActionHandler,
    private val applicationScope: CoroutineScope,
    private val audio: TelecomCallAudioObserver? = null,
) : IncomingTelecomSessions, OutgoingCallStarter {
    private val sessions = ConcurrentHashMap<String, TelecomCallHandle>()
    private val starting = ConcurrentHashMap.newKeySet<String>()

    override fun resolve(callId: String): TelecomCallHandle? = sessions[callId]

    override suspend fun start(callId: String, displayName: String, handle: String): TelecomActionResult =
        add(callId, displayName, handle, CallAttributesCompat.DIRECTION_OUTGOING, video = false)

    override suspend fun start(callId: String, displayName: String, handle: String, video: Boolean): TelecomActionResult =
        add(callId, displayName, handle, CallAttributesCompat.DIRECTION_OUTGOING, video)

    override suspend fun reportIncoming(callId: String, displayName: String, handle: String): TelecomActionResult =
        add(callId, displayName, handle, CallAttributesCompat.DIRECTION_INCOMING, video = false)

    override suspend fun reportIncoming(callId: String, displayName: String, handle: String, video: Boolean): TelecomActionResult =
        add(callId, displayName, handle, CallAttributesCompat.DIRECTION_INCOMING, video)

    private suspend fun add(
        callId: String,
        displayName: String,
        handle: String,
        direction: Int,
        video: Boolean,
    ): TelecomActionResult {
        if (sessions.containsKey(callId) || !starting.add(callId)) return TelecomActionResult.Rejected()
        val ready = CompletableDeferred<TelecomActionResult>()
        val incomingRinging = AtomicBoolean(direction == CallAttributesCompat.DIRECTION_INCOMING)
        // Core-Telecom 1.0 cannot change the type later, so a video call stays one (ADR-0010).
        val callType = if (video) CallAttributesCompat.CALL_TYPE_VIDEO_CALL else CallAttributesCompat.CALL_TYPE_AUDIO_CALL
        val attributes = CallAttributesCompat(
            displayName,
            Uri.parse(handle),
            direction,
            callType,
            CallAttributesCompat.SUPPORTS_SET_INACTIVE,
        )
        val job = applicationScope.launch {
            try {
                addCallRegisteringOnce(canRetry = { !ready.isCompleted }) {
                    callsManager.addCall(
                        attributes,
                        onAnswer = { callType: Int ->
                            systemActions.answer(callId, callType)
                            incomingRinging.set(false)
                        },
                        onDisconnect = { cause: DisconnectCause -> systemActions.disconnect(callId, cause) },
                        onSetActive = { systemActions.setActive(callId) },
                        onSetInactive = { systemActions.setInactive(callId) },
                        block = {
                            sessions[callId] = CoreTelecomCallHandle(this, { incomingRinging.get() }, callType)
                            // These collectors live in the call scope and stop when the call ends.
                            audio?.let { observer ->
                                launch { isMuted.collect { observer.onMuteChanged(callId, it) } }
                                launch {
                                    combine(currentCallEndpoint, availableEndpoints) { current, available -> current to available }
                                        .collect { (current, available) -> observer.onEndpointsChanged(callId, current, available) }
                                }
                            }
                            ready.complete(TelecomActionResult.Applied)
                        },
                    )
                }
            } catch (error: Throwable) {
                // Only the type and code: messages can carry the caller's handle.
                val code = (error as? CallException)?.code
                if (!ready.isCompleted) Log.w(TAG, "Telecom did not add the call: ${error.javaClass.simpleName}" +
                    (code?.let { " (code $it)" } ?: ""))
                ready.complete(TelecomActionResult.Rejected(code))
            } finally {
                sessions.remove(callId)
                starting.remove(callId)
            }
        }
        job.invokeOnCompletion { ready.complete(TelecomActionResult.Rejected()) }
        return ready.await()
    }

    /**
     * Telecom throws SecurityException when the app's PhoneAccount is gone, for example removed late
     * after a quick reinstall. Registering is idempotent, so register again and retry once,
     * unless the call was already added.
     */
    private suspend fun addCallRegisteringOnce(canRetry: () -> Boolean, addCall: suspend () -> Unit) {
        try {
            addCall()
        } catch (error: SecurityException) {
            if (!canRetry()) throw error
            Log.w(TAG, "Telecom does not know this app's account; registering again")
            callsManager.registerAppWithTelecom(CallsManager.CAPABILITY_BASELINE)
            addCall()
        }
    }

    private companion object {
        const val TAG = "Callx"
    }
}
