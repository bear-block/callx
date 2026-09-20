package dev.callx.telecom

import android.net.Uri
import android.telecom.DisconnectCause
import androidx.core.telecom.CallAttributesCompat
import androidx.core.telecom.CallsManager
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/** Handles actions initiated by Android's call surface. Completion must mean host work finished. */
interface TelecomSystemActionHandler {
    suspend fun answer(callId: String, callType: Int)
    suspend fun disconnect(callId: String, cause: DisconnectCause)
    suspend fun setActive(callId: String)
    suspend fun setInactive(callId: String)
}

/**
 * Application-scoped owner of Core-Telecom call sessions. CallsManager.addCall remains suspended
 * for the platform call lifetime, while start() returns once onCall publishes a usable scope.
 */
class CoreTelecomSessionManager(
    private val callsManager: CallsManager,
    private val systemActions: TelecomSystemActionHandler,
    private val applicationScope: CoroutineScope,
) : TelecomCallResolver, OutgoingCallStarter {
    private val sessions = ConcurrentHashMap<String, TelecomCallHandle>()
    private val starting = ConcurrentHashMap.newKeySet<String>()

    override fun resolve(callId: String): TelecomCallHandle? = sessions[callId]

    override suspend fun start(callId: String, displayName: String, handle: String): TelecomActionResult =
        add(callId, displayName, handle, CallAttributesCompat.DIRECTION_OUTGOING)

    suspend fun reportIncoming(callId: String, displayName: String, handle: String): TelecomActionResult =
        add(callId, displayName, handle, CallAttributesCompat.DIRECTION_INCOMING)

    private suspend fun add(
        callId: String,
        displayName: String,
        handle: String,
        direction: Int,
    ): TelecomActionResult {
        if (sessions.containsKey(callId) || !starting.add(callId)) return TelecomActionResult.Rejected()
        val ready = CompletableDeferred<TelecomActionResult>()
        val incomingRinging = AtomicBoolean(direction == CallAttributesCompat.DIRECTION_INCOMING)
        val attributes = CallAttributesCompat(
            displayName,
            Uri.parse(handle),
            direction,
            CallAttributesCompat.CALL_TYPE_AUDIO_CALL,
            CallAttributesCompat.SUPPORTS_SET_INACTIVE,
        )
        val job = applicationScope.launch {
            try {
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
                        sessions[callId] = CoreTelecomCallHandle(this) {
                            incomingRinging.get()
                        }
                        ready.complete(TelecomActionResult.Applied)
                    },
                )
            } catch (_: Throwable) {
                ready.complete(TelecomActionResult.Rejected())
            } finally {
                sessions.remove(callId)
                starting.remove(callId)
            }
        }
        job.invokeOnCompletion { ready.complete(TelecomActionResult.Rejected()) }
        return ready.await()
    }
}
