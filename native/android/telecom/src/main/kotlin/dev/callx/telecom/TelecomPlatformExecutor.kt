package dev.callx.telecom

import android.telecom.DisconnectCause
import androidx.core.telecom.CallAttributesCompat
import androidx.core.telecom.CallControlResult
import androidx.core.telecom.CallControlScope
import dev.callx.core.CommandType
import dev.callx.core.NativeCommand
import dev.callx.core.PlatformCommandExecutor
import dev.callx.core.PlatformOutcome
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/** A live Core-Telecom call. Its lifetime is owned by CallsManager.addCall. */
interface TelecomCallHandle {
    suspend fun answer(): TelecomActionResult
    suspend fun end(): TelecomActionResult
    suspend fun setHeld(held: Boolean): TelecomActionResult
}

sealed interface TelecomActionResult {
    data object Applied : TelecomActionResult
    data class Rejected(val nativeErrorCode: Int? = null) : TelecomActionResult
}

fun interface TelecomCallResolver {
    fun resolve(callId: String): TelecomCallHandle?
}

/** Muting belongs to the application's media engine; stable Core-Telecom only exposes mute state. */
fun interface MediaMuteController {
    suspend fun setMuted(callId: String, muted: Boolean): Boolean
}

fun interface OutgoingCallStarter {
    suspend fun start(callId: String, displayName: String, handle: String): TelecomActionResult
}

class CoreTelecomCallHandle internal constructor(
    private val answerCall: suspend () -> TelecomActionResult,
    private val disconnectCall: suspend (Int) -> TelecomActionResult,
    private val changeHold: suspend (Boolean) -> TelecomActionResult,
    private val isIncomingRinging: () -> Boolean,
) : TelecomCallHandle {
    constructor(control: CallControlScope, isIncomingRinging: () -> Boolean) : this(
        answerCall = { control.answer(CallAttributesCompat.CALL_TYPE_AUDIO_CALL).toActionResult() },
        disconnectCall = { code -> control.disconnect(DisconnectCause(code)).toActionResult() },
        changeHold = { held -> (if (held) control.setInactive() else control.setActive()).toActionResult() },
        isIncomingRinging = isIncomingRinging,
    )

    private val answered = AtomicBoolean(false)

    override suspend fun answer(): TelecomActionResult {
        val result = answerCall()
        if (result == TelecomActionResult.Applied) answered.set(true)
        return result
    }

    override suspend fun end(): TelecomActionResult {
        val code = if (!answered.get() && isIncomingRinging()) DisconnectCause.REJECTED else DisconnectCause.LOCAL
        return disconnectCall(code)
    }

    override suspend fun setHeld(held: Boolean) = changeHold(held)
}

private fun CallControlResult.toActionResult(): TelecomActionResult = when (this) {
    is CallControlResult.Success -> TelecomActionResult.Applied
    is CallControlResult.Error -> TelecomActionResult.Rejected(errorCode)
}

/**
 * Executes app-originated commands against a live Core-Telecom scope.
 *
 * Core-Telecom's suspend result is the terminal platform result, unlike CallKit's
 * two-step transaction/action callback model. Native numeric errors are deliberately
 * normalized to the public `platformRejected` code.
 */
class TelecomPlatformExecutor(
    private val coroutineScope: CoroutineScope,
    private val calls: TelecomCallResolver,
    private val media: MediaMuteController,
    private val nowMs: () -> Long = System::currentTimeMillis,
    private val outgoing: OutgoingCallStarter? = null,
) : PlatformCommandExecutor {
    override fun perform(command: NativeCommand): CompletionStage<PlatformOutcome> {
        val future = CompletableFuture<PlatformOutcome>()
        val job = coroutineScope.launch {
            val startedAt = nowMs()
            val remainingMs = command.deadlineAtMs - startedAt
            if (remainingMs <= 0) {
                future.complete(PlatformOutcome.TimedOut(startedAt))
                return@launch
            }
            try {
                val outcome = withTimeoutOrNull(remainingMs) { execute(command) }
                future.complete(outcome ?: PlatformOutcome.TimedOut(nowMs()))
            } catch (_: CancellationException) {
                future.complete(PlatformOutcome.Unknown("nativeUnavailable", nowMs()))
            } catch (_: Throwable) {
                future.complete(PlatformOutcome.Unknown("internal", nowMs()))
            }
        }
        job.invokeOnCompletion {
            if (!future.isDone) future.complete(PlatformOutcome.Unknown("nativeUnavailable", nowMs()))
        }
        return future
    }

    private suspend fun execute(command: NativeCommand): PlatformOutcome {
        val result = when (command.type) {
            CommandType.setMuted -> {
                val value = command.value
                    ?: return PlatformOutcome.Rejected("invalidArgument", nowMs())
                return if (media.setMuted(command.callId, value)) {
                    PlatformOutcome.Applied(nowMs())
                } else {
                    PlatformOutcome.Rejected("mediaNotReady", nowMs())
                }
            }
            CommandType.startCall -> {
                val displayName = command.displayName
                    ?: return PlatformOutcome.Rejected("invalidArgument", nowMs())
                val handle = command.handle
                    ?: return PlatformOutcome.Rejected("invalidArgument", nowMs())
                outgoing?.start(command.callId, displayName, handle)
                    ?: return PlatformOutcome.Rejected("unsupported", nowMs())
            }
            CommandType.answer -> calls.resolve(command.callId)?.answer()
            CommandType.end -> calls.resolve(command.callId)?.end()
            CommandType.setHeld -> {
                val value = command.value
                    ?: return PlatformOutcome.Rejected("invalidArgument", nowMs())
                calls.resolve(command.callId)?.setHeld(value)
            }
        } ?: return PlatformOutcome.Rejected("callNotFound", nowMs())

        return when (result) {
            TelecomActionResult.Applied -> PlatformOutcome.Applied(nowMs())
            is TelecomActionResult.Rejected -> PlatformOutcome.Rejected("platformRejected", nowMs())
        }
    }
}
