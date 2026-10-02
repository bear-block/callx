package dev.callx.telecom

/**
 * Connects framework video views to the video media adapter (ADR-0010). `CallxVideoView` attaches
 * its surface when it mounts and detaches it when it unmounts; the adapter renders into it once
 * the source exists. Without a video adapter, views stay empty. Main thread only.
 */
object CallxVideoSurfaces {
    private var adapter: CallxVideoAdapter? = null
    private val mounted = LinkedHashMap<CallxVideoSurface, Pair<String, VideoSource>>()

    /** [CallxBootstrap] installs the discovered adapter; hosts that bootstrap natively call this. */
    fun install(adapter: CallxVideoAdapter?) {
        if (adapter === this.adapter) return
        mounted.forEach { (surface, target) -> this.adapter?.detach(target.first, surface) }
        this.adapter = adapter
        mounted.forEach { (surface, target) -> adapter?.attach(target.first, target.second, surface) }
    }

    /** Shows [source] of [callId] in [surface], replacing what it showed before. */
    fun attach(callId: String, source: VideoSource, surface: CallxVideoSurface) {
        if (mounted[surface] == callId to source) return
        detach(surface)
        mounted[surface] = callId to source
        adapter?.attach(callId, source, surface)
    }

    fun detach(surface: CallxVideoSurface) {
        val target = mounted.remove(surface) ?: return
        adapter?.detach(target.first, surface)
    }
}
