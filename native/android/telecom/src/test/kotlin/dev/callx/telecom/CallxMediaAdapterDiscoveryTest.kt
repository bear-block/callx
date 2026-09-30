package dev.callx.telecom

import kotlin.test.*

private class TestAdapter(override val apiVersion: Int = CALLX_MEDIA_API_VERSION) : CallxMediaAdapter {
    override fun start(callId: String, sink: CallxMediaSink) {}
    override fun stop(callId: String) {}
    override suspend fun setMuted(callId: String, muted: Boolean) = true
}
class TestFactory : CallxMediaAdapterFactory {
    var version = CALLX_MEDIA_API_VERSION
    override fun create(context: CallxAdapterContext): CallxMediaAdapter = TestAdapter(version)
}

class CallxMediaAdapterDiscoveryTest {
    private fun resolve(entries: Map<String, String?>, instantiate: (String) -> Any = { TestFactory() },
        create: (CallxMediaAdapterFactory) -> CallxMediaAdapter = { (it as TestFactory).let { f -> TestAdapter(f.version) } }) =
        CallxMediaAdapters.resolve(entries, instantiate, create)

    @Test fun noDeclaredAdapterMeansTheHostBringsItsOwnMedia() {
        assertEquals(CallxMediaAdapterResolution.None, resolve(mapOf("com.google.firebase.messaging" to "x")))
    }

    @Test fun oneDeclaredAdapterIsCreated() {
        val result = resolve(mapOf("dev.callx.media.livekit" to "dev.callx.livekit.LiveKitAdapterFactory"))
        assertIs<CallxMediaAdapterResolution.Resolved>(result)
        assertEquals("dev.callx.media.livekit", result.source)
    }

    @Test fun twoMediaAdaptersAreAConflictNotAChoice() {
        val result = resolve(mapOf("dev.callx.media.livekit" to "a", "dev.callx.media.agora" to "b"))
        assertEquals(CallxMediaAdapterResolution.Conflict(listOf("dev.callx.media.agora", "dev.callx.media.livekit")), result)
    }

    @Test fun brokenDeclarationsLeaveCallsWithoutMediaAndSayWhy() {
        val missing = resolve(mapOf("dev.callx.media.livekit" to null))
        assertIs<CallxMediaAdapterResolution.Unavailable>(missing)
        val notFound = resolve(mapOf("dev.callx.media.livekit" to "Nope"), instantiate = { throw ClassNotFoundException(it) })
        assertTrue((notFound as CallxMediaAdapterResolution.Unavailable).reason.contains("Nope"))
        val wrongType = resolve(mapOf("dev.callx.media.livekit" to "x"), instantiate = { "not a factory" })
        assertTrue((wrongType as CallxMediaAdapterResolution.Unavailable).reason.contains("not a CallxMediaAdapterFactory"))
        val failing = resolve(mapOf("dev.callx.media.livekit" to "x"), create = { error("no token source") })
        assertTrue((failing as CallxMediaAdapterResolution.Unavailable).reason.contains("no token source"))
    }

    @Test fun anAdapterForAnotherApiVersionIsUnavailable() {
        val result = resolve(mapOf("dev.callx.media.livekit" to "x"), create = { TestAdapter(apiVersion = 2) })
        assertTrue((result as CallxMediaAdapterResolution.Unavailable).reason.contains("API 2"))
    }
}
