package dev.callx.core

import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage

sealed interface PlatformActionOutcome {
    data class Applied(val completedAtMs: Long) : PlatformActionOutcome
    data class Rejected(val errorCode: String, val completedAtMs: Long) : PlatformActionOutcome
    data class TimedOut(val completedAtMs: Long) : PlatformActionOutcome
    data class ProviderReset(val completedAtMs: Long) : PlatformActionOutcome
}

class PlatformActionRegistry {
    private val buffered = mutableMapOf<String, PlatformActionOutcome>()
    private val waiters = mutableMapOf<String, CompletableFuture<PlatformActionOutcome>>()
    private val terminalIds = mutableSetOf<String>()
    @Synchronized fun outcome(operationId: String): CompletionStage<PlatformActionOutcome> {
        buffered.remove(operationId)?.let { return CompletableFuture.completedFuture(it) }
        return waiters.getOrPut(operationId) { CompletableFuture() }
    }
    @Synchronized fun complete(operationId: String, outcome: PlatformActionOutcome): Boolean {
        if (!terminalIds.add(operationId)) return false
        waiters.remove(operationId)?.complete(outcome) ?: run { buffered[operationId] = outcome }
        return true
    }
    fun timeout(operationId: String, atMs: Long) { complete(operationId, PlatformActionOutcome.TimedOut(atMs)) }
    @Synchronized fun providerReset(atMs: Long) {
        waiters.keys.toList().forEach { complete(it, PlatformActionOutcome.ProviderReset(atMs)) }
    }
}
