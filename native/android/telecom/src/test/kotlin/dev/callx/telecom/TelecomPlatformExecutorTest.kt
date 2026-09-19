package dev.callx.telecom

import dev.callx.core.CommandType
import dev.callx.core.NativeCommand
import dev.callx.core.PlatformOutcome
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job

class TelecomPlatformExecutorTest {
    private val scope = CoroutineScope(Dispatchers.Unconfined)

    @Test fun routesTelecomAndNormalizesNativeRejection() {
        val handle = object : TelecomCallHandle {
            override suspend fun answer() = TelecomActionResult.Applied
            override suspend fun end() = TelecomActionResult.Rejected(7)
            override suspend fun setHeld(held: Boolean) = TelecomActionResult.Applied
        }
        val executor = TelecomPlatformExecutor(scope, { handle }, { _, _ -> true }, { 1_000 })

        assertEquals(PlatformOutcome.Applied(1_000), executor.perform(command(CommandType.answer)).toCompletableFuture().get())
        assertEquals(
            PlatformOutcome.Rejected("platformRejected", 1_000),
            executor.perform(command(CommandType.end)).toCompletableFuture().get(),
        )
    }

    @Test fun keepsMuteInMediaLayerAndReportsMissingCall() {
        val executor = TelecomPlatformExecutor(scope, { null }, { _, muted -> muted }, { 1_000 })

        assertEquals(
            PlatformOutcome.Applied(1_000),
            executor.perform(command(CommandType.setMuted, true)).toCompletableFuture().get(),
        )
        assertEquals(
            PlatformOutcome.Rejected("callNotFound", 1_000),
            executor.perform(command(CommandType.answer)).toCompletableFuture().get(),
        )
    }

    @Test fun rejectsExpiredAndUnsupportedCommandsWithoutCallingPlatform() {
        var resolved = false
        val executor = TelecomPlatformExecutor(scope, { resolved = true; null }, { _, _ -> true }, { 2_000 })

        assertEquals(
            PlatformOutcome.TimedOut(2_000),
            executor.perform(command(CommandType.answer, deadline = 2_000)).toCompletableFuture().get(),
        )
        assertEquals(
            PlatformOutcome.Rejected("unsupported", 2_000),
            executor.perform(NativeCommand("op", CommandType.startCall, "call", displayName = "A",
                handle = "sip:a@example.invalid", deadlineAtMs = 5_000)).toCompletableFuture().get(),
        )
        assertEquals(false, resolved)
    }

    @Test fun cancelledApplicationScopeCannotLeaveOperationHanging() {
        val job = Job().also { it.cancel() }
        val executor = TelecomPlatformExecutor(CoroutineScope(job), { null }, { _, _ -> true }, { 2_000 })

        assertEquals(
            PlatformOutcome.Unknown("nativeUnavailable", 2_000),
            executor.perform(command(CommandType.answer)).toCompletableFuture().get(),
        )
    }

    @Test fun outgoingUsesValidatedMetadata() {
        var captured = ""
        val executor = TelecomPlatformExecutor(scope, { null }, { _, _ -> true }, { 1_000 },
            outgoing = OutgoingCallStarter { callId, name, handle ->
                captured = "$callId|$name|$handle"; TelecomActionResult.Applied
            })
        val command = NativeCommand("start", CommandType.startCall, "call-out", displayName = "hao.dev7",
            handle = "sip:hao.dev7@example.invalid", deadlineAtMs = 5_000)

        assertEquals(PlatformOutcome.Applied(1_000), executor.perform(command).toCompletableFuture().get())
        assertEquals("call-out|hao.dev7|sip:hao.dev7@example.invalid", captured)
    }

    private fun command(type: CommandType, value: Boolean? = null, deadline: Long = 5_000) =
        NativeCommand("op", type, "call", value = value, deadlineAtMs = deadline)
}
