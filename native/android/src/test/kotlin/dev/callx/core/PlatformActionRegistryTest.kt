package dev.callx.core

import kotlin.test.*

class PlatformActionRegistryTest {
    @Test fun earlyCallbackAndFirstTerminalWins() {
        val registry = PlatformActionRegistry()
        assertTrue(registry.complete("early", PlatformActionOutcome.Applied(10)))
        assertEquals(PlatformActionOutcome.Applied(10), registry.outcome("early").toCompletableFuture().get())
        assertFalse(registry.complete("early", PlatformActionOutcome.Rejected("late", 11)))
    }
    @Test fun timeoutAndResetResumeWaitersAndDefeatLateCallbacks() {
        val registry = PlatformActionRegistry(); val timeout = registry.outcome("timeout").toCompletableFuture()
        registry.timeout("timeout", 20); assertEquals(PlatformActionOutcome.TimedOut(20), timeout.get())
        assertFalse(registry.complete("timeout", PlatformActionOutcome.Applied(21)))
        val reset = registry.outcome("reset").toCompletableFuture(); registry.providerReset(30)
        assertEquals(PlatformActionOutcome.ProviderReset(30), reset.get())
    }
}
