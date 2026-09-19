package dev.callx.core

import java.util.concurrent.CompletableFuture
import kotlin.test.*

class ReconciliationTest {
    @Test fun recoveredPendingReconcilesWithoutBlindRetry() {
        val source = CallCoordinator().also { it.reportIncoming("call-1") }
        val command = NativeCommand("pending", CommandType.answer, "call-1", deadlineAtMs = 5_000)
        assertEquals(Preparation.Execute, source.prepare(command, 1_000)); val checkpoint = source.checkpoint()

        val applied = CallCoordinator(checkpoint)
        val appliedResults = RecoveredOperationReconciler(applied) {
            CompletableFuture.completedFuture(ReconciliationOutcome.Applied(1_100))
        }.reconcile(1_050).toCompletableFuture().get()
        assertEquals(OperationStatus.applied, appliedResults.single().status); assertEquals(CallState.connecting, applied.snapshot()?.state)

        val unknown = CallCoordinator(checkpoint)
        val unknownResults = RecoveredOperationReconciler(unknown) {
            CompletableFuture.completedFuture(ReconciliationOutcome.Unavailable(1_100))
        }.reconcile(1_050).toCompletableFuture().get()
        assertEquals(OperationStatus.unknown, unknownResults.single().status); assertEquals(CallState.incoming, unknown.snapshot()?.state)

        val expired = CallCoordinator(checkpoint)
        val expiredResults = RecoveredOperationReconciler(expired) {
            CompletableFuture.completedFuture(ReconciliationOutcome.Applied(5_100))
        }.reconcile(5_000).toCompletableFuture().get()
        assertEquals(OperationStatus.timedOut, expiredResults.single().status); assertEquals(CallState.incoming, expired.snapshot()?.state)
    }
}
