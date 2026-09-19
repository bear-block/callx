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

class CoreTelecomCallHandle(
    private val control: CallControlScope,
    private val isIncomingRinging: () -> Boolean,
) : TelecomCallHandle {
    override suspend fun answer() = control.answer(CallAttributesCompat.CALL_TYPE_AUDIO_CALL).toActionResult()

    override suspend fun end(): TelecomActionResult {
        val code = if (isIncomingRinging()) DisconnectCause.REJECTED else DisconnectCause.LOCAL
        return control.disconnect(DisconnectCause(code)).toActionResult()
    }

    override suspend fun setHeld(held: Boolean) =
        (if (held) control.setInactive() else control.setActive()).toActionResult()
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
            CommandType.startCall -> return PlatformOutcome.Rejected("unsupported", nowMs())
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
